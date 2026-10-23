package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterAllBITools registra las herramientas operativas de Lavadero BI en el servidor MCP.
func RegisterAllBITools(s *Server, db *pgxpool.Pool) {
	registerResumenBITool(s, db)
	registerRankingHotelesTool(s, db)
	registerFichaHotel360Tool(s, db)
	registerAlertasOperativasTool(s, db)
	registerConciliacionYEntregasTool(s, db)
	registerCatalogoTarifarioTool(s, db)
	registerTendenciaProduccionTool(s, db)
	registerQueryReadOnlySQLTool(s, db)
	registerPredictStaffingTool(s, db)
}

func jsonResult(data any) (*CallToolResult, error) {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return &CallToolResult{
			IsError: true,
			Content: []ToolContent{{Type: "text", Text: "Error serializando resultado: " + err.Error()}},
		}, nil
	}
	return &CallToolResult{
		Content: []ToolContent{{Type: "text", Text: string(bytes)}},
	}, nil
}

func parseDateStr(v any) *time.Time {
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		t, err := time.Parse("2006-01-02", strings.TrimSpace(s))
		if err == nil {
			return &t
		}
	}
	return nil
}

func parseIntVal(v any) *int {
	switch n := v.(type) {
	case float64:
		i := int(n)
		return &i
	case int:
		return &n
	case int64:
		i := int(n)
		return &i
	}
	return nil
}

// ── 1. get_resumen_bi ───────────────────────────────────────────
func registerResumenBITool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_resumen_bi",
		Description: "Devuelve los KPIs globales consolidados del lavadero (prendas totales, facturables, relavadas, rotas y facturación en pesos argentinos) en un rango de fechas, con comparativa automática del período anterior. Permite filtrar opcionalmente por un hotel o una prenda.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"fecha_desde": {Type: "string", Description: "Fecha inicial en formato YYYY-MM-DD (ej: 2026-03-01)"},
				"fecha_hasta": {Type: "string", Description: "Fecha final en formato YYYY-MM-DD (ej: 2026-03-31)"},
				"hotel_id":    {Type: "integer", Description: "ID opcional del hotel a filtrar"},
				"item_id":     {Type: "integer", Description: "ID opcional de la prenda a filtrar"},
			},
			Required: []string{"fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])
		hotelID := parseIntVal(args["hotel_id"])
		itemID := parseIntVal(args["item_id"])

		type kpis struct {
			Total       int     `json:"prendas_totales"`
			Facturable  int     `json:"prendas_facturables"`
			Relavado    int     `json:"prendas_relavado"`
			Rotas       int     `json:"prendas_rotas"`
			Facturacion float64 `json:"facturacion_estimada_ars"`
		}

		queryKPIs := func(d, h *time.Time) (kpis, error) {
			var k kpis
			err := db.QueryRow(ctx, `
				SELECT
					COALESCE(SUM(r.cantidad), 0)::int,
					COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
					COALESCE(SUM(r.cantidad_relavado), 0)::int,
					COALESCE(SUM(r.cantidad_rota), 0)::int,
					COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
				FROM registros r
				JOIN items i ON i.id = r.item_id
				WHERE ($1::date IS NULL OR r.fecha >= $1)
				  AND ($2::date IS NULL OR r.fecha <= $2)
				  AND ($3::int IS NULL OR r.hotel_id = $3)
				  AND ($4::int IS NULL OR r.item_id = $4)
			`, d, h, hotelID, itemID).Scan(&k.Total, &k.Facturable, &k.Relavado, &k.Rotas, &k.Facturacion)
			return k, err
		}

		actual, err := queryKPIs(desde, hasta)
		if err != nil {
			return nil, err
		}

		// Período anterior
		var anterior kpis
		var difTotal, difFacturacion float64
		if desde != nil && hasta != nil {
			dur := int(hasta.Sub(*desde).Hours()/24) + 1
			antDesde := desde.AddDate(0, 0, -dur)
			antHasta := desde.AddDate(0, 0, -1)
			anterior, _ = queryKPIs(&antDesde, &antHasta)

			if anterior.Total > 0 {
				difTotal = (float64(actual.Total-anterior.Total) / float64(anterior.Total)) * 100.0
			}
			if anterior.Facturacion > 0 {
				difFacturacion = ((actual.Facturacion - anterior.Facturacion) / anterior.Facturacion) * 100.0
			}
		}

		tasaRelavado := 0.0
		if actual.Total > 0 {
			tasaRelavado = float64(actual.Relavado) * 100.0 / float64(actual.Total)
		}

		res := map[string]any{
			"periodo_actual": map[string]any{
				"desde":                  args["fecha_desde"],
				"hasta":                  args["fecha_hasta"],
				"metricas":               actual,
				"tasa_relavado_pct":      math.Round(tasaRelavado*10) / 10,
				"tasa_rotura_pct":        math.Round((float64(actual.Rotas)/math.Max(1, float64(actual.Total)))*1000) / 10,
			},
			"periodo_anterior": map[string]any{
				"metricas": anterior,
			},
			"variacion_porcentual": map[string]any{
				"volumen_pct":     math.Round(difTotal*10) / 10,
				"facturacion_pct": math.Round(difFacturacion*10) / 10,
			},
		}
		return jsonResult(res)
	})
}

// ── 2. get_ranking_hoteles ──────────────────────────────────────
func registerRankingHotelesTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_ranking_hoteles",
		Description: "Devuelve el listado de hoteles ordenado por volumen de prendas, facturación, prendas de relavado o prendas rotas. Permite orden ASC (menor a mayor, para ver quién facturó menos) o DESC (mayor a menor, para ver los líderes del negocio).",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"fecha_desde": {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta": {Type: "string", Description: "Fecha final YYYY-MM-DD"},
				"orden": {
					Type:        "string",
					Description: "Criterio de orden: 'facturacion', 'cantidad' (volumen), 'relavado' o 'roturas'. Por defecto 'facturacion'.",
					Enum:        []string{"facturacion", "cantidad", "relavado", "roturas"},
				},
				"direccion": {
					Type:        "string",
					Description: "Dirección del orden: 'DESC' (de mayor a menor) o 'ASC' (de menor a mayor). Por defecto 'DESC'.",
					Enum:        []string{"DESC", "ASC"},
				},
				"limit": {Type: "integer", Description: "Cantidad de hoteles a retornar (entre 1 y 50). Por defecto 10."},
			},
			Required: []string{"fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])

		orden := "facturacion"
		if o, ok := args["orden"].(string); ok && o != "" {
			orden = strings.ToLower(o)
		}
		dir := "DESC"
		if d, ok := args["direccion"].(string); ok && strings.ToUpper(d) == "ASC" {
			dir = "ASC"
		}
		limit := 10
		if l := parseIntVal(args["limit"]); l != nil && *l > 0 && *l <= 50 {
			limit = *l
		}

		orderCol := "facturacion"
		switch orden {
		case "cantidad":
			orderCol = "cantidad_total"
		case "relavado":
			orderCol = "cantidad_relavado"
		case "roturas":
			orderCol = "cantidad_rotas"
		}

		query := fmt.Sprintf(`
			SELECT
				h.id,
				h.nombre,
				COALESCE(SUM(r.cantidad), 0)::int AS cantidad_total,
				COALESCE(SUM(r.cantidad_relavado), 0)::int AS cantidad_relavado,
				COALESCE(SUM(r.cantidad_rota), 0)::int AS cantidad_rotas,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS facturacion
			FROM hoteles h
			JOIN registros r ON r.hotel_id = h.id
			JOIN items i ON i.id = r.item_id
			WHERE ($1::date IS NULL OR r.fecha >= $1)
			  AND ($2::date IS NULL OR r.fecha <= $2)
			GROUP BY h.id, h.nombre
			ORDER BY %s %s
			LIMIT $3
		`, orderCol, dir)

		rows, err := db.Query(ctx, query, desde, hasta, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		type hotelRow struct {
			ID          int     `json:"hotel_id"`
			Nombre      string  `json:"hotel_nombre"`
			Total       int     `json:"prendas_totales"`
			Relavado    int     `json:"prendas_relavado"`
			Rotas       int     `json:"prendas_rotas"`
			Facturacion float64 `json:"facturacion_ars"`
		}

		ranking := []hotelRow{}
		for rows.Next() {
			var hr hotelRow
			if err := rows.Scan(&hr.ID, &hr.Nombre, &hr.Total, &hr.Relavado, &hr.Rotas, &hr.Facturacion); err != nil {
				return nil, err
			}
			ranking = append(ranking, hr)
		}

		return jsonResult(map[string]any{
			"criterio_orden":   orden,
			"direccion":        dir,
			"cantidad_hoteles": len(ranking),
			"ranking":          ranking,
		})
	})
}

// ── 3. get_ficha_hotel_360 ──────────────────────────────────────
func registerFichaHotel360Tool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_ficha_hotel_360",
		Description: "Obtiene el diagnóstico 360 integral de un hotel específico: total de prendas procesadas, facturación, consumo detallado por tipo de prenda, tasas de relavado y roturas comparadas con el promedio general del lavadero, y últimos remitos registrados.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"hotel_nombre": {Type: "string", Description: "Nombre o fragmento del nombre del hotel (ej: 'King David', 'Amerian')"},
				"hotel_id":     {Type: "integer", Description: "ID del hotel si se conoce directamente"},
				"fecha_desde":  {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta":  {Type: "string", Description: "Fecha final YYYY-MM-DD"},
			},
			Required: []string{"fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])
		hotelID := parseIntVal(args["hotel_id"])
		hotelNombre, _ := args["hotel_nombre"].(string)

		var id int
		var nombre string
		var activo bool

		if hotelID != nil && *hotelID > 0 {
			err := db.QueryRow(ctx, "SELECT id, nombre, activo FROM hoteles WHERE id = $1", *hotelID).Scan(&id, &nombre, &activo)
			if err != nil {
				return nil, fmt.Errorf("hotel con ID %d no encontrado", *hotelID)
			}
		} else if strings.TrimSpace(hotelNombre) != "" {
			err := db.QueryRow(ctx, "SELECT id, nombre, activo FROM hoteles WHERE nombre ILIKE $1 ORDER BY activo DESC, id ASC LIMIT 1", "%"+strings.TrimSpace(hotelNombre)+"%").Scan(&id, &nombre, &activo)
			if err != nil {
				return nil, fmt.Errorf("no se encontró ningún hotel con nombre similar a '%s'", hotelNombre)
			}
		} else {
			return nil, fmt.Errorf("se requiere 'hotel_id' o 'hotel_nombre'")
		}

		// KPIs hotel
		var facturable, relavado, rotas int
		var facturacion float64
		err := db.QueryRow(ctx, `
			SELECT
				COALESCE(SUM(r.cantidad), 0)::int,
				COALESCE(SUM(r.cantidad_relavado), 0)::int,
				COALESCE(SUM(r.cantidad_rota), 0)::int,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
			FROM registros r
			JOIN items i ON i.id = r.item_id
			WHERE r.hotel_id = $1
			  AND ($2::date IS NULL OR r.fecha >= $2)
			  AND ($3::date IS NULL OR r.fecha <= $3)
		`, id, desde, hasta).Scan(&facturable, &relavado, &rotas, &facturacion)
		if err != nil {
			return nil, err
		}

		total := facturable + relavado + rotas
		tasaRelavado := 0.0
		tasaRotura := 0.0
		if total > 0 {
			tasaRelavado = float64(relavado) * 100.0 / float64(total)
			tasaRotura = float64(rotas) * 100.0 / float64(total)
		}

		// Benchmark promedio de planta
		var totalPlanta, relavadoPlanta int
		_ = db.QueryRow(ctx, `
			SELECT
				COALESCE(SUM(r.cantidad + r.cantidad_relavado + r.cantidad_rota), 0)::int,
				COALESCE(SUM(r.cantidad_relavado), 0)::int
			FROM registros r
			WHERE ($1::date IS NULL OR r.fecha >= $1)
			  AND ($2::date IS NULL OR r.fecha <= $2)
		`, desde, hasta).Scan(&totalPlanta, &relavadoPlanta)
		benchmarkRelavado := 0.0
		if totalPlanta > 0 {
			benchmarkRelavado = float64(relavadoPlanta) * 100.0 / float64(totalPlanta)
		}

		// Desglose por prenda (Top 8)
		itemsRows, err := db.Query(ctx, `
			SELECT
				i.nombre,
				COALESCE(SUM(r.cantidad), 0)::int AS facturable,
				COALESCE(SUM(r.cantidad_relavado), 0)::int AS relavado,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS subtotal
			FROM registros r
			JOIN items i ON i.id = r.item_id
			WHERE r.hotel_id = $1
			  AND ($2::date IS NULL OR r.fecha >= $2)
			  AND ($3::date IS NULL OR r.fecha <= $3)
			GROUP BY i.nombre
			ORDER BY subtotal DESC, facturable DESC
			LIMIT 8
		`, id, desde, hasta)
		if err != nil {
			return nil, err
		}
		defer itemsRows.Close()

		type prendaConsumo struct {
			Prenda     string  `json:"prenda"`
			Facturable int     `json:"prendas_facturables"`
			Relavado   int     `json:"prendas_relavado"`
			Subtotal   float64 `json:"subtotal_ars"`
		}
		desglose := []prendaConsumo{}
		for itemsRows.Next() {
			var pc prendaConsumo
			if err := itemsRows.Scan(&pc.Prenda, &pc.Facturable, &pc.Relavado, &pc.Subtotal); err == nil {
				desglose = append(desglose, pc)
			}
		}

		ficha := map[string]any{
			"hotel": map[string]any{
				"id":     id,
				"nombre": nombre,
				"activo": activo,
			},
			"resumen_consumo": map[string]any{
				"total_prendas":          total,
				"prendas_facturables":    facturable,
				"prendas_relavado":       relavado,
				"prendas_rotas":          rotas,
				"facturacion_estimada":   facturacion,
				"tasa_relavado_pct":      math.Round(tasaRelavado*10) / 10,
				"tasa_rotura_pct":        math.Round(tasaRotura*10) / 10,
				"benchmark_planta_relavado_pct": math.Round(benchmarkRelavado*10) / 10,
			},
			"desglose_prendas_top": desglose,
		}
		return jsonResult(ficha)
	})
}

// ── 4. get_alertas_operativas ───────────────────────────────────
func registerAlertasOperativasTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_alertas_operativas",
		Description: "Ejecuta las reglas de auditoría y devuelve las alertas automáticas del lavadero para un período: tasas altas de relavado (>5%), roturas elevadas (>2%), prendas sin precio en tarifario, concentración excesiva en un solo cliente (≥50%) y hoteles inactivos.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"fecha_desde": {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta": {Type: "string", Description: "Fecha final YYYY-MM-DD"},
			},
			Required: []string{"fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])

		var total, facturable, relavado, rotas int
		var facturacion float64
		_ = db.QueryRow(ctx, `
			SELECT
				COALESCE(SUM(r.cantidad), 0)::int,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
				COALESCE(SUM(r.cantidad_relavado), 0)::int,
				COALESCE(SUM(r.cantidad_rota), 0)::int,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
			FROM registros r
			JOIN items i ON i.id = r.item_id
			WHERE ($1::date IS NULL OR r.fecha >= $1)
			  AND ($2::date IS NULL OR r.fecha <= $2)
		`, desde, hasta).Scan(&total, &facturable, &relavado, &rotas, &facturacion)

		var sinPrecio int
		_ = db.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM items
			WHERE se_factura = true AND (precio_unitario IS NULL OR precio_unitario <= 0)
		`).Scan(&sinPrecio)

		// Top concentración
		var maxHotelVolumen int
		_ = db.QueryRow(ctx, `
			SELECT COALESCE(SUM(r.cantidad), 0)::int
			FROM registros r
			WHERE ($1::date IS NULL OR r.fecha >= $1)
			  AND ($2::date IS NULL OR r.fecha <= $2)
			GROUP BY r.hotel_id
			ORDER BY 1 DESC
			LIMIT 1
		`, desde, hasta).Scan(&maxHotelVolumen)

		concentracion := 0.0
		if total > 0 && maxHotelVolumen > 0 {
			concentracion = float64(maxHotelVolumen) * 100.0 / float64(total)
		}

		type AlertaItem struct {
			ID        string `json:"id"`
			Nivel     string `json:"nivel"` // "danger", "warning", "info"
			Titulo    string `json:"titulo"`
			Detalle   string `json:"detalle"`
			Accion    string `json:"accion_recomendada"`
		}

		alertas := []AlertaItem{}

		if total > 0 {
			tasaRel := float64(relavado) * 100.0 / float64(total)
			if tasaRel > 5.0 {
				alertas = append(alertas, AlertaItem{
					ID:        "relavado-alto",
					Nivel:     "warning",
					Titulo:    "Tasa de relavado elevada",
					Detalle:   fmt.Sprintf("El reproceso representa el %.1f%% del total (umbral óptimo ≤ 5%%).", tasaRel),
					Accion:    "Auditar dosificación de blanqueadores y lotes de toallas.",
				})
			}

			tasaRot := float64(rotas) * 100.0 / float64(total)
			if tasaRot > 2.0 {
				alertas = append(alertas, AlertaItem{
					ID:        "roturas-altas",
					Nivel:     "danger",
					Titulo:    "Tasa de roturas crítica",
					Detalle:   fmt.Sprintf("Prendas dañadas o dadas de baja alcanzan el %.1f%% (umbral máximo 2%%).", tasaRot),
					Accion:    "Revisar velocidad de centrifugado y nivel de cloro.",
				})
			}
		}

		if sinPrecio > 0 {
			alertas = append(alertas, AlertaItem{
				ID:        "prendas-sin-precio",
				Nivel:     "warning",
				Titulo:    "Prendas facturables sin precio",
				Detalle:   fmt.Sprintf("Existen %d tipos de prendas facturables sin tarifa definida en el catálogo.", sinPrecio),
				Accion:    "Asignar precios en el módulo de Catálogos para no subestimar facturación.",
			})
		}

		if concentracion >= 50.0 {
			alertas = append(alertas, AlertaItem{
				ID:        "alta-concentracion",
				Nivel:     "info",
				Titulo:    "Alta concentración de demanda",
				Detalle:   fmt.Sprintf("El hotel líder concentra el %.1f%% del volumen total del lavadero.", concentracion),
				Accion:    "Monitorear riesgo de capacidad y diversificar cartera.",
			})
		}

		return jsonResult(map[string]any{
			"total_alertas": len(alertas),
			"alertas":       alertas,
		})
	})
}

// ── 5. get_conciliacion_y_entregas ──────────────────────────────
func registerConciliacionYEntregasTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_conciliacion_y_entregas",
		Description: "Consulta el estado operativo de remitos digitales B2B, diferencias entre lo declarado por el hotel vs. contado en lavadero, y el estado de despachos/entregas en destino.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"hotel_nombre": {Type: "string", Description: "Filtro opcional por nombre de hotel"},
				"solo_diferencias": {Type: "boolean", Description: "Si es true, lista únicamente remitos o despachos validados con diferencia"},
				"limit":        {Type: "integer", Description: "Límite de resultados (por defecto 15)"},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		hotelNombre, _ := args["hotel_nombre"].(string)
		soloDif, _ := args["solo_diferencias"].(bool)
		limit := 15
		if l := parseIntVal(args["limit"]); l != nil && *l > 0 {
			limit = *l
		}

		query := `
			SELECT
				e.id,
				e.codigo_qr,
				h.nombre AS hotel,
				e.fecha_creacion,
				e.estado,
				COALESCE(c.estado_conciliacion, 'sin_validar') AS estado_conciliacion,
				COALESCE(c.total_declarado, 0) AS declarado,
				COALESCE(c.total_procesado, 0) AS procesado,
				COALESCE(c.diferencia, 0) AS diferencia
			FROM envios e
			JOIN hoteles h ON h.id = e.hotel_id
			LEFT JOIN conciliaciones_despacho c ON c.envio_id = e.id
			WHERE ($1 = '' OR h.nombre ILIKE '%' || $1 || '%')
			  AND (NOT $2 OR c.estado_conciliacion = 'validado_con_diferencia')
			ORDER BY e.fecha_creacion DESC
			LIMIT $3
		`

		rows, err := db.Query(ctx, query, strings.TrimSpace(hotelNombre), soloDif, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		type envioRow struct {
			ID                 int       `json:"envio_id"`
			CodigoQR           string    `json:"codigo_qr"`
			Hotel              string    `json:"hotel"`
			Fecha              time.Time `json:"fecha_envio"`
			Estado             string    `json:"estado_remito"`
			EstadoConciliacion string    `json:"estado_conciliacion"`
			Declarado          int       `json:"prendas_declaradas"`
			Procesado          int       `json:"prendas_procesadas"`
			Diferencia         int       `json:"diferencia_prendas"`
		}

		remitos := []envioRow{}
		for rows.Next() {
			var r envioRow
			if err := rows.Scan(&r.ID, &r.CodigoQR, &r.Hotel, &r.Fecha, &r.Estado, &r.EstadoConciliacion, &r.Declarado, &r.Procesado, &r.Diferencia); err == nil {
				remitos = append(remitos, r)
			}
		}

		return jsonResult(map[string]any{
			"total_remitos_auditados": len(remitos),
			"remitos":                 remitos,
		})
	})
}

// ── 6. get_catalogo_tarifario ───────────────────────────────────
func registerCatalogoTarifarioTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_catalogo_tarifario",
		Description: "Consulta el catálogo maestro de prendas (con precios unitarios vigentes y tipo de facturación) y el padrón de hoteles de la lavandería.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"solo_sin_precio":  {Type: "boolean", Description: "Si es true, devuelve únicamente prendas que carecen de precio unitario"},
				"incluir_hoteles":  {Type: "boolean", Description: "Si es true, incluye el listado de hoteles registrados y su estado activo"},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		soloSinPrecio, _ := args["solo_sin_precio"].(bool)
		incluirHoteles, _ := args["incluir_hoteles"].(bool)

		queryItems := `
			SELECT id, nombre, codigo, COALESCE(precio_unitario, 0)::float8, se_factura
			FROM items
			WHERE (NOT $1 OR (se_factura = true AND (precio_unitario IS NULL OR precio_unitario <= 0)))
			ORDER BY se_factura DESC, nombre ASC
		`
		rows, err := db.Query(ctx, queryItems, soloSinPrecio)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		type itemDTO struct {
			ID             int     `json:"id"`
			Nombre         string  `json:"nombre"`
			Codigo         string  `json:"codigo"`
			PrecioUnitario float64 `json:"precio_unitario_ars"`
			SeFactura      bool    `json:"se_factura"`
			SinPrecio      bool    `json:"alerta_sin_precio"`
		}

		items := []itemDTO{}
		for rows.Next() {
			var it itemDTO
			if err := rows.Scan(&it.ID, &it.Nombre, &it.Codigo, &it.PrecioUnitario, &it.SeFactura); err == nil {
				it.SinPrecio = it.SeFactura && it.PrecioUnitario <= 0
				items = append(items, it)
			}
		}

		res := map[string]any{
			"total_items": len(items),
			"items":       items,
		}

		if incluirHoteles {
			type hotelDTO struct {
				ID     int    `json:"id"`
				Nombre string `json:"nombre"`
				Activo bool   `json:"activo"`
			}
			hrows, err := db.Query(ctx, "SELECT id, nombre, activo FROM hoteles ORDER BY activo DESC, nombre ASC")
			if err == nil {
				defer hrows.Close()
				hoteles := []hotelDTO{}
				for hrows.Next() {
					var h hotelDTO
					if err := hrows.Scan(&h.ID, &h.Nombre, &h.Activo); err == nil {
						hoteles = append(hoteles, h)
					}
				}
				res["hoteles"] = hoteles
				res["total_hoteles"] = len(hoteles)
			}
		}

		return jsonResult(res)
	})
}

// ── 7. get_tendencia_produccion ─────────────────────────────────
func registerTendenciaProduccionTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "get_tendencia_produccion",
		Description: "Obtiene la serie temporal día por día del volumen de prendas procesadas y facturación dentro de un rango de fechas. Permite evaluar fluctuaciones y picos semanales.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"fecha_desde": {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta": {Type: "string", Description: "Fecha final YYYY-MM-DD"},
				"hotel_id":    {Type: "integer", Description: "ID de hotel opcional para filtrar"},
			},
			Required: []string{"fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])
		hotelID := parseIntVal(args["hotel_id"])

		rows, err := db.Query(ctx, `
			SELECT
				r.fecha,
				COALESCE(SUM(r.cantidad), 0)::int AS total,
				COALESCE(SUM(r.cantidad_relavado), 0)::int AS relavado,
				COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS facturacion
			FROM registros r
			JOIN items i ON i.id = r.item_id
			WHERE ($1::date IS NULL OR r.fecha >= $1)
			  AND ($2::date IS NULL OR r.fecha <= $2)
			  AND ($3::int IS NULL OR r.hotel_id = $3)
			GROUP BY r.fecha
			ORDER BY r.fecha ASC
		`, desde, hasta, hotelID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		type diaRow struct {
			Fecha       string  `json:"fecha"`
			Total       int     `json:"prendas_totales"`
			Relavado    int     `json:"prendas_relavado"`
			Facturacion float64 `json:"facturacion_ars"`
		}

		serie := []diaRow{}
		for rows.Next() {
			var f time.Time
			var tot, rel int
			var fac float64
			if err := rows.Scan(&f, &tot, &rel, &fac); err == nil {
				serie = append(serie, diaRow{
					Fecha:       f.Format("2006-01-02"),
					Total:       tot,
					Relavado:    rel,
					Facturacion: fac,
				})
			}
		}

		return jsonResult(map[string]any{
			"dias_registrados": len(serie),
			"serie_temporal":   serie,
		})
	})
}

// ── 8. query_readonly_sql ───────────────────────────────────────
func registerQueryReadOnlySQLTool(s *Server, db *pgxpool.Pool) {
	// Expresión regular que detecta palabras reservadas no permitidas para evitar mutaciones
	disallowedRegex := regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|call|vacuum|copy|pg_sleep)\b`)

	s.RegisterTool(Tool{
		Name:        "query_readonly_sql",
		Description: "Ejecuta una consulta SQL SELECT de solo lectura sobre las tablas autorizadas (hoteles, items, registros, envios, envio_detalles, conciliaciones_despacho). Prohibido DDL o DML. Límite máximo de 50 filas.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"sql": {
					Type:        "string",
					Description: "Consulta SELECT válida en PostgreSQL (ej: 'SELECT h.nombre, COUNT(*) FROM hoteles h JOIN registros r ON r.hotel_id = h.id GROUP BY h.nombre ORDER BY 2 DESC LIMIT 5')",
				},
			},
			Required: []string{"sql"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		query, _ := args["sql"].(string)
		trimmed := strings.TrimSpace(query)
		if trimmed == "" {
			return nil, fmt.Errorf("la consulta SQL no puede estar vacía")
		}

		// Validar que comience con SELECT o WITH
		upper := strings.ToUpper(trimmed)
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			return &CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: "Seguridad: solo se admiten consultas de lectura (SELECT o WITH)."}},
			}, nil
		}

		// Validar que no contenga sentencias peligrosas o múltiples sentencias
		if strings.Contains(trimmed, ";") {
			trimmed = strings.TrimSuffix(trimmed, ";")
			if strings.Contains(trimmed, ";") {
				return &CallToolResult{
					IsError: true,
					Content: []ToolContent{{Type: "text", Text: "Seguridad: no se permiten múltiples sentencias SQL concatenadas."}},
				}, nil
			}
		}

		if disallowedRegex.MatchString(trimmed) {
			return &CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: "Seguridad: la consulta contiene palabras clave no permitidas (solo lectura estricta)."}},
			}, nil
		}

		// Forzar un límite máximo
		if !strings.Contains(upper, "LIMIT") {
			trimmed = trimmed + " LIMIT 50"
		}

		// Timeout de 3 segundos
		queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()

		tx, err := db.Begin(queryCtx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(queryCtx)

		// Configurar transacción como solo lectura
		_, _ = tx.Exec(queryCtx, "SET TRANSACTION READ ONLY")

		rows, err := tx.Query(queryCtx, trimmed)
		if err != nil {
			return &CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: "Error en PostgreSQL: " + err.Error()}},
			}, nil
		}
		defer rows.Close()

		fieldDescriptions := rows.FieldDescriptions()
		columns := make([]string, len(fieldDescriptions))
		for i, fd := range fieldDescriptions {
			columns[i] = string(fd.Name)
		}

		results := make([]map[string]any, 0)
		for rows.Next() {
			values, err := rows.Values()
			if err != nil {
				return nil, err
			}
			rowMap := make(map[string]any, len(columns))
			for i, col := range columns {
				val := values[i]
				// Formatear tiempos si corresponde
				if t, ok := val.(time.Time); ok {
					val = t.Format("2006-01-02")
				}
				rowMap[col] = val
			}
			results = append(results, rowMap)
		}

		return jsonResult(map[string]any{
			"sql_ejecutado": trimmed,
			"filas_totales": len(results),
			"datos":         results,
		})
	})
}

// ── 9. predict_staffing_demanda ─────────────────────────────────
func registerPredictStaffingTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "predict_staffing_demanda",
		Description: "Proyecta la demanda de prendas a procesar para los próximos días futuros (1 a 14 días) y calcula la dotación de personal (horas-hombre y turnos requeridos), basada en la serie histórica y el factor de estacionalidad semanal.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"dias_a_proyectar": {Type: "integer", Description: "Cantidad de días a proyectar hacia adelante (entre 1 y 14, por defecto 7)"},
				"rendimiento_prendas_hora": {
					Type:        "integer",
					Description: "Rendimiento industrial promedio por operario en prendas/hora (por defecto 85 prendas/hora)",
				},
				"horas_por_turno": {
					Type:        "integer",
					Description: "Duración de la jornada laboral en horas (por defecto 8 horas)",
				},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		dias := 7
		if d := parseIntVal(args["dias_a_proyectar"]); d != nil && *d > 0 && *d <= 14 {
			dias = *d
		}
		prendasHora := 85
		if ph := parseIntVal(args["rendimiento_prendas_hora"]); ph != nil && *ph > 20 {
			prendasHora = *ph
		}
		horasTurno := 8
		if ht := parseIntVal(args["horas_por_turno"]); ht != nil && *ht > 0 {
			horasTurno = *ht
		}

		// Leer los últimos 60 días de historia para calcular promedios por día de la semana
		rows, err := db.Query(ctx, `
			SELECT
				EXTRACT(DOW FROM fecha)::int AS dow,
				AVG(volumen_dia)::float8 AS promedio_dia,
				COUNT(*)::int AS muestras
			FROM (
				SELECT fecha, SUM(cantidad)::int AS volumen_dia
				FROM registros
				WHERE fecha >= CURRENT_DATE - INTERVAL '60 days'
				GROUP BY fecha
			) sub
			GROUP BY dow
		`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		dowAvg := make(map[int]float64)
		var totalVolumenHistorico float64
		var totalMuestras int
		for rows.Next() {
			var dow, muestras int
			var avg float64
			if err := rows.Scan(&dow, &avg, &muestras); err == nil {
				dowAvg[dow] = avg
				totalVolumenHistorico += avg * float64(muestras)
				totalMuestras += muestras
			}
		}

		promedioGlobal := 2500.0 // Fallback sensato si hay pocos datos
		if totalMuestras > 0 {
			promedioGlobal = totalVolumenHistorico / float64(totalMuestras)
		}

		nombreDias := []string{"Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"}

		type ProyeccionDia struct {
			Fecha             string `json:"fecha"`
			DiaSemana         string `json:"dia_semana"`
			PrendasEstimadas  int    `json:"prendas_estimadas"`
			HorasHombreRequeridas float64 `json:"horas_hombre_requeridas"`
			OperariosSugeridos int   `json:"operarios_en_planta_sugeridos"`
		}

		proyecciones := make([]ProyeccionDia, 0, dias)
		hoy := time.Now()
		totalPrendasProyectadas := 0

		for i := 1; i <= dias; i++ {
			fechaFutura := hoy.AddDate(0, 0, i)
			dow := int(fechaFutura.Weekday())

			prendas := promedioGlobal
			if val, ok := dowAvg[dow]; ok && val > 0 {
				prendas = val
			}

			// Ajuste de fin de semana si el lavadero reduce jornada domingo
			if dow == 0 {
				prendas = prendas * 0.4
			}

			prendasInt := int(math.Round(prendas))
			totalPrendasProyectadas += prendasInt

			horasHombre := float64(prendasInt) / float64(prendasHora)
			operarios := int(math.Ceil(horasHombre / float64(horasTurno)))
			if operarios < 1 && prendasInt > 0 {
				operarios = 1
			}

			proyecciones = append(proyecciones, ProyeccionDia{
				Fecha:                 fechaFutura.Format("2006-01-02"),
				DiaSemana:             nombreDias[dow],
				PrendasEstimadas:      prendasInt,
				HorasHombreRequeridas: math.Round(horasHombre*10) / 10,
				OperariosSugeridos:    operarios,
			})
		}

		horasTotales := float64(totalPrendasProyectadas) / float64(prendasHora)

		return jsonResult(map[string]any{
			"horizonte_dias":               dias,
			"parametros": map[string]any{
				"rendimiento_prendas_hora": prendasHora,
				"horas_jornada_turno":      horasTurno,
			},
			"total_prendas_estimadas":      totalPrendasProyectadas,
			"total_horas_hombre_estimadas": math.Round(horasTotales*10) / 10,
			"proyeccion_diaria":            proyecciones,
			"recomendacion_operativa":      "Mantener dotación reforzada en días de cambio de sábanas y hotelería de fin de semana.",
		})
	})
}
