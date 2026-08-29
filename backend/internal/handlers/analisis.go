package handlers

import (
	"net/http"
	"strconv"

	"lavadero-bi/backend/internal/models"
)

func (a *App) resumenGeneral(w http.ResponseWriter, r *http.Request) {
	fechaDesde, err := parseDateParam(r, "fecha_desde")
	if err != nil {
		writeError(w, http.StatusBadRequest, "fecha_desde debe tener formato YYYY-MM-DD.")
		return
	}
	fechaHasta, err := parseDateParam(r, "fecha_hasta")
	if err != nil {
		writeError(w, http.StatusBadRequest, "fecha_hasta debe tener formato YYYY-MM-DD.")
		return
	}

	var resumen models.ResumenGeneral
	resumen.FechaDesde = fechaDesde
	resumen.FechaHasta = fechaHasta

	err = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
	`, fechaDesde, fechaHasta).Scan(
		&resumen.CantidadTotal,
		&resumen.CantidadFacturable,
		&resumen.CantidadRelavado,
		&resumen.FacturacionEstimada,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular el resumen.")
		return
	}

	writeJSON(w, http.StatusOK, resumen)
}

func (a *App) rankingHoteles(w http.ResponseWriter, r *http.Request) {
	fechaDesde, err := parseDateParam(r, "fecha_desde")
	if err != nil {
		writeError(w, http.StatusBadRequest, "fecha_desde debe tener formato YYYY-MM-DD.")
		return
	}
	fechaHasta, err := parseDateParam(r, "fecha_hasta")
	if err != nil {
		writeError(w, http.StatusBadRequest, "fecha_hasta debe tener formato YYYY-MM-DD.")
		return
	}

	limit := 10
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 1 || parsed > 50 {
			writeError(w, http.StatusBadRequest, "limit debe ser un numero entre 1 y 50.")
			return
		}
		limit = parsed
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT h.id, h.nombre, COALESCE(SUM(r.cantidad), 0)::int AS cantidad_total
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE i.se_factura = true
			AND ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		ORDER BY cantidad_total DESC
		LIMIT $3
	`, fechaDesde, fechaHasta, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular el ranking.")
		return
	}
	defer rows.Close()

	ranking := []models.RankingHotel{}
	for rows.Next() {
		var item models.RankingHotel
		if err := rows.Scan(&item.HotelID, &item.Hotel, &item.CantidadTotal); err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudo leer el ranking.")
			return
		}
		ranking = append(ranking, item)
	}

	writeJSON(w, http.StatusOK, ranking)
}
