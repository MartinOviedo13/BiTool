package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"lavadero-bi/backend/internal/models"
)

// fichaHotel360 devuelve la vista 360 integral de un hotel: KPIs de consumo,
// facturación, desglose por prenda para liquidación, tasas de relavado/rotura
// comparadas con el promedio general, trazabilidad de remitos y evolución mensual.
func (a *App) fichaHotel360(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	hotelIDStr := chi.URLParam(r, "id")
	hotelID, err := strconv.Atoi(hotelIDStr)
	if err != nil || hotelID <= 0 {
		writeError(w, http.StatusBadRequest, "ID de hotel invalido.")
		return
	}

	// Si es cliente, solo puede ver su propio hotel
	if claims.Rol == "cliente" {
		if claims.HotelID == nil || *claims.HotelID != hotelID {
			writeError(w, http.StatusForbidden, "No tienes permisos para ver la ficha de este hotel.")
			return
		}
	}

	var hotel models.Hotel
	err = a.db.QueryRow(r.Context(), "SELECT id, nombre, activo FROM hoteles WHERE id = $1", hotelID).
		Scan(&hotel.ID, &hotel.Nombre, &hotel.Activo)
	if err != nil {
		writeError(w, http.StatusNotFound, "Hotel no encontrado.")
		return
	}

	// Fechas del rango solicitado
	desde, hasta, err := parseDateRangeOrMonth(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ficha := models.FichaHotel360{
		HotelID:          hotel.ID,
		HotelNombre:      hotel.Nombre,
		Activo:           hotel.Activo,
		FechaDesde:       desde.Format("2006-01-02"),
		FechaHasta:       hasta.Format("2006-01-02"),
		ConsumoPrendas:   []models.ItemConsumoDetalle{},
		EvolucionMensual: []models.EvolucionMesHotel{},
		RopaEnLavadero:   []models.PrendaEstadoHotel{},
		EnviosRecientes:  []models.Envio{},
	}

	// 1. KPIs consolidados del hotel en el rango
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
	`, hotelID, desde, hasta).Scan(
		&ficha.PrendasFacturables,
		&ficha.PrendasRelavadas,
		&ficha.PrendasRotas,
		&ficha.FacturacionEstimada,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error calculando metricas del hotel.")
		return
	}

	ficha.TotalPrendas = ficha.PrendasFacturables + ficha.PrendasRelavadas + ficha.PrendasRotas
	if ficha.TotalPrendas > 0 {
		ficha.TasaRelavado = float64(ficha.PrendasRelavadas) * 100.0 / float64(ficha.TotalPrendas)
		ficha.TasaRotura = float64(ficha.PrendasRotas) * 100.0 / float64(ficha.TotalPrendas)
	}

	// 2. Tasa de relavado promedio general del lavadero en el mismo período (benchmarking)
	var totalGeneral, relavadoGeneral int
	_ = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(SUM(cantidad + cantidad_relavado + cantidad_rota), 0)::int,
			COALESCE(SUM(cantidad_relavado), 0)::int
		FROM registros
		WHERE fecha >= $1 AND fecha <= $2
	`, desde, hasta).Scan(&totalGeneral, &relavadoGeneral)
	if totalGeneral > 0 {
		ficha.TasaRelavadoPromedioTotal = float64(relavadoGeneral) * 100.0 / float64(totalGeneral)
	}

	// 3. Consumo y liquidación detallada por prenda
	consumoRows, err := a.db.Query(r.Context(), `
		SELECT
			i.id,
			i.nombre,
			i.precio_unitario,
			i.se_factura,
			COALESCE(SUM(r.cantidad), 0)::int as cant_facturable,
			COALESCE(SUM(r.cantidad_relavado), 0)::int as cant_relavado,
			COALESCE(SUM(r.cantidad_rota), 0)::int as cant_rota,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 as subtotal
		FROM items i
		JOIN registros r ON r.item_id = i.id AND r.hotel_id = $1 AND r.fecha >= $2 AND r.fecha <= $3
		GROUP BY i.id, i.nombre, i.precio_unitario, i.se_factura
		HAVING (COALESCE(SUM(r.cantidad), 0) + COALESCE(SUM(r.cantidad_relavado), 0) + COALESCE(SUM(r.cantidad_rota), 0)) > 0
		ORDER BY subtotal DESC, cant_facturable DESC
	`, hotelID, desde, hasta)
	if err == nil {
		defer consumoRows.Close()
		for consumoRows.Next() {
			var ic models.ItemConsumoDetalle
			if err := consumoRows.Scan(
				&ic.ItemID,
				&ic.ItemNombre,
				&ic.PrecioUnitario,
				&ic.SeFactura,
				&ic.CantidadFacturable,
				&ic.CantidadRelavado,
				&ic.CantidadRota,
				&ic.Subtotal,
			); err == nil {
				ficha.ConsumoPrendas = append(ficha.ConsumoPrendas, ic)
			}
		}
	}

	// 4. Remitos y trazabilidad de discrepancias en el período
	_ = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(COUNT(DISTINCT e.id), 0)::int,
			COALESCE(SUM(ed.cantidad_declarada), 0)::int
		FROM envios e
		LEFT JOIN envio_detalles ed ON ed.envio_id = e.id
		WHERE e.hotel_id = $1 AND e.fecha >= $2 AND e.fecha <= $3
	`, hotelID, desde, hasta).Scan(&ficha.TotalEnvios, &ficha.TotalPrendasDeclaradas)

	ficha.TotalPrendasAuditadas = ficha.TotalPrendas
	if ficha.TotalPrendasDeclaradas > 0 {
		ficha.DiferenciaTotal = ficha.TotalPrendasAuditadas - ficha.TotalPrendasDeclaradas
	}

	// 5. Evolución histórica mensual (últimos 12 meses para ver estacionalidad)
	mesesRows, err := a.db.Query(r.Context(), `
		SELECT
			to_char(date_trunc('month', r.fecha), 'YYYY-MM') AS mes,
			COALESCE(SUM(r.cantidad), 0)::int AS cant,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS fact,
			COALESCE(SUM(r.cantidad_relavado), 0)::int AS relav
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND r.fecha >= ($2::date - INTERVAL '11 months')
		GROUP BY date_trunc('month', r.fecha)
		ORDER BY mes ASC
	`, hotelID, hasta)
	if err == nil {
		defer mesesRows.Close()
		for mesesRows.Next() {
			var em models.EvolucionMesHotel
			if err := mesesRows.Scan(&em.Mes, &em.Cantidad, &em.Facturacion, &em.Relavado); err == nil {
				ficha.EvolucionMensual = append(ficha.EvolucionMensual, em)
			}
		}
	}

	// 6. Ropa en lavadero (relavados retenidos pendientes de reentrega)
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
		HAVING COALESCE(SUM(r.cantidad_relavado), 0) > 0 OR COALESCE(SUM(r.cantidad_rota), 0) > 0
		ORDER BY en_relavado DESC, i.nombre ASC
	`, hotelID, desde, hasta)
	if err == nil {
		defer estadoRows.Close()
		for estadoRows.Next() {
			var pe models.PrendaEstadoHotel
			if err := estadoRows.Scan(&pe.ItemID, &pe.ItemNombre, &pe.EnRelavado, &pe.DadasDeBaja, &pe.LimpiasDevueltas); err == nil {
				ficha.RopaEnLavadero = append(ficha.RopaEnLavadero, pe)
			}
		}
	}

	// 7. Envíos recientes del hotel con sus detalles
	envioRows, err := a.db.Query(r.Context(), `
		SELECT id, hotel_id, fecha, codigo_qr, creado_en
		FROM envios
		WHERE hotel_id = $1
		ORDER BY fecha DESC, creado_en DESC
		LIMIT 10
	`, hotelID)
	if err == nil {
		defer envioRows.Close()
		for envioRows.Next() {
			var e models.Envio
			if err := envioRows.Scan(&e.ID, &e.HotelID, &e.Fecha, &e.CodigoQR, &e.CreadoEn); err == nil {
				// Cargar detalles de cada envio
				detalles, _ := a.getEnvioDetallesInternal(r.Context(), e.ID)
				e.Detalles = detalles
				e.Hotel = &hotel
				ficha.EnviosRecientes = append(ficha.EnviosRecientes, e)
			}
		}
	}

	writeJSON(w, http.StatusOK, ficha)
}

func (a *App) getEnvioDetallesInternal(ctx context.Context, envioID int) ([]models.EnvioDetalle, error) {
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
		if err := rows.Scan(&d.ID, &d.EnvioID, &d.ItemID, &itemNombre, &d.CantidadDeclarada); err == nil {
			d.Item = &models.Item{ID: d.ItemID, Nombre: itemNombre}
			detalles = append(detalles, d)
		}
	}
	return detalles, nil
}

// exportarLiquidacionHotelCSV genera un archivo CSV formal con la liquidación
// mensual detallada de un hotel para abrir en Excel o archivar.
func (a *App) exportarLiquidacionHotelCSV(w http.ResponseWriter, r *http.Request) {
	hotelIDStr := chi.URLParam(r, "id")
	hotelID, err := strconv.Atoi(hotelIDStr)
	if err != nil || hotelID <= 0 {
		writeError(w, http.StatusBadRequest, "ID de hotel invalido.")
		return
	}

	var hotelNombre string
	err = a.db.QueryRow(r.Context(), "SELECT nombre FROM hoteles WHERE id = $1", hotelID).Scan(&hotelNombre)
	if err != nil {
		writeError(w, http.StatusNotFound, "Hotel no encontrado.")
		return
	}

	desde, hasta, err := parseDateRangeOrMonth(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT
			i.nombre,
			COALESCE(i.precio_unitario, 0)::float8,
			COALESCE(SUM(r.cantidad), 0)::int as limpias,
			COALESCE(SUM(r.cantidad_relavado), 0)::int as relavados,
			COALESCE(SUM(r.cantidad_rota), 0)::int as rotas,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 as subtotal
		FROM items i
		JOIN registros r ON r.item_id = i.id AND r.hotel_id = $1 AND r.fecha >= $2 AND r.fecha <= $3
		GROUP BY i.id, i.nombre, i.precio_unitario, i.se_factura
		HAVING (COALESCE(SUM(r.cantidad), 0) + COALESCE(SUM(r.cantidad_relavado), 0) + COALESCE(SUM(r.cantidad_rota), 0)) > 0
		ORDER BY subtotal DESC, limpias DESC
	`, hotelID, desde, hasta)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error generando liquidacion.")
		return
	}
	defer rows.Close()

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // BOM UTF-8
	csvWriter := csv.NewWriter(&buf)

	csvWriter.Write([]string{"LIQUIDACIÓN DE SERVICIOS - POSEIDÓN SERVICIO DE LAVANDERÍA SRL"})
	csvWriter.Write([]string{"Cliente / Hotel:", hotelNombre})
	csvWriter.Write([]string{"Período Liquidado:", desde.Format("2006-01-02"), "al", hasta.Format("2006-01-02")})
	csvWriter.Write([]string{"Fecha de Emisión:", time.Now().Format("2006-01-02 15:04:05")})
	csvWriter.Write([]string{})

	csvWriter.Write([]string{"Prenda / Servicio", "Precio Unitario ($)", "Cant. Facturable", "Relavado (s/cargo)", "Roturas", "Subtotal ($)"})

	var totalPrendas, totalRelav, totalRot int
	var granTotal float64

	for rows.Next() {
		var (
			nombre   string
			precio   float64
			limpias  int
			relavado int
			rotas    int
			subtotal float64
		)
		if err := rows.Scan(&nombre, &precio, &limpias, &relavado, &rotas, &subtotal); err == nil {
			totalPrendas += limpias
			totalRelav += relavado
			totalRot += rotas
			granTotal += subtotal

			csvWriter.Write([]string{
				nombre,
				fmt.Sprintf("%.2f", precio),
				strconv.Itoa(limpias),
				strconv.Itoa(relavado),
				strconv.Itoa(rotas),
				fmt.Sprintf("%.2f", subtotal),
			})
		}
	}

	csvWriter.Write([]string{})
	csvWriter.Write([]string{
		"TOTALES",
		"",
		strconv.Itoa(totalPrendas),
		strconv.Itoa(totalRelav),
		strconv.Itoa(totalRot),
		fmt.Sprintf("%.2f", granTotal),
	})

	csvWriter.Flush()
	if err := csvWriter.Error(); err != nil {
		writeError(w, http.StatusInternalServerError, "Error escribiendo CSV.")
		return
	}

	filename := fmt.Sprintf("liquidacion_%s_%s_%s.csv",
		stringsClean(hotelNombre),
		desde.Format("20060102"),
		hasta.Format("20060102"),
	)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.WriteHeader(http.StatusOK)
	w.Write(buf.Bytes())
}

func parseDateRangeOrMonth(r *http.Request) (time.Time, time.Time, error) {
	now := time.Now()
	fdStr := r.URL.Query().Get("fecha_desde")
	fhStr := r.URL.Query().Get("fecha_hasta")

	var desde, hasta time.Time

	if fdStr != "" {
		d, err := time.Parse("2006-01-02", fdStr)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("fecha_desde invalida: %w", err)
		}
		desde = d
	} else {
		// Inicio de mes actual
		desde = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
	}

	if fhStr != "" {
		h, err := time.Parse("2006-01-02", fhStr)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("fecha_hasta invalida: %w", err)
		}
		hasta = h
	} else {
		// Fin de mes actual
		firstNextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.Local)
		hasta = firstNextMonth.AddDate(0, 0, -1)
	}

	if desde.After(hasta) {
		return time.Time{}, time.Time{}, fmt.Errorf("fecha_desde no puede ser posterior a fecha_hasta")
	}

	return desde, hasta, nil
}

func stringsClean(s string) string {
	var b []rune
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b = append(b, r)
		} else {
			b = append(b, '_')
		}
	}
	return string(b)
}
