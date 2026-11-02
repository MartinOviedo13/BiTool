package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"lavadero-bi/backend/internal/models"
	"lavadero-bi/backend/internal/services"
)

const (
	maxRemitoUploadSize = 15 * 1024 * 1024  // 15 MB para foto individual
	maxLoteUploadSize   = 250 * 1024 * 1024 // 250 MB para lote masivo
	remitosTmpDir       = "uploads/remitos_tmp"
	concurrenciaLote    = 3 // Hasta 3 llamadas simultáneas a Gemini
)

// ensureTmpDir crea el directorio para fotos temporales si no existe.
func ensureTmpDir() (string, error) {
	dir := os.Getenv("REMITOS_TMP_DIR")
	if dir == "" {
		dir = remitosTmpDir
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// extractRemitoIA maneja la subida de una foto de remito, análisis con Gemini y creación del borrador.
func (a *App) extractRemitoIA(w http.ResponseWriter, r *http.Request) {
	claims, _ := r.Context().Value(claimsKey).(*jwtClaims)

	if err := r.ParseMultipartForm(maxRemitoUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "El archivo supera el tamaño máximo permitido (15 MB) o el formulario es inválido.")
		return
	}

	file, header, err := r.FormFile("imagen")
	if err != nil {
		file, header, err = r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "No se adjuntó ninguna imagen. Envíe el archivo en el campo 'imagen' o 'file'.")
			return
		}
	}
	defer file.Close()

	imgData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo leer el archivo de imagen.")
		return
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(imgData)
	}

	// Guardar archivo temporal en disco
	tmpDir, err := ensureTmpDir()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo preparar el directorio temporal.")
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	tmpFileName := fmt.Sprintf("remito_%d_%s%s", time.Now().UnixNano(), randomString(6), ext)
	savedPath := filepath.Join(tmpDir, tmpFileName)
	if err := os.WriteFile(savedPath, imgData, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo guardar la imagen temporal en disco.")
		return
	}

	// Obtener catálogos activos de la base de datos
	hoteles, err := a.cargarHotelesActivos(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo consultar el catálogo de hoteles.")
		return
	}

	items, err := a.cargarItemsActivos(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo consultar el catálogo de prendas.")
		return
	}

	// Cliente Gemini
	gemini := services.NewGeminiClient()
	if gemini.APIKey == "" {
		writeError(w, http.StatusServiceUnavailable, "El servicio de IA no está configurado (falta GEMINI_API_KEY).")
		return
	}

	extracted, rawJSON, extractErr := gemini.ExtractRemitoImage(r.Context(), imgData, mimeType, hoteles, items)

	// Resolver lote_id si fue enviado
	loteID := strings.TrimSpace(r.FormValue("lote_id"))
	var loteIDPtr *string
	if loteID != "" {
		loteIDPtr = &loteID
	}

	var userID *int
	if claims != nil && claims.UserID > 0 {
		userID = &claims.UserID
	}

	// Si falló el análisis con Gemini, dejamos el borrador en estado 'error' o vacío para que el operario lo cargue a mano
	if extractErr != nil {
		borradorID, dbErr := a.guardarBorradorError(r.Context(), loteIDPtr, savedPath, mimeType, rawJSON, extractErr.Error(), userID)
		if dbErr != nil {
			writeError(w, http.StatusInternalServerError, "Error al registrar el borrador fallido en base de datos.")
			return
		}
		borrador, _ := a.obtenerBorradorCompleto(r.Context(), borradorID)
		writeJSON(w, http.StatusAccepted, map[string]any{
			"warning":  "La IA no pudo procesar con precisión la imagen, pero se creó el borrador para carga manual.",
			"borrador": borrador,
		})
		return
	}

	// Normalización y matching de seguridad adicional
	finalHotelID := matchHotel(extracted.HotelID, extracted.HotelDetectado, hoteles)

	// Override si el usuario o cliente especificó un hotel de antemano
	if reqHotelIDStr := r.FormValue("hotel_id"); reqHotelIDStr != "" {
		if hid, err := strconv.Atoi(reqHotelIDStr); err == nil && hid > 0 {
			finalHotelID = &hid
		}
	} else if claims != nil && claims.Rol == "cliente" && claims.HotelID != nil {
		finalHotelID = claims.HotelID
	}

	var fechaStr *string
	if strings.TrimSpace(extracted.Fecha) != "" {
		f := strings.TrimSpace(extracted.Fecha)
		fechaStr = &f
	} else {
		hoy := time.Now().Format("2006-01-02")
		fechaStr = &hoy
	}

	var numRemitoStr *string
	if strings.TrimSpace(extracted.NumeroRemito) != "" {
		nr := strings.TrimSpace(extracted.NumeroRemito)
		numRemitoStr = &nr
	}

	var obsStr *string
	if strings.TrimSpace(extracted.Observaciones) != "" {
		obs := strings.TrimSpace(extracted.Observaciones)
		obsStr = &obs
	}

	hotelNombreDet := strings.TrimSpace(extracted.HotelDetectado)

	// Insertar borrador en BD dentro de una transacción
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo iniciar transacción de guardado.")
		return
	}
	defer tx.Rollback(r.Context())

	var borradorID int
	err = tx.QueryRow(r.Context(), `
		INSERT INTO remito_borrador (
			lote_id, hotel_id, hotel_nombre_detectado, fecha, numero_remito, observaciones,
			estado, confianza_promedio, imagen_path, imagen_mime, gemini_raw_json, creado_por_id,
			creado_en, actualizado_en
		) VALUES (
			$1, $2, $3, $4::date, $5, $6,
			'pendiente_revision', $7, $8, $9, $10::jsonb, $11,
			NOW(), NOW()
		) RETURNING id
	`, loteIDPtr, finalHotelID, hotelNombreDet, fechaStr, numRemitoStr, obsStr,
		extracted.ConfianzaGeneral, savedPath, mimeType, nullableString(rawJSON), userID).Scan(&borradorID)
	if err != nil {
		writeDBError(w, err, "Error al insertar el remito borrador.")
		return
	}

	// Insertar renglones de items detectados
	for _, it := range extracted.Items {
		if it.Cantidad <= 0 && it.CantidadRelavado <= 0 && it.CantidadRota <= 0 {
			continue
		}
		matchedItemID := matchItem(it.ItemID, it.ItemNombreDetectado, items)
		dudoso := it.Dudoso || it.Confianza < 0.70 || matchedItemID == nil

		var notaPtr *string
		if strings.TrimSpace(it.Nota) != "" {
			n := strings.TrimSpace(it.Nota)
			notaPtr = &n
		}

		_, err := tx.Exec(r.Context(), `
			INSERT INTO remito_borrador_item (
				borrador_id, item_id, item_nombre_detectado, cantidad,
				cantidad_relavado, cantidad_rota, confianza, dudoso, nota
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, borradorID, matchedItemID, it.ItemNombreDetectado, it.Cantidad,
			it.CantidadRelavado, it.CantidadRota, it.Confianza, dudoso, notaPtr)
		if err != nil {
			writeDBError(w, err, "Error al insertar renglón del remito borrador.")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeDBError(w, err, "Error al confirmar guardado del borrador.")
		return
	}

	borradorCompleto, err := a.obtenerBorradorCompleto(r.Context(), borradorID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Borrador creado pero no se pudo formatear la respuesta.")
		return
	}

	writeJSON(w, http.StatusCreated, borradorCompleto)
}

// getRemitoBorrador devuelve un borrador por ID.
func (a *App) getRemitoBorrador(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID de borrador inválido.")
		return
	}

	borrador, err := a.obtenerBorradorCompleto(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "Borrador de remito no encontrado.")
			return
		}
		writeDBError(w, err, "Error al obtener el borrador.")
		return
	}

	writeJSON(w, http.StatusOK, borrador)
}

// listRemitosBorradores lista borradores filtrando opcionalmente por estado o lote_id.
func (a *App) listRemitosBorradores(w http.ResponseWriter, r *http.Request) {
	estado := strings.TrimSpace(r.URL.Query().Get("estado"))
	loteID := strings.TrimSpace(r.URL.Query().Get("lote_id"))

	query := `
		SELECT
			b.id, b.lote_id, b.hotel_id, b.hotel_nombre_detectado,
			TO_CHAR(b.fecha, 'YYYY-MM-DD') AS fecha, b.numero_remito, b.observaciones,
			b.estado, b.confianza_promedio, b.imagen_path, b.imagen_mime,
			b.error_mensaje, b.envio_id, b.creado_por_id, b.creado_en, b.actualizado_en,
			h.id, h.nombre, h.activo
		FROM remito_borrador b
		LEFT JOIN hoteles h ON h.id = b.hotel_id
		WHERE ($1 = '' OR b.estado = $1)
		  AND ($2 = '' OR b.lote_id = $2)
		ORDER BY b.id DESC
		LIMIT 100
	`

	rows, err := a.db.Query(r.Context(), query, estado, loteID)
	if err != nil {
		writeDBError(w, err, "Error al consultar los borradores.")
		return
	}
	defer rows.Close()

	list := make([]models.RemitoBorrador, 0)
	for rows.Next() {
		var b models.RemitoBorrador
		var h models.Hotel
		var hID *int
		var hNom *string
		var hAct *bool

		err := rows.Scan(
			&b.ID, &b.LoteID, &b.HotelID, &b.HotelNombreDetectado,
			&b.Fecha, &b.NumeroRemito, &b.Observaciones,
			&b.Estado, &b.ConfianzaPromedio, &b.ImagenPath, &b.ImagenMime,
			&b.ErrorMensaje, &b.EnvioID, &b.CreadoPorID, &b.CreadoEn, &b.ActualizadoEn,
			&hID, &hNom, &hAct,
		)
		if err != nil {
			writeDBError(w, err, "Error al leer borrador.")
			return
		}
		if hID != nil {
			h.ID = *hID
			if hNom != nil {
				h.Nombre = *hNom
			}
			if hAct != nil {
				h.Activo = *hAct
			}
			b.Hotel = &h
		}
		list = append(list, b)
	}

	writeJSON(w, http.StatusOK, list)
}

// serveRemitoBorradorImagen sirve la imagen asociada al borrador.
func (a *App) serveRemitoBorradorImagen(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID inválido.")
		return
	}

	var path string
	var mime string
	err = a.db.QueryRow(r.Context(), "SELECT COALESCE(imagen_path, ''), COALESCE(imagen_mime, 'image/jpeg') FROM remito_borrador WHERE id = $1", id).Scan(&path, &mime)
	if err != nil {
		writeError(w, http.StatusNotFound, "Borrador o imagen no encontrada.")
		return
	}

	if path == "" {
		writeError(w, http.StatusNotFound, "La imagen ya no está disponible.")
		return
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		writeError(w, http.StatusGone, "La imagen temporal ha sido eliminada o ya fue procesada.")
		return
	}

	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, path)
}

// updateRemitoBorrador permite modificar los datos del remito antes de confirmar.
func (a *App) updateRemitoBorrador(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID inválido.")
		return
	}

	var req models.UpdateRemitoBorradorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Cuerpo JSON inválido.")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo iniciar la transacción.")
		return
	}
	defer tx.Rollback(r.Context())

	// Actualizar cabecera
	_, err = tx.Exec(r.Context(), `
		UPDATE remito_borrador
		SET hotel_id = $1,
		    fecha = $2::date,
		    numero_remito = $3,
		    observaciones = $4,
		    actualizado_en = NOW()
		WHERE id = $5
	`, req.HotelID, req.Fecha, req.NumeroRemito, req.Observaciones, id)
	if err != nil {
		writeDBError(w, err, "Error al actualizar cabecera del borrador.")
		return
	}

	// Reemplazar items
	_, err = tx.Exec(r.Context(), "DELETE FROM remito_borrador_item WHERE borrador_id = $1", id)
	if err != nil {
		writeDBError(w, err, "Error al limpiar items anteriores.")
		return
	}

	for _, it := range req.Items {
		if it.Cantidad <= 0 && it.CantidadRelavado <= 0 && it.CantidadRota <= 0 {
			continue
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO remito_borrador_item (
				borrador_id, item_id, item_nombre_detectado, cantidad,
				cantidad_relavado, cantidad_rota, confianza, dudoso, nota
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, id, it.ItemID, it.ItemNombreDetectado, it.Cantidad,
			it.CantidadRelavado, it.CantidadRota, it.Confianza, it.Dudoso, it.Nota)
		if err != nil {
			writeDBError(w, err, "Error al guardar items modificados.")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeDBError(w, err, "Error al confirmar actualización.")
		return
	}

	actualizado, err := a.obtenerBorradorCompleto(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error al recargar borrador.")
		return
	}

	writeJSON(w, http.StatusOK, actualizado)
}

// confirmarRemitoBorrador convierte el borrador en un remito/envío real y elimina la imagen temporal.
func (a *App) confirmarRemitoBorrador(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID inválido.")
		return
	}

	borrador, err := a.obtenerBorradorCompleto(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Borrador no encontrado.")
		return
	}

	if borrador.Estado == "confirmado" {
		writeError(w, http.StatusBadRequest, "Este remito ya ha sido confirmado previamente.")
		return
	}

	if borrador.HotelID == nil || *borrador.HotelID <= 0 {
		writeError(w, http.StatusBadRequest, "Debe seleccionar un hotel válido antes de confirmar.")
		return
	}

	if borrador.Fecha == nil || *borrador.Fecha == "" {
		writeError(w, http.StatusBadRequest, "Debe indicar una fecha válida.")
		return
	}

	if len(borrador.Items) == 0 {
		writeError(w, http.StatusBadRequest, "El remito debe tener al menos una prenda cargada.")
		return
	}

	// Crear el envío real con sus detalles usando transacción
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error al iniciar transacción.")
		return
	}
	defer tx.Rollback(r.Context())

	hotelID := *borrador.HotelID
	fechaParsed, err := time.Parse("2006-01-02", *borrador.Fecha)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Formato de fecha inválido.")
		return
	}

	numRemito := ""
	if borrador.NumeroRemito != nil {
		numRemito = *borrador.NumeroRemito
	}

	var envioID int
	var codigoQR string

	// Reutilizar o insertar en envios
	if numRemito != "" {
		_ = tx.QueryRow(r.Context(), "SELECT id, codigo_qr FROM envios WHERE hotel_id = $1 AND numero_remito = $2 LIMIT 1", hotelID, numRemito).Scan(&envioID, &codigoQR)
	}

	if envioID > 0 {
		// Actualizar remito existente
		_, err = tx.Exec(r.Context(), `
			UPDATE envios
			SET fecha = $1, numero_remito = $2, observaciones = $3, estado = 'listo_para_retiro'
			WHERE id = $4
		`, fechaParsed, nullableString(numRemito), borrador.Observaciones, envioID)
		if err != nil {
			writeDBError(w, err, "Error al actualizar remito existente.")
			return
		}
		// Limpiar detalles viejos
		_, _ = tx.Exec(r.Context(), "DELETE FROM envio_detalles WHERE envio_id = $1", envioID)
	} else {
		// Generar nuevo código QR único
		codigoQR = fmt.Sprintf("REM-%d-%s-%s", hotelID, fechaParsed.Format("20060102"), randomString(4))
		err = tx.QueryRow(r.Context(), `
			INSERT INTO envios (hotel_id, fecha, codigo_qr, numero_remito, observaciones, estado, creado_en)
			VALUES ($1, $2, $3, $4, $5, 'listo_para_retiro', NOW())
			RETURNING id
		`, hotelID, fechaParsed, codigoQR, nullableString(numRemito), borrador.Observaciones).Scan(&envioID)
		if err != nil {
			writeDBError(w, err, "Error al crear el remito en el sistema.")
			return
		}
	}

	// Insertar detalles en envio_detalles y sumar total
	totalPrendas := 0
	for _, it := range borrador.Items {
		if it.ItemID == nil || *it.ItemID <= 0 {
			continue
		}
		if it.Cantidad <= 0 {
			continue
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO envio_detalles (envio_id, item_id, cantidad_declarada)
			VALUES ($1, $2, $3)
		`, envioID, *it.ItemID, it.Cantidad)
		if err != nil {
			writeDBError(w, err, "Error al guardar el detalle del remito.")
			return
		}
		totalPrendas += it.Cantidad
	}

	// Marcar borrador como confirmado
	_, err = tx.Exec(r.Context(), `
		UPDATE remito_borrador
		SET estado = 'confirmado', envio_id = $1, actualizado_en = NOW()
		WHERE id = $2
	`, envioID, id)
	if err != nil {
		writeDBError(w, err, "Error al actualizar estado del borrador.")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeDBError(w, err, "Error al confirmar remito.")
		return
	}

	// Borrado físico de la imagen temporal para liberar espacio según la directiva
	if borrador.ImagenPath != nil && *borrador.ImagenPath != "" {
		_ = os.Remove(*borrador.ImagenPath)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"envio_id":      envioID,
		"codigo_qr":     codigoQR,
		"hotel_id":      hotelID,
		"fecha":         fechaParsed.Format("2006-01-02"),
		"numero_remito": numRemito,
		"total_prendas": totalPrendas,
		"mensaje":       "Remito confirmado exitosamente y foto temporal eliminada.",
	})
}

// deleteRemitoBorrador descarta un borrador y elimina su imagen física.
func (a *App) deleteRemitoBorrador(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID inválido.")
		return
	}

	var imgPath string
	_ = a.db.QueryRow(r.Context(), "SELECT COALESCE(imagen_path, '') FROM remito_borrador WHERE id = $1", id).Scan(&imgPath)

	_, err = a.db.Exec(r.Context(), "UPDATE remito_borrador SET estado = 'descartado', actualizado_en = NOW() WHERE id = $1", id)
	if err != nil {
		writeDBError(w, err, "Error al descartar el borrador.")
		return
	}

	if imgPath != "" {
		_ = os.Remove(imgPath)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"mensaje": "Borrador descartado y archivo temporal eliminado.",
	})
}

// ── Métodos para Lote Masivo (Fase 2) ───────────────────────────────────

type borradorEnCola struct {
	ID         int
	ImagenPath string
	ImagenMime string
}

// uploadRemitosLote recibe múltiples fotos de remitos y las encola para análisis en segundo plano.
func (a *App) uploadRemitosLote(w http.ResponseWriter, r *http.Request) {
	claims, _ := r.Context().Value(claimsKey).(*jwtClaims)

	if err := r.ParseMultipartForm(maxLoteUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "El lote supera el tamaño máximo permitido o el formulario es inválido.")
		return
	}

	var files []*multipart.FileHeader
	// Buscar en distintos nombres de campo posibles
	for _, field := range []string{"imagenes", "files", "imagen", "file"} {
		if headers, ok := r.MultipartForm.File[field]; ok && len(headers) > 0 {
			files = append(files, headers...)
		}
	}

	if len(files) == 0 {
		writeError(w, http.StatusBadRequest, "No se adjuntaron fotos en la petición. Use el campo 'imagenes' o 'files'.")
		return
	}

	tmpDir, err := ensureTmpDir()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo preparar el directorio temporal.")
		return
	}

	loteID := fmt.Sprintf("LOTE-%s-%s", time.Now().Format("20060102-150405"), randomString(4))

	var userID *int
	if claims != nil && claims.UserID > 0 {
		userID = &claims.UserID
	}

	// Cargar catálogos
	hoteles, err := a.cargarHotelesActivos(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo cargar el catálogo de hoteles.")
		return
	}
	items, err := a.cargarItemsActivos(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo cargar el catálogo de prendas.")
		return
	}

	borradoresParaProcesar := make([]borradorEnCola, 0, len(files))

	// Guardar cada archivo y crear registro en estado 'procesando'
	for _, header := range files {
		f, err := header.Open()
		if err != nil {
			continue
		}
		data, err := io.ReadAll(f)
		_ = f.Close()
		if err != nil || len(data) == 0 {
			continue
		}

		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" || mimeType == "application/octet-stream" {
			mimeType = http.DetectContentType(data)
		}

		ext := filepath.Ext(header.Filename)
		if ext == "" {
			ext = ".jpg"
		}
		savedName := fmt.Sprintf("remito_%d_%s%s", time.Now().UnixNano(), randomString(6), ext)
		savedPath := filepath.Join(tmpDir, savedName)

		if err := os.WriteFile(savedPath, data, 0644); err != nil {
			continue
		}

		var borradorID int
		err = a.db.QueryRow(r.Context(), `
			INSERT INTO remito_borrador (
				lote_id, estado, imagen_path, imagen_mime, creado_por_id,
				creado_en, actualizado_en
			) VALUES (
				$1, 'procesando', $2, $3, $4,
				NOW(), NOW()
			) RETURNING id
		`, loteID, savedPath, mimeType, userID).Scan(&borradorID)
		if err != nil {
			_ = os.Remove(savedPath)
			continue
		}

		borradoresParaProcesar = append(borradoresParaProcesar, borradorEnCola{
			ID:         borradorID,
			ImagenPath: savedPath,
			ImagenMime: mimeType,
		})
	}

	if len(borradoresParaProcesar) == 0 {
		writeError(w, http.StatusBadRequest, "No se pudo guardar ninguna de las fotos recibidas.")
		return
	}

	// Disparar procesamiento en segundo plano con semáforo de concurrencia
	go a.procesarColaLote(loteID, borradoresParaProcesar, hoteles, items)

	writeJSON(w, http.StatusAccepted, map[string]any{
		"lote_id":        loteID,
		"total_archivos": len(borradoresParaProcesar),
		"mensaje":        "Lote recibido exitosamente. El análisis de cada foto se está ejecutando en paralelo.",
	})
}

func (a *App) procesarColaLote(loteID string, itemsCola []borradorEnCola, hoteles []models.Hotel, items []models.Item) {
	sem := make(chan struct{}, concurrenciaLote)
	var wg sync.WaitGroup

	for _, item := range itemsCola {
		wg.Add(1)
		sem <- struct{}{} // Adquirir slot

		go func(it borradorEnCola) {
			defer wg.Done()
			defer func() { <-sem }() // Liberar slot

			ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
			defer cancel()

			a.procesarRemitoBorradorWorker(ctx, it.ID, it.ImagenPath, it.ImagenMime, hoteles, items)
		}(item)
	}

	wg.Wait()
}

func (a *App) procesarRemitoBorradorWorker(ctx context.Context, borradorID int, imgPath, mimeType string, hoteles []models.Hotel, items []models.Item) {
	data, err := os.ReadFile(imgPath)
	if err != nil {
		_, _ = a.db.Exec(context.Background(), `
			UPDATE remito_borrador
			SET estado = 'error', error_mensaje = 'No se pudo leer la imagen del disco', actualizado_en = NOW()
			WHERE id = $1
		`, borradorID)
		return
	}

	gemini := services.NewGeminiClient()
	if gemini.APIKey == "" {
		_, _ = a.db.Exec(context.Background(), `
			UPDATE remito_borrador
			SET estado = 'error', error_mensaje = 'GEMINI_API_KEY no configurada', actualizado_en = NOW()
			WHERE id = $1
		`, borradorID)
		return
	}

	extracted, rawJSON, err := gemini.ExtractRemitoImage(ctx, data, mimeType, hoteles, items)
	if err != nil {
		_, _ = a.db.Exec(context.Background(), `
			UPDATE remito_borrador
			SET estado = 'error', error_mensaje = $1, gemini_raw_json = $2::jsonb, actualizado_en = NOW()
			WHERE id = $3
		`, err.Error(), nullableString(rawJSON), borradorID)
		return
	}

	// Normalización
	finalHotelID := matchHotel(extracted.HotelID, extracted.HotelDetectado, hoteles)
	hotelNombreDet := strings.TrimSpace(extracted.HotelDetectado)

	var fechaStr *string
	if strings.TrimSpace(extracted.Fecha) != "" {
		f := strings.TrimSpace(extracted.Fecha)
		fechaStr = &f
	} else {
		hoy := time.Now().Format("2006-01-02")
		fechaStr = &hoy
	}

	var numRemitoStr *string
	if strings.TrimSpace(extracted.NumeroRemito) != "" {
		nr := strings.TrimSpace(extracted.NumeroRemito)
		numRemitoStr = &nr
	}

	var obsStr *string
	if strings.TrimSpace(extracted.Observaciones) != "" {
		obs := strings.TrimSpace(extracted.Observaciones)
		obsStr = &obs
	}

	tx, txErr := a.db.Begin(context.Background())
	if txErr != nil {
		return
	}
	defer tx.Rollback(context.Background())

	// Actualizar cabecera del borrador a 'pendiente_revision'
	_, txErr = tx.Exec(context.Background(), `
		UPDATE remito_borrador
		SET hotel_id = $1,
		    hotel_nombre_detectado = $2,
		    fecha = $3::date,
		    numero_remito = $4,
		    observaciones = $5,
		    confianza_promedio = $6,
		    gemini_raw_json = $7::jsonb,
		    estado = 'pendiente_revision',
		    actualizado_en = NOW()
		WHERE id = $8
	`, finalHotelID, hotelNombreDet, fechaStr, numRemitoStr, obsStr,
		extracted.ConfianzaGeneral, nullableString(rawJSON), borradorID)
	if txErr != nil {
		return
	}

	// Insertar items detectados
	for _, it := range extracted.Items {
		if it.Cantidad <= 0 && it.CantidadRelavado <= 0 && it.CantidadRota <= 0 {
			continue
		}
		matchedItemID := matchItem(it.ItemID, it.ItemNombreDetectado, items)
		dudoso := it.Dudoso || it.Confianza < 0.70 || matchedItemID == nil

		var notaPtr *string
		if strings.TrimSpace(it.Nota) != "" {
			n := strings.TrimSpace(it.Nota)
			notaPtr = &n
		}

		_, txErr = tx.Exec(context.Background(), `
			INSERT INTO remito_borrador_item (
				borrador_id, item_id, item_nombre_detectado, cantidad,
				cantidad_relavado, cantidad_rota, confianza, dudoso, nota
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, borradorID, matchedItemID, it.ItemNombreDetectado, it.Cantidad,
			it.CantidadRelavado, it.CantidadRota, it.Confianza, dudoso, notaPtr)
		if txErr != nil {
			return
		}
	}

	_ = tx.Commit(context.Background())
}

// getLoteStatus devuelve el progreso y los borradores asociados a un lote.
func (a *App) getLoteStatus(w http.ResponseWriter, r *http.Request) {
	loteID := strings.TrimSpace(chi.URLParam(r, "id"))
	if loteID == "" {
		writeError(w, http.StatusBadRequest, "Falta lote_id en la ruta.")
		return
	}

	query := `
		SELECT
			b.id, b.lote_id, b.hotel_id, b.hotel_nombre_detectado,
			TO_CHAR(b.fecha, 'YYYY-MM-DD') AS fecha, b.numero_remito, b.observaciones,
			b.estado, b.confianza_promedio, b.imagen_path, b.imagen_mime,
			b.error_mensaje, b.envio_id, b.creado_por_id, b.creado_en, b.actualizado_en,
			h.id, h.nombre, h.activo
		FROM remito_borrador b
		LEFT JOIN hoteles h ON h.id = b.hotel_id
		WHERE b.lote_id = $1
		ORDER BY b.id ASC
	`

	rows, err := a.db.Query(r.Context(), query, loteID)
	if err != nil {
		writeDBError(w, err, "Error al consultar los borradores del lote.")
		return
	}
	defer rows.Close()

	borradores := make([]models.RemitoBorrador, 0)
	total := 0
	procesados := 0
	pendientes := 0
	conError := 0

	for rows.Next() {
		var b models.RemitoBorrador
		var h models.Hotel
		var hID *int
		var hNom *string
		var hAct *bool

		err := rows.Scan(
			&b.ID, &b.LoteID, &b.HotelID, &b.HotelNombreDetectado,
			&b.Fecha, &b.NumeroRemito, &b.Observaciones,
			&b.Estado, &b.ConfianzaPromedio, &b.ImagenPath, &b.ImagenMime,
			&b.ErrorMensaje, &b.EnvioID, &b.CreadoPorID, &b.CreadoEn, &b.ActualizadoEn,
			&hID, &hNom, &hAct,
		)
		if err != nil {
			writeDBError(w, err, "Error al leer datos de un borrador.")
			return
		}
		if hID != nil {
			h.ID = *hID
			if hNom != nil {
				h.Nombre = *hNom
			}
			if hAct != nil {
				h.Activo = *hAct
			}
			b.Hotel = &h
		}

		total++
		switch b.Estado {
		case "procesando":
			pendientes++
		case "error":
			conError++
			procesados++
		default:
			procesados++
		}

		borradores = append(borradores, b)
	}

	if total == 0 {
		writeError(w, http.StatusNotFound, "Lote no encontrado.")
		return
	}

	// Cargar items de cada borrador
	for i := range borradores {
		if borradores[i].Estado != "procesando" {
			itemRows, err := a.db.Query(r.Context(), `
				SELECT
					bi.id, bi.borrador_id, bi.item_id, bi.item_nombre_detectado,
					bi.cantidad, bi.cantidad_relavado, bi.cantidad_rota,
					bi.confianza, bi.dudoso, bi.nota,
					i.id, i.nombre, i.precio_unitario, i.se_factura, i.sector, i.activo
				FROM remito_borrador_item bi
				LEFT JOIN items i ON i.id = bi.item_id
				WHERE bi.borrador_id = $1
				ORDER BY bi.id ASC
			`, borradores[i].ID)
			if err == nil {
				items := make([]models.RemitoBorradorItem, 0)
				for itemRows.Next() {
					var bi models.RemitoBorradorItem
					var it models.Item
					var itID *int
					var itNom *string
					var itPrecio *float64
					var itFact *bool
					var itSec *string
					var itAct *bool

					_ = itemRows.Scan(
						&bi.ID, &bi.BorradorID, &bi.ItemID, &bi.ItemNombreDetectado,
						&bi.Cantidad, &bi.CantidadRelavado, &bi.CantidadRota,
						&bi.Confianza, &bi.Dudoso, &bi.Nota,
						&itID, &itNom, &itPrecio, &itFact, &itSec, &itAct,
					)
					if itID != nil {
						it.ID = *itID
						if itNom != nil {
							it.Nombre = *itNom
						}
						it.PrecioUnitario = itPrecio
						if itFact != nil {
							it.SeFactura = *itFact
						}
						if itSec != nil {
							it.Sector = *itSec
						}
						if itAct != nil {
							it.Activo = *itAct
						}
						bi.Item = &it
					}
					items = append(items, bi)
				}
				itemRows.Close()
				borradores[i].Items = items
			}
		}
	}

	resp := models.LoteProcesamientoResponse{
		LoteID:     loteID,
		Total:      total,
		Procesados: procesados,
		Pendientes: pendientes,
		ConError:   conError,
		Completado: pendientes == 0,
		Borradores: borradores,
	}

	writeJSON(w, http.StatusOK, resp)
}

// confirmarTodosOKLote confirma automáticamente los remitos del lote que sean 100% confiables y sin ambigüedades.
func (a *App) confirmarTodosOKLote(w http.ResponseWriter, r *http.Request) {
	loteID := strings.TrimSpace(chi.URLParam(r, "id"))
	if loteID == "" {
		writeError(w, http.StatusBadRequest, "Falta lote_id en la ruta.")
		return
	}

	// Obtener todos los borradores del lote en estado pendiente_revision
	query := `SELECT id FROM remito_borrador WHERE lote_id = $1 AND estado = 'pendiente_revision'`
	rows, err := a.db.Query(r.Context(), query, loteID)
	if err != nil {
		writeDBError(w, err, "Error al consultar borradores del lote.")
		return
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}

	confirmados := 0
	omitidos := 0

	for _, id := range ids {
		borrador, err := a.obtenerBorradorCompleto(r.Context(), id)
		if err != nil {
			omitidos++
			continue
		}

		// Validar que sea seguro para confirmación masiva automática
		if borrador.HotelID == nil || *borrador.HotelID <= 0 ||
			borrador.Fecha == nil || *borrador.Fecha == "" ||
			borrador.ConfianzaPromedio < 0.80 ||
			len(borrador.Items) == 0 {
			omitidos++
			continue
		}

		// Si tiene algún item dudoso o sin prenda identificada, requiere revisión manual
		tieneDudoso := false
		for _, it := range borrador.Items {
			if it.Dudoso || it.ItemID == nil || *it.ItemID <= 0 {
				tieneDudoso = true
				break
			}
		}
		if tieneDudoso {
			omitidos++
			continue
		}

		// Confirmar este remito
		if a.confirmarBorradorInterno(r.Context(), borrador) {
			confirmados++
		} else {
			omitidos++
		}
	}

	writeJSON(w, http.StatusOK, models.ConfirmarLoteOKResponse{
		LoteID:      loteID,
		Confirmados: confirmados,
		Omitidos:    omitidos,
		Mensaje:     fmt.Sprintf("Se confirmaron automáticamente %d remitos. Quedan %d con dudas o datos faltantes para revisión visual.", confirmados, omitidos),
	})
}

// confirmarBorradorInterno realiza la inserción en envios y eliminación de foto.
func (a *App) confirmarBorradorInterno(ctx context.Context, borrador *models.RemitoBorrador) bool {
	hotelID := *borrador.HotelID
	fechaParsed, err := time.Parse("2006-01-02", *borrador.Fecha)
	if err != nil {
		return false
	}

	numRemito := ""
	if borrador.NumeroRemito != nil {
		numRemito = *borrador.NumeroRemito
	}

	tx, err := a.db.Begin(ctx)
	if err != nil {
		return false
	}
	defer tx.Rollback(ctx)

	var envioID int
	var codigoQR string
	if numRemito != "" {
		_ = tx.QueryRow(ctx, "SELECT id, codigo_qr FROM envios WHERE hotel_id = $1 AND numero_remito = $2 LIMIT 1", hotelID, numRemito).Scan(&envioID, &codigoQR)
	}

	if envioID > 0 {
		_, err = tx.Exec(ctx, `
			UPDATE envios
			SET fecha = $1, numero_remito = $2, observaciones = $3, estado = 'listo_para_retiro'
			WHERE id = $4
		`, fechaParsed, nullableString(numRemito), borrador.Observaciones, envioID)
		if err != nil {
			return false
		}
		_, _ = tx.Exec(ctx, "DELETE FROM envio_detalles WHERE envio_id = $1", envioID)
	} else {
		codigoQR = fmt.Sprintf("REM-%d-%s-%s", hotelID, fechaParsed.Format("20060102"), randomString(4))
		err = tx.QueryRow(ctx, `
			INSERT INTO envios (hotel_id, fecha, codigo_qr, numero_remito, observaciones, estado, creado_en)
			VALUES ($1, $2, $3, $4, $5, 'listo_para_retiro', NOW())
			RETURNING id
		`, hotelID, fechaParsed, codigoQR, nullableString(numRemito), borrador.Observaciones).Scan(&envioID)
		if err != nil {
			return false
		}
	}

	for _, it := range borrador.Items {
		if it.ItemID == nil || *it.ItemID <= 0 || it.Cantidad <= 0 {
			continue
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO envio_detalles (envio_id, item_id, cantidad_declarada)
			VALUES ($1, $2, $3)
		`, envioID, *it.ItemID, it.Cantidad)
		if err != nil {
			return false
		}
	}

	_, err = tx.Exec(ctx, `
		UPDATE remito_borrador
		SET estado = 'confirmado', envio_id = $1, actualizado_en = NOW()
		WHERE id = $2
	`, envioID, borrador.ID)
	if err != nil {
		return false
	}

	if err := tx.Commit(ctx); err != nil {
		return false
	}

	if borrador.ImagenPath != nil && *borrador.ImagenPath != "" {
		_ = os.Remove(*borrador.ImagenPath)
	}

	return true
}

// deleteLote descarta todos los remitos de un lote y borra todas sus imágenes.
func (a *App) deleteLote(w http.ResponseWriter, r *http.Request) {
	loteID := strings.TrimSpace(chi.URLParam(r, "id"))
	if loteID == "" {
		writeError(w, http.StatusBadRequest, "Falta lote_id.")
		return
	}

	rows, err := a.db.Query(r.Context(), "SELECT COALESCE(imagen_path, '') FROM remito_borrador WHERE lote_id = $1", loteID)
	if err == nil {
		for rows.Next() {
			var p string
			if err := rows.Scan(&p); err == nil && p != "" {
				_ = os.Remove(p)
			}
		}
		rows.Close()
	}

	_, err = a.db.Exec(r.Context(), "UPDATE remito_borrador SET estado = 'descartado', actualizado_en = NOW() WHERE lote_id = $1", loteID)
	if err != nil {
		writeDBError(w, err, "Error al descartar el lote.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"mensaje": "Lote descartado y archivos temporales eliminados.",
	})
}

// Helpers internos

func (a *App) cargarHotelesActivos(ctx context.Context) ([]models.Hotel, error) {
	rows, err := a.db.Query(ctx, "SELECT id, nombre, activo FROM hoteles WHERE activo = true ORDER BY nombre ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hoteles []models.Hotel
	for rows.Next() {
		var h models.Hotel
		if err := rows.Scan(&h.ID, &h.Nombre, &h.Activo); err != nil {
			return nil, err
		}
		hoteles = append(hoteles, h)
	}
	return hoteles, nil
}

func (a *App) cargarItemsActivos(ctx context.Context) ([]models.Item, error) {
	rows, err := a.db.Query(ctx, "SELECT id, nombre, precio_unitario, se_factura, sector, activo FROM items WHERE activo = true ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.Item
	for rows.Next() {
		var it models.Item
		if err := rows.Scan(&it.ID, &it.Nombre, &it.PrecioUnitario, &it.SeFactura, &it.Sector, &it.Activo); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, nil
}

func (a *App) guardarBorradorError(ctx context.Context, loteID *string, imgPath, mimeType, rawJSON, errMsg string, userID *int) (int, error) {
	var id int
	err := a.db.QueryRow(ctx, `
		INSERT INTO remito_borrador (
			lote_id, estado, imagen_path, imagen_mime, gemini_raw_json, error_mensaje,
			creado_por_id, creado_en, actualizado_en
		) VALUES (
			$1, 'error', $2, $3, $4::jsonb, $5, $6, NOW(), NOW()
		) RETURNING id
	`, loteID, imgPath, mimeType, nullableString(rawJSON), errMsg, userID).Scan(&id)
	return id, err
}

func (a *App) obtenerBorradorCompleto(ctx context.Context, borradorID int) (*models.RemitoBorrador, error) {
	var b models.RemitoBorrador
	var h models.Hotel
	var hID *int
	var hNom *string
	var hAct *bool

	row := a.db.QueryRow(ctx, `
		SELECT
			b.id, b.lote_id, b.hotel_id, b.hotel_nombre_detectado,
			TO_CHAR(b.fecha, 'YYYY-MM-DD') AS fecha, b.numero_remito, b.observaciones,
			b.estado, b.confianza_promedio, b.imagen_path, b.imagen_mime,
			b.error_mensaje, b.envio_id, b.creado_por_id, b.creado_en, b.actualizado_en,
			h.id, h.nombre, h.activo
		FROM remito_borrador b
		LEFT JOIN hoteles h ON h.id = b.hotel_id
		WHERE b.id = $1
	`, borradorID)

	err := row.Scan(
		&b.ID, &b.LoteID, &b.HotelID, &b.HotelNombreDetectado,
		&b.Fecha, &b.NumeroRemito, &b.Observaciones,
		&b.Estado, &b.ConfianzaPromedio, &b.ImagenPath, &b.ImagenMime,
		&b.ErrorMensaje, &b.EnvioID, &b.CreadoPorID, &b.CreadoEn, &b.ActualizadoEn,
		&hID, &hNom, &hAct,
	)
	if err != nil {
		return nil, err
	}

	if hID != nil {
		h.ID = *hID
		if hNom != nil {
			h.Nombre = *hNom
		}
		if hAct != nil {
			h.Activo = *hAct
		}
		b.Hotel = &h
	}

	// Cargar items
	itemRows, err := a.db.Query(ctx, `
		SELECT
			bi.id, bi.borrador_id, bi.item_id, bi.item_nombre_detectado,
			bi.cantidad, bi.cantidad_relavado, bi.cantidad_rota,
			bi.confianza, bi.dudoso, bi.nota,
			i.id, i.nombre, i.precio_unitario, i.se_factura, i.sector, i.activo
		FROM remito_borrador_item bi
		LEFT JOIN items i ON i.id = bi.item_id
		WHERE bi.borrador_id = $1
		ORDER BY bi.id ASC
	`, borradorID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	b.Items = make([]models.RemitoBorradorItem, 0)
	for itemRows.Next() {
		var bi models.RemitoBorradorItem
		var it models.Item
		var itID *int
		var itNom *string
		var itPrecio *float64
		var itFact *bool
		var itSec *string
		var itAct *bool

		err := itemRows.Scan(
			&bi.ID, &bi.BorradorID, &bi.ItemID, &bi.ItemNombreDetectado,
			&bi.Cantidad, &bi.CantidadRelavado, &bi.CantidadRota,
			&bi.Confianza, &bi.Dudoso, &bi.Nota,
			&itID, &itNom, &itPrecio, &itFact, &itSec, &itAct,
		)
		if err != nil {
			return nil, err
		}
		if itID != nil {
			it.ID = *itID
			if itNom != nil {
				it.Nombre = *itNom
			}
			it.PrecioUnitario = itPrecio
			if itFact != nil {
				it.SeFactura = *itFact
			}
			if itSec != nil {
				it.Sector = *itSec
			}
			if itAct != nil {
				it.Activo = *itAct
			}
			bi.Item = &it
		}
		b.Items = append(b.Items, bi)
	}

	return &b, nil
}

func matchHotel(detectedID int, detectedName string, hoteles []models.Hotel) *int {
	if detectedID > 0 {
		for _, h := range hoteles {
			if h.ID == detectedID {
				return &h.ID
			}
		}
	}

	cleanDetected := normalizeString(detectedName)
	if cleanDetected == "" {
		return nil
	}

	for _, h := range hoteles {
		cleanH := normalizeString(h.Nombre)
		if cleanH == cleanDetected || strings.Contains(cleanH, cleanDetected) || strings.Contains(cleanDetected, cleanH) {
			return &h.ID
		}
	}
	return nil
}

func matchItem(detectedID int, detectedName string, items []models.Item) *int {
	if detectedID > 0 {
		for _, it := range items {
			if it.ID == detectedID {
				return &it.ID
			}
		}
	}

	cleanDetected := normalizeString(detectedName)
	if cleanDetected == "" {
		return nil
	}

	for _, it := range items {
		cleanIt := normalizeString(it.Nombre)
		if cleanIt == cleanDetected || strings.Contains(cleanIt, cleanDetected) || strings.Contains(cleanDetected, cleanIt) {
			return &it.ID
		}
	}
	return nil
}

func normalizeString(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	replacer := strings.NewReplacer(
		"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u",
		"ä", "a", "ë", "e", "ï", "i", "ö", "o", "ü", "u",
		".", "", ",", "", "-", "", "_", "", "/", "",
	)
	return replacer.Replace(s)
}
