package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
	"lavadero-bi/backend/internal/models"
	"lavadero-bi/backend/internal/services"
)

type registroPayload struct {
	Fecha    *string `json:"fecha"`
	HotelID  *int    `json:"hotel_id"`
	ItemID   *int    `json:"item_id"`
	Cantidad *int    `json:"cantidad"`
}

type batchRegistroItem struct {
	Fecha    string `json:"fecha"`
	HotelID  int    `json:"hotel_id"`
	ItemID   int    `json:"item_id"`
	Cantidad int    `json:"cantidad"`
}

func (a *App) listRegistros(w http.ResponseWriter, r *http.Request) {
	fechaDesde, fechaHasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	hotelID, err := optionalIntQuery(r, "hotel_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	itemID, err := optionalIntQuery(r, "item_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT
			r.id, r.fecha, r.hotel_id, r.item_id, r.cantidad,
			h.id, h.nombre, h.activo,
			i.id, i.nombre, i.precio_unitario, i.se_factura
		FROM registros r
		JOIN hoteles h ON h.id = r.hotel_id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
			AND ($3::int IS NULL OR r.hotel_id = $3)
			AND ($4::int IS NULL OR r.item_id = $4)
		ORDER BY r.fecha DESC, r.id DESC
	`, fechaDesde, fechaHasta, hotelID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron listar los registros.")
		return
	}
	defer rows.Close()

	registros := []models.Registro{}
	for rows.Next() {
		var registro models.Registro
		if err := rows.Scan(
			&registro.ID,
			&registro.Fecha,
			&registro.HotelID,
			&registro.ItemID,
			&registro.Cantidad,
			&registro.Hotel.ID,
			&registro.Hotel.Nombre,
			&registro.Hotel.Activo,
			&registro.Item.ID,
			&registro.Item.Nombre,
			&registro.Item.PrecioUnitario,
			&registro.Item.SeFactura,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudo leer un registro.")
			return
		}
		registros = append(registros, registro)
	}

	writeJSON(w, http.StatusOK, registros)
}

func (a *App) createRegistro(w http.ResponseWriter, r *http.Request) {
	var payload registroPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}

	fecha, ok := parseRequiredPayloadDate(w, payload.Fecha)
	if !ok {
		return
	}
	if payload.HotelID == nil || payload.ItemID == nil || payload.Cantidad == nil {
		writeError(w, http.StatusBadRequest, "fecha, hotel_id, item_id y cantidad son obligatorios.")
		return
	}
	if *payload.Cantidad < 0 {
		writeError(w, http.StatusBadRequest, "La cantidad no puede ser negativa.")
		return
	}

	var registro models.Registro
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO registros (fecha, hotel_id, item_id, cantidad)
		VALUES ($1, $2, $3, $4)
		RETURNING id, fecha, hotel_id, item_id, cantidad
	`, fecha, payload.HotelID, payload.ItemID, payload.Cantidad).Scan(
		&registro.ID,
		&registro.Fecha,
		&registro.HotelID,
		&registro.ItemID,
		&registro.Cantidad,
	)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un registro para esa fecha, hotel e item.")
			return
		}
		if isFKViolation(err) {
			writeError(w, http.StatusBadRequest, fkMessage(fkConstraintName(err)))
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo crear el registro.")
		return
	}

	writeJSON(w, http.StatusCreated, registro)
}

func (a *App) createRegistrosBatch(w http.ResponseWriter, r *http.Request) {
	var items []batchRegistroItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido. Se esperaba una lista de registros.")
		return
	}

	if len(items) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{"inserted": 0})
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo iniciar la transaccion.")
		return
	}
	defer tx.Rollback(r.Context())

	stmt := `
		INSERT INTO registros (fecha, hotel_id, item_id, cantidad, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (fecha, hotel_id, item_id)
		DO UPDATE SET cantidad = EXCLUDED.cantidad, updated_at = now()
	`

	for _, item := range items {
		if item.Cantidad < 0 {
			writeError(w, http.StatusBadRequest, "La cantidad no puede ser negativa.")
			return
		}
		if item.HotelID <= 0 || item.ItemID <= 0 {
			writeError(w, http.StatusBadRequest, "hotel_id e item_id invalidos.")
			return
		}
		fecha, err := time.Parse("2006-01-02", item.Fecha)
		if err != nil {
			writeError(w, http.StatusBadRequest, "Formato de fecha invalido en uno de los registros (esperado YYYY-MM-DD).")
			return
		}

		if item.Cantidad == 0 {
			if _, err := tx.Exec(r.Context(), `
				DELETE FROM registros
				WHERE fecha = $1 AND hotel_id = $2 AND item_id = $3
			`, fecha, item.HotelID, item.ItemID); err != nil {
				writeError(w, http.StatusInternalServerError, "Error guardando registros en lote.")
				return
			}
			continue
		}

		if _, err := tx.Exec(r.Context(), stmt, fecha, item.HotelID, item.ItemID, item.Cantidad); err != nil {
			if isFKViolation(err) {
				writeError(w, http.StatusBadRequest, fkMessage(fkConstraintName(err)))
				return
			}
			writeError(w, http.StatusInternalServerError, "Error guardando registros en lote.")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "Error al confirmar transaccion.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"count":   len(items),
	})
}

func (a *App) updateRegistro(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID invalido.")
		return
	}

	var payload registroPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}
	if payload.Cantidad != nil && *payload.Cantidad < 0 {
		writeError(w, http.StatusBadRequest, "La cantidad no puede ser negativa.")
		return
	}

	var fecha *time.Time
	if payload.Fecha != nil {
		parsed, ok := parseRequiredPayloadDate(w, payload.Fecha)
		if !ok {
			return
		}
		fecha = &parsed
	}

	var registro models.Registro
	err = a.db.QueryRow(r.Context(), `
		UPDATE registros
		SET
			fecha = COALESCE($2, fecha),
			hotel_id = COALESCE($3, hotel_id),
			item_id = COALESCE($4, item_id),
			cantidad = COALESCE($5, cantidad),
			updated_at = now()
		WHERE id = $1
		RETURNING id, fecha, hotel_id, item_id, cantidad
	`, id, fecha, payload.HotelID, payload.ItemID, payload.Cantidad).Scan(
		&registro.ID,
		&registro.Fecha,
		&registro.HotelID,
		&registro.ItemID,
		&registro.Cantidad,
	)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "Registro no encontrado.")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un registro para esa fecha, hotel e item.")
			return
		}
		if isFKViolation(err) {
			writeError(w, http.StatusBadRequest, fkMessage(fkConstraintName(err)))
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo actualizar el registro.")
		return
	}

	writeJSON(w, http.StatusOK, registro)
}

func (a *App) deleteRegistro(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID invalido.")
		return
	}

	tag, err := a.db.Exec(r.Context(), `DELETE FROM registros WHERE id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo borrar el registro.")
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Registro no encontrado.")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func parseRequiredPayloadDate(w http.ResponseWriter, value *string) (time.Time, bool) {
	if value == nil {
		writeError(w, http.StatusBadRequest, "La fecha es obligatoria.")
		return time.Time{}, false
	}

	fecha, err := time.Parse("2006-01-02", *value)
	if err != nil {
		writeError(w, http.StatusBadRequest, "La fecha debe tener formato YYYY-MM-DD.")
		return time.Time{}, false
	}

	return fecha, true
}

type ImportRecordPreview struct {
	Fecha            string `json:"fecha"`
	HotelNombreLeido string `json:"hotel_nombre_leido"`
	HotelID          *int   `json:"hotel_id"`
	ItemNombreLeido  string `json:"item_nombre_leido"`
	ItemID           *int   `json:"item_id"`
	Cantidad         int    `json:"cantidad"`
	Mapeado          bool   `json:"mapeado"`
}

type ImportPreviewResponse struct {
	Registros []ImportRecordPreview `json:"registros"`
	Resumen   struct {
		TotalFilas           int `json:"total_filas"`
		MapeadosOk           int `json:"mapeados_ok"`
		PendientesReconciliar int `json:"pendientes_reconciliar"`
	} `json:"resumen"`
}

func cleanImportName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	replacer := strings.NewReplacer(
		"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u",
		"ñ", "n", ".", "", ",", "", "-", "", "_", "", " ", "",
	)
	return replacer.Replace(s)
}

func parseImportDate(val string) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return time.Now().Format("2006-01-02")
	}

	// Try if Excel integer date serial
	if days, err := strconv.Atoi(val); err == nil && days > 10000 && days < 100000 {
		epoch := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
		parsedDate := epoch.AddDate(0, 0, days)
		return parsedDate.Format("2006-01-02")
	}

	layouts := []string{
		"2006-01-02",
		"02/01/2006",
		"02-01-2006",
		"2006/01/02",
		"02/01/06",
		"2/1/2006",
		"2/1/06",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05-07:00",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, val); err == nil {
			return t.Format("2006-01-02")
		}
	}

	// Fallback to today's date
	return time.Now().Format("2006-01-02")
}

func (a *App) importPreview(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "No se pudo procesar el formulario.")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "El archivo 'file' es requerido.")
		return
	}
	defer file.Close()

	rows, errMsg := parseUploadedFile(file, header.Filename)
	if errMsg != "" {
		writeError(w, http.StatusBadRequest, errMsg)
		return
	}

	dateCol, hotelCol, itemCol, qtyCol := detectColumns(rows)
	records := rowsToRecords(rows, dateCol, hotelCol, itemCol, qtyCol)
	response := a.buildPreviewResponse(r.Context(), records)

	writeJSON(w, http.StatusOK, response)
}

// importExtract es el mismo flujo que importPreview pero usa la IA multimodal
// (Gemini) para leer la planilla: soporta fotos de la planilla en papel (.jpg,
// .png, .webp, .heic), PDF y tambien Excel/CSV. Para xlsx/csv, si la IA falla,
// se hace fallback al parser clasico.
func (a *App) importExtract(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "No se pudo procesar el formulario.")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "El archivo 'file' es requerido.")
		return
	}
	defer file.Close()

	client := services.NewGeminiClient()
	if client.APIKey == "" {
		writeError(w, http.StatusServiceUnavailable, "Modulo de IA no configurado: falta GEMINI_API_KEY en backend/.env.")
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "No se pudo leer el archivo.")
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	result, err := client.ExtractFile(r.Context(), data, mimeTypeForExt(ext), header.Filename)
	if err != nil {
		// Fallback al parser clasico para planillas Excel/CSV tradicionales.
		if ext == ".xlsx" || ext == ".csv" {
			if _, seekErr := file.Seek(0, io.SeekStart); seekErr == nil {
				rows, errMsg := parseUploadedFile(file, header.Filename)
				if errMsg == "" {
					dateCol, hotelCol, itemCol, qtyCol := detectColumns(rows)
					records := rowsToRecords(rows, dateCol, hotelCol, itemCol, qtyCol)
					writeJSON(w, http.StatusOK, a.buildPreviewResponse(r.Context(), records))
					return
				}
			}
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	fecha := strings.TrimSpace(result.Fecha)
	if fecha == "" {
		fecha = parseImportDate("")
	}
	records := make([]previewRecord, 0, len(result.Filas))
	for _, fila := range result.Filas {
		if fila.Cantidad < 0 {
			continue
		}
		records = append(records, previewRecord{
			fecha: fecha,
			hotel: strings.TrimSpace(fila.Hotel),
			item:  strings.TrimSpace(fila.Item),
			qty:   fila.Cantidad,
		})
	}

	response := a.buildPreviewResponse(r.Context(), records)
	writeJSON(w, http.StatusOK, response)
}

// previewRecord es una fila ya descompuesta en sus columnas semanticas.
type previewRecord struct {
	fecha string
	hotel string
	item  string
	qty   int
}

// mimeTypeForExt devuelve el MIME type para enviar el archivo al modelo.
func mimeTypeForExt(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".heic":
		return "image/heic"
	case ".pdf":
		return "application/pdf"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".csv":
		return "text/csv"
	}
	return "application/octet-stream"
}

// parseUploadedFile lee un archivo xlsx o csv y devuelve las filas (o un mensaje de error).
func parseUploadedFile(file io.Reader, filename string) ([][]string, string) {
	ext := strings.ToLower(filepath.Ext(filename))
	var rows [][]string

	switch ext {
	case ".xlsx":
		f, err := excelize.OpenReader(file)
		if err != nil {
			return nil, "No se pudo abrir el archivo Excel."
		}
		defer f.Close()

		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			return nil, "El archivo Excel no tiene hojas."
		}

		rows, err = f.GetRows(sheets[0])
		if err != nil {
			return nil, "No se pudieron leer las celdas del Excel."
		}
	case ".csv":
		reader := csv.NewReader(file)
		reader.LazyQuotes = true
		reader.FieldsPerRecord = -1

		allRows, err := reader.ReadAll()
		if err != nil {
			if seeker, ok := file.(io.Seeker); ok {
				_, _ = seeker.Seek(0, io.SeekStart)
			}
			// Try with semicolon separator
			reader = csv.NewReader(file)
			reader.Comma = ';'
			reader.LazyQuotes = true
			reader.FieldsPerRecord = -1
			allRows, err = reader.ReadAll()
			if err != nil {
				return nil, "No se pudo leer el archivo CSV."
			}
		}
		rows = allRows
	default:
		return nil, "Extension de archivo no soportada (solo .xlsx o .csv)."
	}

	if len(rows) < 2 {
		return nil, "El archivo debe tener al menos una fila de cabecera y una fila de datos."
	}

	return rows, ""
}

// detectColumns infiere las columnas de fecha, hotel, prenda y cantidad desde la cabecera.
func detectColumns(rows [][]string) (dateCol, hotelCol, itemCol, qtyCol int) {
	dateCol, hotelCol, itemCol, qtyCol = -1, -1, -1, -1
	for colIdx, val := range rows[0] {
		valClean := cleanImportName(val)
		if strings.Contains(valClean, "fecha") {
			dateCol = colIdx
		} else if strings.Contains(valClean, "hotel") || strings.Contains(valClean, "cliente") {
			hotelCol = colIdx
		} else if strings.Contains(valClean, "prenda") || strings.Contains(valClean, "item") || strings.Contains(valClean, "concepto") {
			itemCol = colIdx
		} else if strings.Contains(valClean, "cant") || strings.Contains(valClean, "volumen") {
			qtyCol = colIdx
		}
	}

	// Fallback to default indices if not found
	if dateCol == -1 {
		dateCol = 0
	}
	if hotelCol == -1 {
		hotelCol = 1
	}
	if itemCol == -1 {
		itemCol = 2
	}
	if qtyCol == -1 {
		qtyCol = 3
	}

	return
}

// rowsToRecords transforma las filas crudas del archivo en registros semanticos.
func rowsToRecords(rows [][]string, dateCol, hotelCol, itemCol, qtyCol int) []previewRecord {
	records := []previewRecord{}
	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) == 0 {
			continue
		}

		maxCol := dateCol
		if hotelCol > maxCol {
			maxCol = hotelCol
		}
		if itemCol > maxCol {
			maxCol = itemCol
		}
		if qtyCol > maxCol {
			maxCol = qtyCol
		}

		if len(row) <= maxCol {
			continue
		}

		rawHotel := row[hotelCol]
		rawItem := row[itemCol]
		rawQty := row[qtyCol]

		if strings.TrimSpace(rawHotel) == "" || strings.TrimSpace(rawItem) == "" {
			continue
		}

		qty := 0
		if q, err := strconv.Atoi(strings.TrimSpace(rawQty)); err == nil {
			qty = q
		}

		records = append(records, previewRecord{
			fecha: parseImportDate(row[dateCol]),
			hotel: strings.TrimSpace(rawHotel),
			item:  strings.TrimSpace(rawItem),
			qty:   qty,
		})
	}
	return records
}

// buildPreviewResponse mapea los registros semanticos contra el catalogo de la
// base de datos (fuzzy matching) y arma la respuesta de previsualizacion.
func (a *App) buildPreviewResponse(ctx context.Context, records []previewRecord) ImportPreviewResponse {
	// Fetch database catalog of hotels
	hotelesCatalog := make(map[string]int)
	hRows, err := a.db.Query(ctx, "SELECT id, nombre FROM hoteles WHERE activo = true")
	if err == nil {
		defer hRows.Close()
		for hRows.Next() {
			var id int
			var nombre string
			if err := hRows.Scan(&id, &nombre); err == nil {
				hotelesCatalog[cleanImportName(nombre)] = id
			}
		}
	}

	// Fetch database catalog of items
	itemsCatalog := make(map[string]int)
	iRows, err := a.db.Query(ctx, "SELECT id, nombre FROM items")
	if err == nil {
		defer iRows.Close()
		for iRows.Next() {
			var id int
			var nombre string
			if err := iRows.Scan(&id, &nombre); err == nil {
				itemsCatalog[cleanImportName(nombre)] = id
			}
		}
	}

	var response ImportPreviewResponse
	response.Registros = []ImportRecordPreview{}

	// Helper to find best hotel ID fuzzy match
	findHotelID := func(name string) *int {
		clean := cleanImportName(name)
		if clean == "" {
			return nil
		}
		if id, ok := hotelesCatalog[clean]; ok {
			return &id
		}
		for catalogClean, id := range hotelesCatalog {
			if strings.Contains(catalogClean, clean) || strings.Contains(clean, catalogClean) {
				return &id
			}
		}
		return nil
	}

	// Helper to find best item ID fuzzy match
	findItemID := func(name string) *int {
		clean := cleanImportName(name)
		if clean == "" {
			return nil
		}
		if id, ok := itemsCatalog[clean]; ok {
			return &id
		}
		for catalogClean, id := range itemsCatalog {
			if strings.Contains(catalogClean, clean) || strings.Contains(clean, catalogClean) {
				return &id
			}
		}
		return nil
	}

	totalFilas := 0
	mapeadosOk := 0
	pendientes := 0

	for _, rec := range records {
		hotelID := findHotelID(rec.hotel)
		itemID := findItemID(rec.item)

		isMapped := hotelID != nil && itemID != nil

		totalFilas++
		if isMapped {
			mapeadosOk++
		} else {
			pendientes++
		}

		response.Registros = append(response.Registros, ImportRecordPreview{
			Fecha:            rec.fecha,
			HotelNombreLeido: rec.hotel,
			HotelID:          hotelID,
			ItemNombreLeido:  rec.item,
			ItemID:           itemID,
			Cantidad:         rec.qty,
			Mapeado:          isMapped,
		})
	}

	response.Resumen.TotalFilas = totalFilas
	response.Resumen.MapeadosOk = mapeadosOk
	response.Resumen.PendientesReconciliar = pendientes

	return response
}
