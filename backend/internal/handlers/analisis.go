package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"lavadero-bi/backend/internal/models"
)

// resumenGeneral devuelve los KPIs de un rango de fechas, opcionalmente
// filtrados por hotel y/o item.
func (a *App) resumenGeneral(w http.ResponseWriter, r *http.Request) {
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
			AND ($3::int IS NULL OR r.hotel_id = $3)
			AND ($4::int IS NULL OR r.item_id = $4)
	`, fechaDesde, fechaHasta, hotelID, itemID).Scan(
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

// rankingHoteles devuelve el ranking de hoteles por volumen (o facturacion si
// `orden=facturacion`), con filtros opcionales de fecha, hotel e item.
func (a *App) rankingHoteles(w http.ResponseWriter, r *http.Request) {
	fechaDesde, fechaHasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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

	orden := r.URL.Query().Get("orden")
	if orden == "" {
		orden = "cantidad"
	}

	selectFacturacion := orden == "facturacion"

	itemID, err := optionalIntQuery(r, "item_id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ranking, err := a.rankingData(r.Context(), fechaDesde, fechaHasta, itemID, limit, selectFacturacion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular el ranking.")
		return
	}

	writeJSON(w, http.StatusOK, ranking)
}

// rankingData calcula el ranking de hoteles por volumen o facturacion.
// selectFacturacion ordena por facturacion; en caso contrario por cantidad.
func (a *App) rankingData(ctx context.Context, fechaDesde, fechaHasta *time.Time, itemID *int, limit int, selectFacturacion bool) ([]models.RankingHotel, error) {
	orderClause := "cantidad_total DESC"
	if selectFacturacion {
		orderClause = "facturacion DESC"
	}

	query := `
		SELECT h.id,
		       h.nombre,
		       COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int AS cantidad_total,
		       COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS facturacion
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
			AND ($3::int IS NULL OR r.item_id = $3)
		GROUP BY h.id, h.nombre
		ORDER BY ` + orderClause + `
		LIMIT $4`

	rows, err := a.db.Query(ctx, query, fechaDesde, fechaHasta, itemID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ranking := []models.RankingHotel{}
	for rows.Next() {
		var item models.RankingHotel
		if err := rows.Scan(&item.HotelID, &item.Hotel, &item.CantidadTotal, &item.Facturacion); err != nil {
			return nil, err
		}
		ranking = append(ranking, item)
	}
	return ranking, rows.Err()
}

// compararPeriodo compara las metricas del rango actual (fecha_desde..fecha_hasta)
// contra el periodo anterior de igual duracion. Devuelve ambos para calcular %.
func (a *App) compararPeriodo(w http.ResponseWriter, r *http.Request) {
	desde, hasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Si no se indico rango, usar el mes actual por defecto.
	now := time.Now()
	if desde == nil {
		d := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
		desde = &d
	}
	if hasta == nil {
		h := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
		hasta = &h
	}

	// Periodo anterior: misma cantidad de dias justo antes de `desde`.
	days := int(hasta.Sub(*desde).Hours()/24) + 1
	anteriorDesde := desde.AddDate(0, 0, -days)
	anteriorHasta := desde.AddDate(0, 0, -1)

	res := &models.ComparacionPeriodo{
		ActualAt:     desde,
		ActualHasta:  hasta,
		AnteriorDesde: &anteriorDesde,
		AnteriorHasta: &anteriorHasta,
	}

	query := `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.fecha >= $1 AND r.fecha <= $2
	`

	var (
		ct, cf, cr       int
		fact             float64
		ctA, cfA, crA    int
		factA            float64
	)

	if err := a.db.QueryRow(r.Context(), query, *desde, *hasta).Scan(&ct, &cf, &cr, &fact); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular el periodo actual.")
		return
	}
	if err := a.db.QueryRow(r.Context(), query, anteriorDesde, anteriorHasta).Scan(&ctA, &cfA, &crA, &factA); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular el periodo anterior.")
		return
	}

	res.CantidadTotalActual = ct
	res.CantidadFacturableActual = cf
	res.CantidadRelavadoActual = cr
	res.FacturacionActual = fact
	res.CantidadTotalAnterior = ctA
	res.CantidadFacturableAnterior = cfA
	res.CantidadRelavadoAnterior = crA
	res.FacturacionAnterior = factA

	writeJSON(w, http.StatusOK, res)
}

// tendencia devuelve la serie temporal agregada por dia, semana o mes.
func (a *App) tendencia(w http.ResponseWriter, r *http.Request) {
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

	periodo := r.URL.Query().Get("periodo")
	grupo := "daily"
	switch periodo {
	case "diario", "daily", "", "dia":
		grupo = "daily"
	case "semanal", "weekly", "semana":
		grupo = "weekly"
	case "mensual", "monthly", "mes":
		grupo = "monthly"
	default:
		writeError(w, http.StatusBadRequest, "periodo debe ser diario, semanal o mensual.")
		return
	}

	bucket := "to_char(r.fecha, 'YYYY-MM-DD')"
	switch grupo {
	case "weekly":
		bucket = "to_char(date_trunc('week', r.fecha), 'YYYY-MM-DD')"
	case "monthly":
		bucket = "to_char(date_trunc('month', r.fecha), 'YYYY-MM-DD')"
	}

	query := `
		SELECT ` + bucket + `,
		       COALESCE(SUM(r.cantidad), 0)::int,
		       COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
		       COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
			AND ($3::int IS NULL OR r.hotel_id = $3)
			AND ($4::int IS NULL OR r.item_id = $4)
		GROUP BY ` + bucket + `
		ORDER BY ` + bucket + ` ASC
	`

	rows, err := a.db.Query(r.Context(), query, fechaDesde, fechaHasta, hotelID, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo calcular la tendencia.")
		return
	}
	defer rows.Close()

	tendencia := []models.TendenciaRegistro{}
	for rows.Next() {
		var t models.TendenciaRegistro
		if err := rows.Scan(&t.Fecha, &t.CantidadTotal, &t.CantidadFacturable, &t.Facturacion); err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudo leer la tendencia.")
			return
		}
		tendencia = append(tendencia, t)
	}

	writeJSON(w, http.StatusOK, tendencia)
}

// exportarCSV genera un reporte descargable en formato CSV con el resumen y el
// ranking de hoteles del rango indicado. Ideal para abrir en Excel.
func (a *App) exportarCSV(w http.ResponseWriter, r *http.Request) {
	fechaDesde, fechaHasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	itemID, _ := optionalIntQuery(r, "item_id")

	orden := r.URL.Query().Get("orden")
	if orden == "" {
		orden = "cantidad"
	}
	selectFacturacion := orden == "facturacion"

	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	ranking, err := a.rankingData(r.Context(), fechaDesde, fechaHasta, itemID, limit, selectFacturacion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo generar el reporte.")
		return
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // BOM UTF-8 para que Excel respete acentos
	csv := csv.NewWriter(&buf)

	// Cabecera y resumen
	desdeStr, hastaStr := "-", "-"
	if fechaDesde != nil {
		desdeStr = fechaDesde.Format("2006-01-02")
	}
	if fechaHasta != nil {
		hastaStr = fechaHasta.Format("2006-01-02")
	}
	csv.Write([]string{"REPORTE LAVADERO BI - POSEIDON SERVICIO DE LAVANDERIA SRL"})
	csv.Write([]string{"Periodo", desdeStr, "al", hastaStr})
	csv.Write([]string{})

	csv.Write([]string{"RANKING DE HOTELES", "", "", ""})
	csv.Write([]string{"#", "Hotel", "Prendas", "Facturacion Estimada"})
	for i, row := range ranking {
		precio := fmt.Sprintf("%.2f", row.Facturacion)
		csv.Write([]string{strconv.Itoa(i + 1), row.Hotel, strconv.Itoa(row.CantidadTotal), precio})
		csv.Flush()
	}

	csv.Flush()
	if err := csv.Error(); err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo generar el reporte.")
		return
	}

	filename := fmt.Sprintf("reporte_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(buf.Bytes())
}
