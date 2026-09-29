package handlers

import (
	"fmt"
	"net/http"
	"strconv"
)

// Alerta representa una señal automática detectada sobre los datos del negocio.
type Alerta struct {
	ID        string `json:"id"`
	Nivel     string `json:"nivel"` // info, warning, danger
	Categoria string `json:"categoria"`
	Titulo    string `json:"titulo"`
	Detalle   string `json:"detalle"`
	Accion    string `json:"accion,omitempty"`
}

// alertas evalúa heurísticas de negocio sobre el rango indicado y devuelve una
// lista de alertas automáticas (relavado alto, tarifario incompleto, hoteles
// inactivos y concentración de demanda).
func (a *App) alertas(w http.ResponseWriter, r *http.Request) {
	fechaDesde, fechaHasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// 1) Resumen del período: total, facturable, relavado, facturación.
	var total, facturable, relavado int
	var facturacion float64
	err = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)`,
		fechaDesde, fechaHasta).Scan(&total, &facturable, &relavado, &facturacion)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron evaluar las alertas.")
		return
	}

	// 2) Prendas facturables sin precio (catálogo actual).
	var sinPrecio int
	err = a.db.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM items
		WHERE se_factura = true AND (precio_unitario IS NULL OR precio_unitario <= 0)`).Scan(&sinPrecio)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron evaluar las alertas.")
		return
	}

	// 3) Hoteles activos sin movimientos en el período.
	rows, err := a.db.Query(r.Context(), `
		SELECT h.nombre
		FROM hoteles h
		WHERE h.activo = true AND NOT EXISTS (
			SELECT 1 FROM registros r
			WHERE r.hotel_id = h.id
				AND ($1::date IS NULL OR r.fecha >= $1)
				AND ($2::date IS NULL OR r.fecha <= $2)
		)`, fechaDesde, fechaHasta)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron evaluar las alertas.")
		return
	}
	type inactivo struct {
		nombre string
	}
	inactivos := []inactivo{}
	for rows.Next() {
		var h inactivo
		if err := rows.Scan(&h.nombre); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "No se pudieron evaluar las alertas.")
			return
		}
		inactivos = append(inactivos, h)
	}
	rows.Close()

	// 4) Concentración de demanda (cuota del líder por volumen).
	concentracion := 0.0
	if total > 0 {
		ranking, err := a.rankingData(r.Context(), fechaDesde, fechaHasta, nil, 1000, false)
		if err == nil && len(ranking) > 0 {
			concentracion = float64(ranking[0].CantidadTotal) / float64(total) * 100
		}
	}

	alertas := []Alerta{}

	// Tasa de relavado
	ratioRelavado := 0.0
	if total > 0 {
		ratioRelavado = float64(relavado) / float64(total)
	}
	if ratioRelavado > 0.05 {
		alertas = append(alertas, Alerta{
			ID:        "relavado-alto",
			Nivel:     "warning",
			Categoria: "Control de calidad",
			Titulo:    "Tasa de relavado elevada",
			Detalle:   fmt.Sprintf("El reproceso alcanza el %.1f%% del volumen, por encima del umbral óptimo del 5%%.", ratioRelavado*100),
			Accion:    "Auditar el proceso de lavado.",
		})
	}

	// Tarifario incompleto
	if sinPrecio > 0 {
		alertas = append(alertas, Alerta{
			ID:        "sin-precio",
			Nivel:     "warning",
			Categoria: "Tarifario",
			Titulo:    "Prendas facturables sin precio",
			Detalle:   fmt.Sprintf("Hay %d prenda(s) facturable(s) sin precio asignado, lo que subestima la facturación.", sinPrecio),
			Accion:    "Completar precios en Catálogos.",
		})
	}

	// Facturación nula con volumen
	if total > 0 && facturacion <= 0 {
		alertas = append(alertas, Alerta{
			ID:        "facturacion-cero",
			Nivel:     "danger",
			Categoria: "Facturación",
			Titulo:    "Facturación estimada en cero",
			Detalle:   "Hay volumen registrado pero no se pudo estimar facturación. Revisar precios y/o prendas facturables.",
			Accion:    "Verificar catálogo de precios.",
		})
	}

	// Concentración de demanda
	if concentracion >= 50 {
		alertas = append(alertas, Alerta{
			ID:        "dependencia-fuerte",
			Nivel:     "info",
			Categoria: "Concentración de demanda",
			Titulo:    "Dependencia elevada del principal cliente",
			Detalle:   fmt.Sprintf("El hotel líder concentra el %.1f%% del volumen. Un riesgo si reduce pedidos.", concentracion),
			Accion:    "Diversificar la cartera de clientes.",
		})
	}

	// Hoteles inactivos (acotado para no saturar el panel).
	limiteInactivos := 5
	if len(inactivos) > limiteInactivos {
		inactivos = inactivos[:limiteInactivos]
	}
	for i, h := range inactivos {
		alertas = append(alertas, Alerta{
			ID:        "hotel-inactivo-" + strconv.Itoa(i),
			Nivel:     "info",
			Categoria: "Actividad",
			Titulo:    "Hotel sin movimiento en el período",
			Detalle:   h.nombre + " no registró prendas en el período analizado.",
			Accion:    "Contactar al cliente o revisar la carga de datos.",
		})
	}

	writeJSON(w, http.StatusOK, alertas)
}
