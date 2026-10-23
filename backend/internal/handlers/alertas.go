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

// AlertaInput agrupa las métricas agregadas para evaluar umbrales de alertas de negocio.
type AlertaInput struct {
	Total         int
	Facturable    int
	Relavado      int
	Rotas         int
	Facturacion   float64
	SinPrecio     int
	Concentracion float64
	Inactivos     []string
}

// evaluarAlertas ejecuta las reglas deterministas de umbrales de relavado, roturas,
// tarifario, facturación, concentración de demanda y hoteles inactivos.
func evaluarAlertas(in AlertaInput) []Alerta {
	alertas := []Alerta{}

	// Tasa de relavado (> 5%)
	if in.Total > 0 {
		ratioRelavado := float64(in.Relavado) / float64(in.Total)
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

		// Tasa de roturas / bajas (> 2%)
		ratioRoturas := float64(in.Rotas) / float64(in.Total)
		if ratioRoturas > 0.02 {
			alertas = append(alertas, Alerta{
				ID:        "roturas-altas",
				Nivel:     "danger",
				Categoria: "Control de calidad",
				Titulo:    "Tasa de roturas elevada",
				Detalle:   fmt.Sprintf("Las prendas rotas o dadas de baja representan el %.1f%% del volumen (umbral máximo 2%%).", ratioRoturas*100),
				Accion:    "Revisar dosificación química y estado de centrífugas.",
			})
		}
	}

	// Tarifario incompleto
	if in.SinPrecio > 0 {
		alertas = append(alertas, Alerta{
			ID:        "sin-precio",
			Nivel:     "warning",
			Categoria: "Tarifario",
			Titulo:    "Prendas facturables sin precio",
			Detalle:   fmt.Sprintf("Hay %d prenda(s) facturable(s) sin precio asignado, lo que subestima la facturación.", in.SinPrecio),
			Accion:    "Completar precios en Catálogos.",
		})
	}

	// Facturación nula con volumen
	if in.Total > 0 && in.Facturacion <= 0 {
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
	if in.Concentracion >= 50 {
		alertas = append(alertas, Alerta{
			ID:        "dependencia-fuerte",
			Nivel:     "info",
			Categoria: "Concentración de demanda",
			Titulo:    "Dependencia elevada del principal cliente",
			Detalle:   fmt.Sprintf("El hotel líder concentra el %.1f%% del volumen. Un riesgo si reduce pedidos.", in.Concentracion),
			Accion:    "Diversificar la cartera de clientes.",
		})
	}

	// Hoteles inactivos (acotado para no saturar el panel).
	inactivos := in.Inactivos
	limiteInactivos := 5
	if len(inactivos) > limiteInactivos {
		inactivos = inactivos[:limiteInactivos]
	}
	for i, nombre := range inactivos {
		alertas = append(alertas, Alerta{
			ID:        "hotel-inactivo-" + strconv.Itoa(i),
			Nivel:     "info",
			Categoria: "Actividad",
			Titulo:    "Hotel sin movimiento en el período",
			Detalle:   nombre + " no registró prendas en el período analizado.",
			Accion:    "Contactar al cliente o revisar la carga de datos.",
		})
	}

	return alertas
}

// alertas evalúa heurísticas de negocio sobre el rango indicado y devuelve una
// lista de alertas automáticas (relavado alto, roturas, tarifario incompleto,
// hoteles inactivos y concentración de demanda).
func (a *App) alertas(w http.ResponseWriter, r *http.Request) {
	fechaDesde, fechaHasta, err := requiredDateRangeParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// 1) Resumen del período: total, facturable, relavado, rotas y facturación.
	var total, facturable, relavado, rotas int
	var facturacion float64
	err = a.db.QueryRow(r.Context(), `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END), 0) + COALESCE(SUM(r.cantidad_relavado), 0)::int,
			COALESCE(SUM(r.cantidad_rota), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)`,
		fechaDesde, fechaHasta).Scan(&total, &facturable, &relavado, &rotas, &facturacion)
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
	inactivos := []string{}
	for rows.Next() {
		var nombre string
		if err := rows.Scan(&nombre); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "No se pudieron evaluar las alertas.")
			return
		}
		inactivos = append(inactivos, nombre)
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

	alertas := evaluarAlertas(AlertaInput{
		Total:         total,
		Facturable:    facturable,
		Relavado:      relavado,
		Rotas:         rotas,
		Facturacion:   facturacion,
		SinPrecio:     sinPrecio,
		Concentracion: concentracion,
		Inactivos:     inactivos,
	})

	writeJSON(w, http.StatusOK, alertas)
}

