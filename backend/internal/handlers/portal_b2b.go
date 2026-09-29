package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"lavadero-bi/backend/internal/models"
)

// createEnvio permite a un cliente (o admin) registrar un remito/envio diario.
func (a *App) createEnvio(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	var hotelID int
	if claims.Rol == "cliente" {
		if claims.HotelID == nil {
			writeError(w, http.StatusForbidden, "Tu usuario no tiene un hotel asignado.")
			return
		}
		hotelID = *claims.HotelID
	} else {
		hotelIDStr := r.URL.Query().Get("hotel_id")
		if hotelIDStr != "" {
			var err error
			hotelID, err = strconv.Atoi(hotelIDStr)
			if err != nil {
				writeError(w, http.StatusBadRequest, "hotel_id invalido.")
				return
			}
		} else if claims.HotelID != nil {
			hotelID = *claims.HotelID
		} else {
			writeError(w, http.StatusBadRequest, "Falta especificar hotel_id.")
			return
		}
	}

	var req models.CreateEnvioRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Cuerpo JSON invalido.")
		return
	}

	req.Fecha = strings.TrimSpace(req.Fecha)
	if req.Fecha == "" {
		req.Fecha = time.Now().Format("2006-01-02")
	}
	fecha, err := time.Parse("2006-01-02", req.Fecha)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Formato de fecha invalido (use YYYY-MM-DD).")
		return
	}

	if len(req.Detalles) == 0 {
		writeError(w, http.StatusBadRequest, "Debe incluir al menos un item con cantidad.")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error al iniciar transaccion.")
		return
	}
	defer tx.Rollback(r.Context())

	codigoQR := fmt.Sprintf("ENV-%d-%s-%d", hotelID, fecha.Format("20060102"), time.Now().Unix()%10000)

	var envioID int
	err = tx.QueryRow(r.Context(), `
		INSERT INTO envios (hotel_id, fecha, codigo_qr)
		VALUES ($1, $2, $3)
		ON CONFLICT (hotel_id, fecha)
		DO UPDATE SET codigo_qr = EXCLUDED.codigo_qr
		RETURNING id, codigo_qr
	`, hotelID, fecha, codigoQR).Scan(&envioID, &codigoQR)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error al crear envio: %v", err))
		return
	}

	_, err = tx.Exec(r.Context(), "DELETE FROM envio_detalles WHERE envio_id = $1", envioID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error actualizando detalles de envio.")
		return
	}

	for _, d := range req.Detalles {
		if d.CantidadDeclarada <= 0 {
			continue
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO envio_detalles (envio_id, item_id, cantidad_declarada)
			VALUES ($1, $2, $3)
			ON CONFLICT (envio_id, item_id)
			DO UPDATE SET cantidad_declarada = EXCLUDED.cantidad_declarada
		`, envioID, d.ItemID, d.CantidadDeclarada)
		if err != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error guardando item %d: %v", d.ItemID, err))
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "Error al confirmar envio.")
		return
	}

	envioCompleto, err := a.getEnvioByIDInternal(r.Context(), envioID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error recuperando el envio creado.")
		return
	}

	writeJSON(w, http.StatusCreated, envioCompleto)
}

// listEnvios devuelve los remitos/envios. Si es cliente, solo los de su hotel.
func (a *App) listEnvios(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	var hotelIDFilter *int
	if claims.Rol == "cliente" {
		hotelIDFilter = claims.HotelID
	} else {
		hotelParam := r.URL.Query().Get("hotel_id")
		if hotelParam != "" {
			if id, err := strconv.Atoi(hotelParam); err == nil {
				hotelIDFilter = &id
			}
		}
	}

	fechaParam := r.URL.Query().Get("fecha")

	query := `
		SELECT e.id, e.hotel_id, h.nombre, e.fecha, e.codigo_qr, e.creado_en
		FROM envios e
		JOIN hoteles h ON h.id = e.hotel_id
		WHERE ($1::int IS NULL OR e.hotel_id = $1)
		  AND ($2::date IS NULL OR e.fecha = $2::date)
		ORDER BY e.fecha DESC, e.creado_en DESC
		LIMIT 50
	`

	rows, err := a.db.Query(r.Context(), query, hotelIDFilter, nullableString(fechaParam))
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error consultando envios: %v", err))
		return
	}
	defer rows.Close()

	var lista []models.Envio
	for rows.Next() {
		var e models.Envio
		var h models.Hotel
		if err := rows.Scan(&e.ID, &e.HotelID, &h.Nombre, &e.Fecha, &e.CodigoQR, &e.CreadoEn); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo envios.")
			return
		}
		h.ID = e.HotelID
		e.Hotel = &h
		lista = append(lista, e)
	}

	if lista == nil {
		lista = []models.Envio{}
	}

	writeJSON(w, http.StatusOK, lista)
}

// getEnvioByQR busca un envio por su codigo QR escaneado.
func (a *App) getEnvioByQR(w http.ResponseWriter, r *http.Request) {
	codigoQR := chi.URLParam(r, "codigo_qr")
	if strings.TrimSpace(codigoQR) == "" {
		writeError(w, http.StatusBadRequest, "Codigo QR requerido.")
		return
	}

	var envioID int
	err := a.db.QueryRow(r.Context(), "SELECT id FROM envios WHERE codigo_qr = $1", codigoQR).Scan(&envioID)
	if err != nil {
		writeError(w, http.StatusNotFound, "Remito/Envio no encontrado con ese codigo QR.")
		return
	}

	envio, err := a.getEnvioByIDInternal(r.Context(), envioID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error recuperando detalles del envio.")
		return
	}

	writeJSON(w, http.StatusOK, envio)
}

func (a *App) getEnvioByIDInternal(ctx context.Context, envioID int) (*models.Envio, error) {
	var e models.Envio
	var h models.Hotel
	err := a.db.QueryRow(ctx, `
		SELECT e.id, e.hotel_id, h.nombre, e.fecha, e.codigo_qr, e.creado_en
		FROM envios e
		JOIN hoteles h ON h.id = e.hotel_id
		WHERE e.id = $1
	`, envioID).Scan(&e.ID, &e.HotelID, &h.Nombre, &e.Fecha, &e.CodigoQR, &e.CreadoEn)
	if err != nil {
		return nil, err
	}
	h.ID = e.HotelID
	e.Hotel = &h

	rows, err := a.db.Query(ctx, `
		SELECT ed.id, ed.envio_id, ed.item_id, i.nombre, ed.cantidad_declarada
		FROM envio_detalles ed
		JOIN items i ON i.id = ed.item_id
		WHERE ed.envio_id = $1
		ORDER BY i.nombre ASC
	`, envioID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var detalles []models.EnvioDetalle
	for rows.Next() {
		var d models.EnvioDetalle
		var itemNombre string
		if err := rows.Scan(&d.ID, &d.EnvioID, &d.ItemID, &itemNombre, &d.CantidadDeclarada); err != nil {
			return nil, err
		}
		d.Item = &models.Item{ID: d.ItemID, Nombre: itemNombre}
		detalles = append(detalles, d)
	}
	e.Detalles = detalles

	return &e, nil
}

// portalHotelDashboard genera el panel de control exclusivo para el hotel logueado.
func (a *App) portalHotelDashboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	var hotelID int
	if claims.Rol == "cliente" {
		if claims.HotelID == nil {
			writeError(w, http.StatusForbidden, "No tienes un hotel asignado.")
			return
		}
		hotelID = *claims.HotelID
	} else {
		hotelParam := r.URL.Query().Get("hotel_id")
		if hotelParam != "" {
			hotelID, _ = strconv.Atoi(hotelParam)
		}
		if hotelID == 0 && claims.HotelID != nil {
			hotelID = *claims.HotelID
		}
		if hotelID == 0 {
			writeError(w, http.StatusBadRequest, "Falta especificar hotel_id.")
			return
		}
	}

	var hotelNombre string
	err := a.db.QueryRow(r.Context(), "SELECT nombre FROM hoteles WHERE id = $1", hotelID).Scan(&hotelNombre)
	if err != nil {
		writeError(w, http.StatusNotFound, "Hotel no encontrado.")
		return
	}

	now := time.Now()
	inicioMes := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	finMes := inicioMes.AddDate(0, 1, -1)

	dashboard := models.PortalHotelDashboard{
		HotelNombre:      hotelNombre,
		RopaEnLavadero:   []models.PrendaEstadoHotel{},
		EnviosRecientes:  []models.Envio{},
		ConsumoPorPrenda: []models.PrendaConsumoHotel{},
	}

	// 1. Metricas del mes actual en registros
	err = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int as limpias,
			COALESCE(SUM(r.cantidad_relavado), 0)::int as relavados,
			COALESCE(SUM(r.cantidad_rota), 0)::int as rotas,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 as facturacion
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND r.fecha >= $2 AND r.fecha <= $3
	`, hotelID, inicioMes, finMes).Scan(
		&dashboard.PrendasFacturables,
		&dashboard.PrendasRelavadas,
		&dashboard.PrendasRotas,
		&dashboard.GastoEstimadoMes,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error calculando metricas: %v", err))
		return
	}

	dashboard.TotalPrendasMes = dashboard.PrendasFacturables + dashboard.PrendasRelavadas + dashboard.PrendasRotas
	if dashboard.TotalPrendasMes > 0 {
		dashboard.TasaRelavado = float64(dashboard.PrendasRelavadas) * 100.0 / float64(dashboard.TotalPrendasMes)
		dashboard.TasaRotura = float64(dashboard.PrendasRotas) * 100.0 / float64(dashboard.TotalPrendasMes)
	}

	// 2. Ropa que queda en el lavadero / estado por prenda
	estadoRows, err := a.db.Query(r.Context(), `
		SELECT
			i.id,
			i.nombre,
			COALESCE(SUM(r.cantidad_relavado), 0)::int as en_relavado,
			COALESCE(SUM(r.cantidad_rota), 0)::int as dadas_de_baja,
			COALESCE(SUM(r.cantidad), 0)::int as limpias_devueltas
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND r.fecha >= $2 AND r.fecha <= $3
		GROUP BY i.id, i.nombre
		HAVING COALESCE(SUM(r.cantidad_relavado), 0) > 0 OR COALESCE(SUM(r.cantidad_rota), 0) > 0 OR COALESCE(SUM(r.cantidad), 0) > 0
		ORDER BY i.nombre ASC
	`, hotelID, inicioMes, finMes)
	if err == nil {
		defer estadoRows.Close()
		for estadoRows.Next() {
			var pe models.PrendaEstadoHotel
			if err := estadoRows.Scan(&pe.ItemID, &pe.ItemNombre, &pe.EnRelavado, &pe.DadasDeBaja, &pe.LimpiasDevueltas); err == nil {
				dashboard.RopaEnLavadero = append(dashboard.RopaEnLavadero, pe)
			}
		}
	}

	// 3. Consumo y facturación por prenda
	consumoRows, err := a.db.Query(r.Context(), `
		SELECT
			i.id,
			i.nombre,
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND r.fecha >= $2 AND r.fecha <= $3
		GROUP BY i.id, i.nombre
		ORDER BY 3 DESC
	`, hotelID, inicioMes, finMes)
	if err == nil {
		defer consumoRows.Close()
		for consumoRows.Next() {
			var p models.PrendaConsumoHotel
			if err := consumoRows.Scan(&p.ItemID, &p.ItemNombre, &p.Cantidad, &p.Subtotal); err == nil {
				dashboard.ConsumoPorPrenda = append(dashboard.ConsumoPorPrenda, p)
			}
		}
	}

	// 4. Envios recientes del hotel
	envioRows, err := a.db.Query(r.Context(), `
		SELECT id, hotel_id, fecha, codigo_qr, creado_en
		FROM envios
		WHERE hotel_id = $1
		ORDER BY fecha DESC, creado_en DESC
		LIMIT 5
	`, hotelID)
	if err == nil {
		defer envioRows.Close()
		for envioRows.Next() {
			var e models.Envio
			if err := envioRows.Scan(&e.ID, &e.HotelID, &e.Fecha, &e.CodigoQR, &e.CreadoEn); err == nil {
				dashboard.EnviosRecientes = append(dashboard.EnviosRecientes, e)
			}
		}
	}

	writeJSON(w, http.StatusOK, dashboard)
}

// auditoriaComparacion cruza lo declarado por los hoteles en envios vs lo procesado por el lavadero en registros.
func (a *App) auditoriaComparacion(w http.ResponseWriter, r *http.Request) {
	fechaParam := r.URL.Query().Get("fecha")
	hotelParam := r.URL.Query().Get("hotel_id")

	var hotelID *int
	if hotelParam != "" {
		if id, err := strconv.Atoi(hotelParam); err == nil {
			hotelID = &id
		}
	}

	query := `
		WITH declarados AS (
			SELECT e.fecha, e.hotel_id, ed.item_id, SUM(ed.cantidad_declarada)::int AS declarada
			FROM envios e
			JOIN envio_detalles ed ON ed.envio_id = e.id
			WHERE ($1::date IS NULL OR e.fecha = $1::date)
			  AND ($2::int IS NULL OR e.hotel_id = $2)
			GROUP BY e.fecha, e.hotel_id, ed.item_id
		),
		procesados AS (
			SELECT
				r.fecha,
				r.hotel_id,
				r.item_id,
				SUM(r.cantidad)::int AS limpia,
				SUM(r.cantidad_relavado)::int AS relavado,
				SUM(r.cantidad_rota)::int AS rota
			FROM registros r
			WHERE ($1::date IS NULL OR r.fecha = $1::date)
			  AND ($2::int IS NULL OR r.hotel_id = $2)
			GROUP BY r.fecha, r.hotel_id, r.item_id
		),
		unidos AS (
			SELECT
				COALESCE(d.fecha, p.fecha) AS fecha,
				COALESCE(d.hotel_id, p.hotel_id) AS hotel_id,
				COALESCE(d.item_id, p.item_id) AS item_id,
				COALESCE(d.declarada, 0) AS declarada,
				COALESCE(p.limpia, 0) AS limpia,
				COALESCE(p.relavado, 0) AS relavado,
				COALESCE(p.rota, 0) AS rota
			FROM declarados d
			FULL OUTER JOIN procesados p
			  ON d.fecha = p.fecha AND d.hotel_id = p.hotel_id AND d.item_id = p.item_id
		)
		SELECT
			u.fecha::text,
			u.hotel_id,
			h.nombre AS hotel_nombre,
			u.item_id,
			i.nombre AS item_nombre,
			u.declarada,
			u.limpia,
			u.relavado,
			u.rota,
			(u.limpia + u.relavado + u.rota) AS total_contado,
			((u.limpia + u.relavado + u.rota) - u.declarada) AS diferencia
		FROM unidos u
		JOIN hoteles h ON h.id = u.hotel_id
		JOIN items i ON i.id = u.item_id
		ORDER BY u.fecha DESC, h.nombre ASC, i.nombre ASC
	`

	rows, err := a.db.Query(r.Context(), query, nullableString(fechaParam), hotelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error ejecutando auditoria: %v", err))
		return
	}
	defer rows.Close()

	var lista []models.AuditoriaItem
	for rows.Next() {
		var item models.AuditoriaItem
		if err := rows.Scan(
			&item.Fecha,
			&item.HotelID,
			&item.HotelNombre,
			&item.ItemID,
			&item.ItemNombre,
			&item.CantidadDeclarada,
			&item.CantidadLimpia,
			&item.CantidadRelavado,
			&item.CantidadRota,
			&item.TotalContado,
			&item.Diferencia,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo auditoria.")
			return
		}

		if item.CantidadDeclarada > 0 && item.TotalContado == 0 {
			item.Estado = "PENDIENTE_LAVADERO"
		} else if item.CantidadDeclarada == 0 && item.TotalContado > 0 {
			item.Estado = "SIN_REMITO"
		} else if item.Diferencia == 0 {
			item.Estado = "OK"
		} else if item.Diferencia < 0 {
			item.Estado = "FALTANTE"
		} else {
			item.Estado = "SOBRANTE"
		}

		lista = append(lista, item)
	}

	if lista == nil {
		lista = []models.AuditoriaItem{}
	}

	writeJSON(w, http.StatusOK, lista)
}

// registrarConteoAuditoria permite a operarios o admin registrar el conteo final de una prenda (limpias, relavado, rotas).
func (a *App) registrarConteoAuditoria(w http.ResponseWriter, r *http.Request) {
	var req models.ConteoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}
	if req.Fecha == "" || req.HotelID == 0 || req.ItemID == 0 {
		writeError(w, http.StatusBadRequest, "Fecha, hotel_id e item_id son requeridos.")
		return
	}

	_, err := a.db.Exec(r.Context(), `
		INSERT INTO registros (fecha, hotel_id, item_id, cantidad, cantidad_relavado, cantidad_rota)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (fecha, hotel_id, item_id)
		DO UPDATE SET
			cantidad = EXCLUDED.cantidad,
			cantidad_relavado = EXCLUDED.cantidad_relavado,
			cantidad_rota = EXCLUDED.cantidad_rota
	`, req.Fecha, req.HotelID, req.ItemID, req.CantidadLimpia, req.CantidadRelavado, req.CantidadRota)

	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error guardando conteo: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func nullableString(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
