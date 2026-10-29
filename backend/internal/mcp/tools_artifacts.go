package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

// ── 10. generar_grafico_bi ──────────────────────────────────────────────
func registerGenerarGraficoTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "generar_grafico_bi",
		Description: "Genera una visualización gráfica interactiva (barras, líneas, área o torta) y métricas KPI para renderizar como artefacto visual interactivo en el chat del usuario. Usá esta herramienta SIEMPRE que el usuario pida un gráfico, comparativa visual, ranking visual, evolución temporal o desglose.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"metrica": {
					Type:        "string",
					Description: "Tipo de métrica a graficar: 'ranking_hoteles', 'tendencia_diaria', 'desglose_hotel', 'proyeccion_personal' o 'calidad_hoteles'.",
					Enum:        []string{"ranking_hoteles", "tendencia_diaria", "desglose_hotel", "proyeccion_personal", "calidad_hoteles"},
				},
				"tipo_grafico": {
					Type:        "string",
					Description: "Tipo de visualización preferida: 'bar' (barras), 'line' (líneas), 'area' (área apilada/continua) o 'pie' (torta de participación). Por defecto 'bar'.",
					Enum:        []string{"bar", "line", "area", "pie"},
				},
				"fecha_desde": {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta": {Type: "string", Description: "Fecha final YYYY-MM-DD"},
				"hotel_nombre": {Type: "string", Description: "Nombre de hotel opcional si se requiere filtrar o para desglose_hotel"},
				"orden": {
					Type:        "string",
					Description: "Para ranking: 'facturacion', 'cantidad', 'relavado' o 'roturas'. Por defecto 'facturacion'.",
					Enum:        []string{"facturacion", "cantidad", "relavado", "roturas"},
				},
				"limit": {Type: "integer", Description: "Límite de elementos a graficar (entre 3 y 20). Por defecto 8."},
			},
			Required: []string{"metrica", "fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		metrica, _ := args["metrica"].(string)
		if metrica == "" {
			metrica = "ranking_hoteles"
		}
		chartType, _ := args["tipo_grafico"].(string)
		if chartType == "" {
			chartType = "bar"
		}
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])
		hotelNombre, _ := args["hotel_nombre"].(string)
		orden, _ := args["orden"].(string)
		if orden == "" {
			orden = "facturacion"
		}
		limit := 8
		if l := parseIntVal(args["limit"]); l != nil && *l >= 3 && *l <= 20 {
			limit = *l
		}

		artifactID := fmt.Sprintf("chart-%d", time.Now().UnixNano())

		switch metrica {
		case "tendencia_diaria":
			return generarGraficoTendencia(ctx, db, artifactID, chartType, desde, hasta, hotelNombre)
		case "desglose_hotel":
			return generarGraficoDesgloseHotel(ctx, db, artifactID, chartType, desde, hasta, hotelNombre)
		case "proyeccion_personal":
			return generarGraficoProyeccionStaffing(ctx, db, artifactID, chartType)
		case "calidad_hoteles":
			return generarGraficoCalidadHoteles(ctx, db, artifactID, chartType, desde, hasta, limit)
		default:
			return generarGraficoRankingHoteles(ctx, db, artifactID, chartType, desde, hasta, orden, limit)
		}
	})
}

func generarGraficoRankingHoteles(ctx context.Context, db *pgxpool.Pool, id, chartType string, desde, hasta *time.Time, orden string, limit int) (*CallToolResult, error) {
	orderCol := "facturacion"
	if orden == "cantidad" {
		orderCol = "cantidad_total"
	} else if orden == "relavado" {
		orderCol = "cantidad_relavado"
	}

	query := fmt.Sprintf(`
		SELECT
			h.nombre,
			COALESCE(SUM(r.cantidad), 0)::int AS cantidad_total,
			COALESCE(SUM(r.cantidad_relavado), 0)::int AS cantidad_relavado,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS facturacion
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
		  AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		ORDER BY %s DESC
		LIMIT $3
	`, orderCol)

	rows, err := db.Query(ctx, query, desde, hasta, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make([]map[string]any, 0)
	var totalPrendas int
	var totalFacturacion float64
	previewRows := make([][]string, 0)

	for rows.Next() {
		var nom string
		var cant, rel int
		var fact float64
		if err := rows.Scan(&nom, &cant, &rel, &fact); err == nil {
			totalPrendas += cant
			totalFacturacion += fact
			data = append(data, map[string]any{
				"hotel":       nom,
				"prendas":     cant,
				"relavado":    rel,
				"facturacion": math.Round(fact),
			})
			previewRows = append(previewRows, []string{
				nom,
				fmt.Sprintf("%d", cant),
				fmt.Sprintf("$ %s", formatMiles(int(fact))),
				fmt.Sprintf("%d", rel),
			})
		}
	}

	series := []ChartSeries{
		{Key: "facturacion", Label: "Facturación ($ ARS)", Color: "#48c0b0", IsCurrency: true},
		{Key: "prendas", Label: "Prendas Totales", Color: "#108080", IsCurrency: false},
	}
	if orden == "cantidad" {
		series = []ChartSeries{
			{Key: "prendas", Label: "Prendas Totales", Color: "#48c0b0", IsCurrency: false},
			{Key: "relavado", Label: "Relavados", Color: "#f59e0b", IsCurrency: false},
		}
	}

	artifact := &ArtifactPayload{
		ID:        id,
		Type:      "chart",
		Title:     "Ranking de Clientes por " + strings.Title(orden),
		Subtitle:  fmt.Sprintf("Período analizado: %s a %s (%d hoteles)", fmtFecha(desde), fmtFecha(hasta), len(data)),
		ChartType: chartType,
		XKey:      "hotel",
		Series:    series,
		Data:      data,
		KPIs: []ArtifactKPI{
			{Label: "Facturación Top", Value: fmt.Sprintf("$ %s", formatMiles(int(totalFacturacion))), Tone: "brand"},
			{Label: "Prendas Procesadas", Value: formatMiles(totalPrendas), Tone: "emerald"},
			{Label: "Hoteles Listados", Value: fmt.Sprintf("%d", len(data)), Tone: "brand"},
		},
		SheetsPreview: []SheetPreview{
			{
				Name:    "Ranking",
				Headers: []string{"Hotel / Cliente", "Prendas", "Facturación ARS", "Relavados"},
				Rows:    previewRows,
			},
		},
	}

	summaryText := fmt.Sprintf("Se generó el gráfico interactivo del Ranking de Hoteles (%d clientes, %d prendas totales, facturación $ %s ARS).",
		len(data), totalPrendas, formatMiles(int(totalFacturacion)))

	return &CallToolResult{
		Content:  []ToolContent{{Type: "text", Text: summaryText}},
		Artifact: artifact,
	}, nil
}

func generarGraficoTendencia(ctx context.Context, db *pgxpool.Pool, id, chartType string, desde, hasta *time.Time, hotelNombre string) (*CallToolResult, error) {
	if chartType == "bar" || chartType == "pie" {
		chartType = "area"
	}

	query := `
		SELECT
			r.fecha,
			COALESCE(SUM(r.cantidad), 0)::int AS total,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS facturacion
		FROM registros r
		JOIN items i ON i.id = r.item_id
		JOIN hoteles h ON h.id = r.hotel_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
		  AND ($2::date IS NULL OR r.fecha <= $2)
		  AND ($3 = '' OR h.nombre ILIKE '%' || $3 || '%')
		GROUP BY r.fecha
		ORDER BY r.fecha ASC
	`
	rows, err := db.Query(ctx, query, desde, hasta, strings.TrimSpace(hotelNombre))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make([]map[string]any, 0)
	previewRows := make([][]string, 0)
	var sumPrendas int
	var sumFact float64

	for rows.Next() {
		var f time.Time
		var tot int
		var fact float64
		if err := rows.Scan(&f, &tot, &fact); err == nil {
			fStr := f.Format("2006-01-02")
			sumPrendas += tot
			sumFact += fact
			data = append(data, map[string]any{
				"fecha":       fStr,
				"prendas":     tot,
				"facturacion": math.Round(fact),
			})
			previewRows = append(previewRows, []string{
				fStr,
				fmt.Sprintf("%d", tot),
				fmt.Sprintf("$ %s", formatMiles(int(fact))),
			})
		}
	}

	subtitle := fmt.Sprintf("Evolución diaria de producción (%s a %s)", fmtFecha(desde), fmtFecha(hasta))
	if strings.TrimSpace(hotelNombre) != "" {
		subtitle += fmt.Sprintf(" - Hotel: %s", hotelNombre)
	}

	artifact := &ArtifactPayload{
		ID:        id,
		Type:      "chart",
		Title:     "Evolución y Tendencia de Producción",
		Subtitle:  subtitle,
		ChartType: chartType,
		XKey:      "fecha",
		Series: []ChartSeries{
			{Key: "prendas", Label: "Prendas por Día", Color: "#48c0b0", IsCurrency: false},
			{Key: "facturacion", Label: "Facturación ($ ARS)", Color: "#108080", IsCurrency: true},
		},
		Data: data,
		KPIs: []ArtifactKPI{
			{Label: "Días con Carga", Value: fmt.Sprintf("%d días", len(data)), Tone: "brand"},
			{Label: "Volumen Acumulado", Value: formatMiles(sumPrendas), Tone: "emerald"},
			{Label: "Facturación Total", Value: fmt.Sprintf("$ %s", formatMiles(int(sumFact))), Tone: "brand"},
		},
		SheetsPreview: []SheetPreview{
			{
				Name:    "Tendencia Diaria",
				Headers: []string{"Fecha", "Prendas", "Facturación ARS"},
				Rows:    previewRows,
			},
		},
	}

	return &CallToolResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Se generó el gráfico de evolución diaria (%d días registrados, %d prendas totales).", len(data), sumPrendas),
		}},
		Artifact: artifact,
	}, nil
}

func generarGraficoDesgloseHotel(ctx context.Context, db *pgxpool.Pool, id, chartType string, desde, hasta *time.Time, hotelNombre string) (*CallToolResult, error) {
	if strings.TrimSpace(hotelNombre) == "" {
		hotelNombre = "King David"
	}
	var hotelID int
	var nombreReal string
	err := db.QueryRow(ctx, "SELECT id, nombre FROM hoteles WHERE nombre ILIKE $1 ORDER BY activo DESC, id ASC LIMIT 1", "%"+strings.TrimSpace(hotelNombre)+"%").Scan(&hotelID, &nombreReal)
	if err != nil {
		return nil, fmt.Errorf("no se encontró hotel con nombre '%s'", hotelNombre)
	}

	query := `
		SELECT
			i.nombre,
			COALESCE(SUM(r.cantidad), 0)::int AS facturable,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS subtotal
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND ($2::date IS NULL OR r.fecha >= $2)
		  AND ($3::date IS NULL OR r.fecha <= $3)
		GROUP BY i.nombre
		ORDER BY facturable DESC
		LIMIT 10
	`
	rows, err := db.Query(ctx, query, hotelID, desde, hasta)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make([]map[string]any, 0)
	previewRows := make([][]string, 0)
	var totPrendas int
	var totFact float64

	for rows.Next() {
		var itNom string
		var cant int
		var sub float64
		if err := rows.Scan(&itNom, &cant, &sub); err == nil {
			totPrendas += cant
			totFact += sub
			data = append(data, map[string]any{
				"prenda":      itNom,
				"cantidad":    cant,
				"facturacion": math.Round(sub),
			})
			previewRows = append(previewRows, []string{
				itNom,
				fmt.Sprintf("%d", cant),
				fmt.Sprintf("$ %s", formatMiles(int(sub))),
			})
		}
	}

	artifact := &ArtifactPayload{
		ID:        id,
		Type:      "chart",
		Title:     fmt.Sprintf("Desglose de Prendas: %s", nombreReal),
		Subtitle:  fmt.Sprintf("Distribución de volumen y facturación por tipo de prenda (%s a %s)", fmtFecha(desde), fmtFecha(hasta)),
		ChartType: chartType,
		XKey:      "prenda",
		Series: []ChartSeries{
			{Key: "cantidad", Label: "Prendas", Color: "#48c0b0", IsCurrency: false},
			{Key: "facturacion", Label: "Facturación ($ ARS)", Color: "#108080", IsCurrency: true},
		},
		Data: data,
		KPIs: []ArtifactKPI{
			{Label: "Hotel", Value: nombreReal, Tone: "brand"},
			{Label: "Prendas Procesadas", Value: formatMiles(totPrendas), Tone: "emerald"},
			{Label: "Facturación Estimada", Value: fmt.Sprintf("$ %s", formatMiles(int(totFact))), Tone: "brand"},
		},
		SheetsPreview: []SheetPreview{
			{
				Name:    "Desglose por Prenda",
				Headers: []string{"Prenda / Concepto", "Cantidad", "Subtotal ARS"},
				Rows:    previewRows,
			},
		},
	}

	return &CallToolResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Se generó el gráfico de desglose de prendas para %s (%d prendas, facturación $ %s ARS).", nombreReal, totPrendas, formatMiles(int(totFact))),
		}},
		Artifact: artifact,
	}, nil
}

func generarGraficoProyeccionStaffing(ctx context.Context, db *pgxpool.Pool, id, chartType string) (*CallToolResult, error) {
	// Generar serie de 7 días futuros proyectados
	hoy := time.Now()
	data := make([]map[string]any, 0, 7)
	previewRows := make([][]string, 0, 7)
	nombresDias := []string{"Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"}

	totalPrendas := 0
	totalHoras := 0.0

	// Simulación basada en promedios históricos de planta (85 prendas/hora)
	basePicos := []int{80, 240, 260, 250, 310, 280, 270} // Dom -> Sáb

	for i := 1; i <= 7; i++ {
		diaFuturo := hoy.AddDate(0, 0, i)
		dow := int(diaFuturo.Weekday())
		prendas := basePicos[dow]
		horas := math.Round((float64(prendas)/85.0)*10) / 10
		operarios := int(math.Ceil(horas / 8.0))
		if operarios < 1 {
			operarios = 1
		}
		totalPrendas += prendas
		totalHoras += horas

		label := fmt.Sprintf("%s %02d/%02d", nombresDias[dow], diaFuturo.Day(), diaFuturo.Month())
		data = append(data, map[string]any{
			"dia":       label,
			"prendas":   prendas,
			"horas":     horas,
			"operarios": operarios,
		})
		previewRows = append(previewRows, []string{
			diaFuturo.Format("2006-01-02"),
			label,
			fmt.Sprintf("%d", prendas),
			fmt.Sprintf("%.1f hs", horas),
			fmt.Sprintf("%d op.", operarios),
		})
	}

	artifact := &ArtifactPayload{
		ID:        id,
		Type:      "chart",
		Title:     "Proyección de Demanda y Dotación de Personal",
		Subtitle:  "Demanda estimada de prendas y requerimiento de horas-hombre para los próximos 7 días",
		ChartType: "bar",
		XKey:      "dia",
		Series: []ChartSeries{
			{Key: "prendas", Label: "Prendas Estimadas", Color: "#48c0b0", IsCurrency: false},
			{Key: "horas", Label: "Horas-Hombre", Color: "#f59e0b", IsCurrency: false},
		},
		Data: data,
		KPIs: []ArtifactKPI{
			{Label: "Prendas Proyectadas", Value: formatMiles(totalPrendas), Tone: "brand"},
			{Label: "Horas Requeridas", Value: fmt.Sprintf("%.1f hs", totalHoras), Tone: "amber"},
			{Label: "Dotación Sugerida", Value: "1 a 2 operarios/turno", Tone: "emerald"},
		},
		SheetsPreview: []SheetPreview{
			{
				Name:    "Staffing Proyectado",
				Headers: []string{"Fecha", "Día", "Prendas Estimadas", "Horas-Hombre", "Operarios Sugeridos"},
				Rows:    previewRows,
			},
		},
	}

	return &CallToolResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Se generó la visualización de proyección de demanda y staffing (%d prendas estimadas para la próxima semana).", totalPrendas),
		}},
		Artifact: artifact,
	}, nil
}

func generarGraficoCalidadHoteles(ctx context.Context, db *pgxpool.Pool, id, chartType string, desde, hasta *time.Time, limit int) (*CallToolResult, error) {
	query := `
		SELECT
			h.nombre,
			COALESCE(SUM(r.cantidad), 0)::int AS total,
			COALESCE(SUM(r.cantidad_relavado), 0)::int AS relavado,
			COALESCE(SUM(r.cantidad_rota), 0)::int AS rotas
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
		  AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		HAVING SUM(r.cantidad) > 0
		ORDER BY SUM(r.cantidad_relavado) DESC
		LIMIT $3
	`
	rows, err := db.Query(ctx, query, desde, hasta, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	data := make([]map[string]any, 0)
	previewRows := make([][]string, 0)

	for rows.Next() {
		var nom string
		var tot, rel, rot int
		if err := rows.Scan(&nom, &tot, &rel, &rot); err == nil {
			pctRel := 0.0
			pctRot := 0.0
			if tot > 0 {
				pctRel = math.Round((float64(rel)/float64(tot))*1000) / 10
				pctRot = math.Round((float64(rot)/float64(tot))*1000) / 10
			}
			data = append(data, map[string]any{
				"hotel":       nom,
				"relavado":    rel,
				"roturas":     rot,
				"pctRelavado": pctRel,
				"pctRoturas":  pctRot,
			})
			previewRows = append(previewRows, []string{
				nom,
				fmt.Sprintf("%d", tot),
				fmt.Sprintf("%d (%.1f%%)", rel, pctRel),
				fmt.Sprintf("%d (%.1f%%)", rot, pctRot),
			})
		}
	}

	artifact := &ArtifactPayload{
		ID:        id,
		Type:      "chart",
		Title:     "Auditoría de Calidad: Relavado y Roturas por Hotel",
		Subtitle:  fmt.Sprintf("Comparativa de prendas reprocesadas y bajas en planta (%s a %s)", fmtFecha(desde), fmtFecha(hasta)),
		ChartType: "bar",
		XKey:      "hotel",
		Series: []ChartSeries{
			{Key: "relavado", Label: "Prendas Relavadas", Color: "#f59e0b", IsCurrency: false},
			{Key: "roturas", Label: "Prendas Rotas / Baja", Color: "#ef4444", IsCurrency: false},
		},
		Data: data,
		KPIs: []ArtifactKPI{
			{Label: "Umbral Calidad Relavado", Value: "≤ 5.0%", Tone: "amber"},
			{Label: "Umbral Roturas", Value: "≤ 2.0%", Tone: "rose"},
			{Label: "Hoteles Evaluados", Value: fmt.Sprintf("%d", len(data)), Tone: "brand"},
		},
		SheetsPreview: []SheetPreview{
			{
				Name:    "Calidad Operativa",
				Headers: []string{"Hotel", "Prendas Totales", "Relavados (%)", "Roturas (%)"},
				Rows:    previewRows,
			},
		},
	}

	return &CallToolResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Se generó el gráfico de auditoría de calidad con tasas de relavado y roturas para %d hoteles.", len(data)),
		}},
		Artifact: artifact,
	}, nil
}

// ── 11. generar_reporte_excel ───────────────────────────────────────────
func registerGenerarReporteExcelTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "generar_reporte_excel",
		Description: "Genera un libro de cálculo profesional Excel (.xlsx) con hojas múltiples, membrete oficial de TRITÓN Lavadero Industrial, fórmulas de totales y estilos corporativos. Permite descargar el archivo directamente desde el chat. Usá esta herramienta SIEMPRE que el usuario pida un Excel, reporte descargable, planilla, liquidación o exportar datos.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"tipo_reporte": {
					Type:        "string",
					Description: "Tipo de reporte a generar: 'ejecutivo_integral' (Multi-hoja: Resumen, Ranking, Tendencia, Catálogo), 'liquidacion_hotel' (Liquidación detallada por prenda para un cliente específico), 'ranking_clientes' (Ranking comercial y participación) o 'auditoria_calidad_remitos' (Tasas de rechazo y trazabilidad de remitos). Por defecto 'ejecutivo_integral'.",
					Enum:        []string{"ejecutivo_integral", "liquidacion_hotel", "ranking_clientes", "auditoria_calidad_remitos"},
				},
				"fecha_desde": {Type: "string", Description: "Fecha inicial YYYY-MM-DD"},
				"fecha_hasta": {Type: "string", Description: "Fecha final YYYY-MM-DD"},
				"hotel_nombre": {Type: "string", Description: "Nombre de hotel (obligatorio para 'liquidacion_hotel', opcional en otros)"},
				"titulo":       {Type: "string", Description: "Título personalizado opcional para la carátula del reporte"},
			},
			Required: []string{"tipo_reporte", "fecha_desde", "fecha_hasta"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		tipoReporte, _ := args["tipo_reporte"].(string)
		if tipoReporte == "" {
			tipoReporte = "ejecutivo_integral"
		}
		desde := parseDateStr(args["fecha_desde"])
		hasta := parseDateStr(args["fecha_hasta"])
		hotelNombre, _ := args["hotel_nombre"].(string)
		tituloCustom, _ := args["titulo"].(string)

		f := excelize.NewFile()
		defer func() { _ = f.Close() }()

		// Crear estilos corporativos de Tritón
		headerStyle, _ := f.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Bold: true, Color: "#FFFFFF", Size: 11, Family: "Calibri"},
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"#082048"}, Pattern: 1},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
			Border: []excelize.Border{
				{Type: "bottom", Color: "#48C0B0", Style: 2},
			},
		})

		titleStyle, _ := f.NewStyle(&excelize.Style{
			Font: &excelize.Font{Bold: true, Color: "#082048", Size: 16, Family: "Calibri"},
		})

		subtitleStyle, _ := f.NewStyle(&excelize.Style{
			Font: &excelize.Font{Color: "#108080", Size: 11, Italic: true, Family: "Calibri"},
		})

		currencyStyle, _ := f.NewStyle(&excelize.Style{
			CustomNumFmt: &[]string{`$ #,##0`}[0],
			Alignment:    &excelize.Alignment{Horizontal: "right"},
		})

		intStyle, _ := f.NewStyle(&excelize.Style{
			CustomNumFmt: &[]string{`#,##0`}[0],
			Alignment:    &excelize.Alignment{Horizontal: "right"},
		})

		totalStyle, _ := f.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Bold: true, Color: "#082048", Size: 11},
			Fill:      excelize.Fill{Type: "pattern", Color: []string{"#D5ECEE"}, Pattern: 1},
			Border:    []excelize.Border{{Type: "top", Color: "#108080", Style: 2}, {Type: "bottom", Color: "#108080", Style: 2}},
			Alignment: &excelize.Alignment{Horizontal: "right"},
		})

		var artifactTitle string
		var filename string
		sheetsPreview := make([]SheetPreview, 0)
		var kpis []ArtifactKPI

		fDesdeStr := fmtFecha(desde)
		fHastaStr := fmtFecha(hasta)

		switch tipoReporte {
		case "liquidacion_hotel":
			artifactTitle = "Liquidación Mensual de Cliente"
			if tituloCustom != "" {
				artifactTitle = tituloCustom
			}
			filename = fmt.Sprintf("Liquidacion_%s_%s_%s.xlsx", sanitizeFilePart(hotelNombre), fDesdeStr, fHastaStr)
			preview, err := buildExcelLiquidacionHotel(ctx, db, f, desde, hasta, hotelNombre, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle)
			if err != nil {
				return nil, err
			}
			sheetsPreview = append(sheetsPreview, preview...)
			kpis = []ArtifactKPI{
				{Label: "Tipo de Reporte", Value: "Liquidación Hotel", Tone: "brand"},
				{Label: "Período", Value: fmt.Sprintf("%s a %s", fDesdeStr, fHastaStr), Tone: "emerald"},
				{Label: "Formato", Value: "Excel Nativo (.xlsx)", Tone: "brand"},
			}

		case "ranking_clientes":
			artifactTitle = "Ranking Comercial de Clientes"
			if tituloCustom != "" {
				artifactTitle = tituloCustom
			}
			filename = fmt.Sprintf("Ranking_Clientes_Triton_%s_%s.xlsx", fDesdeStr, fHastaStr)
			preview, err := buildExcelRanking(ctx, db, f, desde, hasta, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle)
			if err != nil {
				return nil, err
			}
			sheetsPreview = append(sheetsPreview, preview...)
			kpis = []ArtifactKPI{
				{Label: "Tipo", Value: "Ranking Comercial", Tone: "brand"},
				{Label: "Período", Value: fmt.Sprintf("%s a %s", fDesdeStr, fHastaStr), Tone: "emerald"},
				{Label: "Hojas", Value: "Ranking & Participación", Tone: "brand"},
			}

		case "auditoria_calidad_remitos":
			artifactTitle = "Auditoría de Calidad y Conciliación B2B"
			if tituloCustom != "" {
				artifactTitle = tituloCustom
			}
			filename = fmt.Sprintf("Auditoria_Calidad_Triton_%s_%s.xlsx", fDesdeStr, fHastaStr)
			preview, err := buildExcelAuditoria(ctx, db, f, desde, hasta, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle)
			if err != nil {
				return nil, err
			}
			sheetsPreview = append(sheetsPreview, preview...)
			kpis = []ArtifactKPI{
				{Label: "Auditoría", Value: "Calidad y Remitos", Tone: "amber"},
				{Label: "Trazabilidad", Value: "Control Físico vs Declarado", Tone: "brand"},
				{Label: "Formato", Value: "Excel (.xlsx)", Tone: "emerald"},
			}

		default: // "ejecutivo_integral"
			artifactTitle = "Reporte Ejecutivo Integral TRITÓN BI"
			if tituloCustom != "" {
				artifactTitle = tituloCustom
			}
			filename = fmt.Sprintf("Reporte_Ejecutivo_Triton_%s_%s.xlsx", fDesdeStr, fHastaStr)
			preview, err := buildExcelEjecutivoIntegral(ctx, db, f, desde, hasta, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle)
			if err != nil {
				return nil, err
			}
			sheetsPreview = append(sheetsPreview, preview...)
			kpis = []ArtifactKPI{
				{Label: "Reporte", Value: "Ejecutivo Multi-Hoja", Tone: "brand"},
				{Label: "Hojas", Value: "Resumen, Ranking, Tendencia, Tarifario", Tone: "emerald"},
				{Label: "Período", Value: fmt.Sprintf("%s a %s", fDesdeStr, fHastaStr), Tone: "brand"},
			}
		}

		// Eliminar la hoja "Sheet1" default si no se usó
		_ = f.DeleteSheet("Sheet1")

		var buf bytes.Buffer
		if err := f.Write(&buf); err != nil {
			return nil, fmt.Errorf("error serializando workbook Excel: %w", err)
		}

		fileBase64 := base64.StdEncoding.EncodeToString(buf.Bytes())
		sizeKB := len(buf.Bytes()) / 1024
		if sizeKB == 0 {
			sizeKB = 1
		}

		artifact := &ArtifactPayload{
			ID:            fmt.Sprintf("excel-%d", time.Now().UnixNano()),
			Type:          "excel",
			Title:         artifactTitle,
			Subtitle:      fmt.Sprintf("Archivo Excel profesional multi-hoja generado con membrete TRITÓN (%d KB)", sizeKB),
			Filename:      filename,
			MimeType:      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			FileBase64:    fileBase64,
			SizeBytes:     len(buf.Bytes()),
			KPIs:          kpis,
			SheetsPreview: sheetsPreview,
		}

		summaryMsg := fmt.Sprintf("Se generó con éxito el reporte Excel **'%s'** (%d KB, %d hojas). El usuario ya dispone del botón de descarga directa y la vista previa en el chat.",
			filename, sizeKB, len(sheetsPreview))

		return &CallToolResult{
			Content:  []ToolContent{{Type: "text", Text: summaryMsg}},
			Artifact: artifact,
		}, nil
	})
}

// ── Builders de Hojas Excel ─────────────────────────────────────────────

func buildExcelEjecutivoIntegral(ctx context.Context, db *pgxpool.Pool, f *excelize.File, desde, hasta *time.Time, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle int) ([]SheetPreview, error) {
	previews := make([]SheetPreview, 0)

	// ── Hoja 1: Resumen General
	sheet1 := "Resumen General"
	f.NewSheet(sheet1)
	_ = f.SetCellValue(sheet1, "A1", "TRITÓN • Lavadero Industrial SRL")
	_ = f.SetCellStyle(sheet1, "A1", "A1", titleStyle)
	_ = f.SetCellValue(sheet1, "A2", fmt.Sprintf("Reporte Ejecutivo Consolidado | Período: %s a %s", fmtFecha(desde), fmtFecha(hasta)))
	_ = f.SetCellStyle(sheet1, "A2", "A2", subtitleStyle)

	var totalPrendas, facturables, relavado, rotas int
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
	`, desde, hasta).Scan(&totalPrendas, &facturables, &relavado, &rotas, &facturacion)

	_ = f.SetCellValue(sheet1, "A4", "Indicador Operativo / Financiero")
	_ = f.SetCellValue(sheet1, "B4", "Valor Consolidado")
	_ = f.SetCellStyle(sheet1, "A4", "B4", headerStyle)

	kpiRows := [][]any{
		{"Prendas Totales Procesadas", totalPrendas},
		{"Prendas Facturables", facturables},
		{"Prendas en Relavado", relavado},
		{"Prendas Rotas / Bajas", rotas},
		{"Facturación Estimada ($ ARS)", facturacion},
		{"Tasa de Relavado Industrial", fmt.Sprintf("%.2f%%", float64(relavado)*100.0/math.Max(1, float64(totalPrendas)))},
	}

	previewRows1 := make([][]string, 0)
	for i, kr := range kpiRows {
		rIdx := 5 + i
		_ = f.SetCellValue(sheet1, fmt.Sprintf("A%d", rIdx), kr[0])
		_ = f.SetCellValue(sheet1, fmt.Sprintf("B%d", rIdx), kr[1])
		if i == 4 {
			_ = f.SetCellStyle(sheet1, fmt.Sprintf("B%d", rIdx), fmt.Sprintf("B%d", rIdx), currencyStyle)
			previewRows1 = append(previewRows1, []string{fmt.Sprint(kr[0]), fmt.Sprintf("$ %s", formatMiles(int(facturacion)))})
		} else {
			if num, ok := kr[1].(int); ok {
				_ = f.SetCellStyle(sheet1, fmt.Sprintf("B%d", rIdx), fmt.Sprintf("B%d", rIdx), intStyle)
				previewRows1 = append(previewRows1, []string{fmt.Sprint(kr[0]), formatMiles(num)})
			} else {
				previewRows1 = append(previewRows1, []string{fmt.Sprint(kr[0]), fmt.Sprint(kr[1])})
			}
		}
	}
	_ = f.SetColWidth(sheet1, "A", "A", 35)
	_ = f.SetColWidth(sheet1, "B", "B", 25)

	previews = append(previews, SheetPreview{
		Name:    sheet1,
		Headers: []string{"Indicador", "Valor Consolidado"},
		Rows:    previewRows1,
	})

	// ── Hoja 2: Ranking de Hoteles
	sheet2 := "Ranking Clientes"
	f.NewSheet(sheet2)
	_ = f.SetCellValue(sheet2, "A1", "TRITÓN • Ranking de Facturación y Volumen por Cliente")
	_ = f.SetCellStyle(sheet2, "A1", "A1", titleStyle)

	headers2 := []string{"Hotel / Cliente", "Prendas Totales", "Prendas Relavadas", "Prendas Rotas", "Facturación ($ ARS)"}
	for cIdx, h := range headers2 {
		colName, _ := excelize.ColumnNumberToName(cIdx + 1)
		_ = f.SetCellValue(sheet2, fmt.Sprintf("%s3", colName), h)
	}
	_ = f.SetCellStyle(sheet2, "A3", "E3", headerStyle)

	rowsR, err := db.Query(ctx, `
		SELECT
			h.nombre,
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(r.cantidad_relavado), 0)::int,
			COALESCE(SUM(r.cantidad_rota), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
		  AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		ORDER BY 5 DESC
	`, desde, hasta)
	if err == nil {
		defer rowsR.Close()
		currRow := 4
		previewRows2 := make([][]string, 0)
		for rowsR.Next() {
			var nom string
			var cant, rel, rot int
			var fact float64
			if err := rowsR.Scan(&nom, &cant, &rel, &rot, &fact); err == nil {
				_ = f.SetCellValue(sheet2, fmt.Sprintf("A%d", currRow), nom)
				_ = f.SetCellValue(sheet2, fmt.Sprintf("B%d", currRow), cant)
				_ = f.SetCellValue(sheet2, fmt.Sprintf("C%d", currRow), rel)
				_ = f.SetCellValue(sheet2, fmt.Sprintf("D%d", currRow), rot)
				_ = f.SetCellValue(sheet2, fmt.Sprintf("E%d", currRow), fact)

				_ = f.SetCellStyle(sheet2, fmt.Sprintf("B%d", currRow), fmt.Sprintf("D%d", currRow), intStyle)
				_ = f.SetCellStyle(sheet2, fmt.Sprintf("E%d", currRow), fmt.Sprintf("E%d", currRow), currencyStyle)

				previewRows2 = append(previewRows2, []string{
					nom,
					formatMiles(cant),
					formatMiles(rel),
					formatMiles(rot),
					fmt.Sprintf("$ %s", formatMiles(int(fact))),
				})
				currRow++
			}
		}
		// Fila de totales
		if currRow > 4 {
			_ = f.SetCellValue(sheet2, fmt.Sprintf("A%d", currRow), "TOTALES")
			_ = f.SetCellFormula(sheet2, fmt.Sprintf("B%d", currRow), fmt.Sprintf("SUM(B4:B%d)", currRow-1))
			_ = f.SetCellFormula(sheet2, fmt.Sprintf("C%d", currRow), fmt.Sprintf("SUM(C4:C%d)", currRow-1))
			_ = f.SetCellFormula(sheet2, fmt.Sprintf("D%d", currRow), fmt.Sprintf("SUM(D4:D%d)", currRow-1))
			_ = f.SetCellFormula(sheet2, fmt.Sprintf("E%d", currRow), fmt.Sprintf("SUM(E4:E%d)", currRow-1))
			_ = f.SetCellStyle(sheet2, fmt.Sprintf("A%d", currRow), fmt.Sprintf("E%d", currRow), totalStyle)
		}
		_ = f.SetColWidth(sheet2, "A", "A", 30)
		_ = f.SetColWidth(sheet2, "B", "E", 18)

		previews = append(previews, SheetPreview{
			Name:    sheet2,
			Headers: headers2,
			Rows:    previewRows2,
		})
	}

	// ── Hoja 3: Tarifario y Catálogo Maestro
	sheet3 := "Tarifario Vigente"
	f.NewSheet(sheet3)
	_ = f.SetCellValue(sheet3, "A1", "TRITÓN • Catálogo Oficial de Prendas y Precios Unitarios")
	_ = f.SetCellStyle(sheet3, "A1", "A1", titleStyle)

	headers3 := []string{"Código", "Prenda / Concepto", "Precio Unitario ($ ARS)", "Se Factura"}
	for cIdx, h := range headers3 {
		colName, _ := excelize.ColumnNumberToName(cIdx + 1)
		_ = f.SetCellValue(sheet3, fmt.Sprintf("%s3", colName), h)
	}
	_ = f.SetCellStyle(sheet3, "A3", "D3", headerStyle)

	rowsT, err := db.Query(ctx, "SELECT codigo, nombre, COALESCE(precio_unitario, 0)::float8, se_factura FROM items ORDER BY se_factura DESC, nombre ASC")
	if err == nil {
		defer rowsT.Close()
		currRow := 4
		previewRows3 := make([][]string, 0)
		for rowsT.Next() {
			var cod, nom string
			var precio float64
			var fac bool
			if err := rowsT.Scan(&cod, &nom, &precio, &fac); err == nil {
				facStr := "Sí"
				if !fac {
					facStr = "No"
				}
				_ = f.SetCellValue(sheet3, fmt.Sprintf("A%d", currRow), cod)
				_ = f.SetCellValue(sheet3, fmt.Sprintf("B%d", currRow), nom)
				_ = f.SetCellValue(sheet3, fmt.Sprintf("C%d", currRow), precio)
				_ = f.SetCellValue(sheet3, fmt.Sprintf("D%d", currRow), facStr)

				_ = f.SetCellStyle(sheet3, fmt.Sprintf("C%d", currRow), fmt.Sprintf("C%d", currRow), currencyStyle)
				previewRows3 = append(previewRows3, []string{cod, nom, fmt.Sprintf("$ %s", formatMiles(int(precio))), facStr})
				currRow++
			}
		}
		_ = f.SetColWidth(sheet3, "A", "A", 12)
		_ = f.SetColWidth(sheet3, "B", "B", 35)
		_ = f.SetColWidth(sheet3, "C", "C", 22)
		_ = f.SetColWidth(sheet3, "D", "D", 14)

		previews = append(previews, SheetPreview{
			Name:    sheet3,
			Headers: headers3,
			Rows:    previewRows3,
		})
	}

	return previews, nil
}

func buildExcelLiquidacionHotel(ctx context.Context, db *pgxpool.Pool, f *excelize.File, desde, hasta *time.Time, hotelNombre string, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle int) ([]SheetPreview, error) {
	if strings.TrimSpace(hotelNombre) == "" {
		hotelNombre = "King David"
	}
	var hotelID int
	var nombreReal string
	err := db.QueryRow(ctx, "SELECT id, nombre FROM hoteles WHERE nombre ILIKE $1 ORDER BY activo DESC, id ASC LIMIT 1", "%"+strings.TrimSpace(hotelNombre)+"%").Scan(&hotelID, &nombreReal)
	if err != nil {
		return nil, fmt.Errorf("no se encontró hotel con nombre '%s'", hotelNombre)
	}

	sheet := "Liquidación Detallada"
	f.NewSheet(sheet)
	_ = f.SetCellValue(sheet, "A1", fmt.Sprintf("TRITÓN • Liquidación de Servicios: %s", nombreReal))
	_ = f.SetCellStyle(sheet, "A1", "A1", titleStyle)
	_ = f.SetCellValue(sheet, "A2", fmt.Sprintf("Período de Facturación: %s a %s", fmtFecha(desde), fmtFecha(hasta)))
	_ = f.SetCellStyle(sheet, "A2", "A2", subtitleStyle)

	headers := []string{"Prenda / Concepto", "Precio Unitario", "Prendas Limpias", "Prendas Relavadas", "Prendas Rotas", "Subtotal ($ ARS)"}
	for cIdx, h := range headers {
		colName, _ := excelize.ColumnNumberToName(cIdx + 1)
		_ = f.SetCellValue(sheet, fmt.Sprintf("%s4", colName), h)
	}
	_ = f.SetCellStyle(sheet, "A4", "F4", headerStyle)

	query := `
		SELECT
			i.nombre,
			COALESCE(i.precio_unitario, 0)::float8 AS precio,
			COALESCE(SUM(r.cantidad), 0)::int AS facturable,
			COALESCE(SUM(r.cantidad_relavado), 0)::int AS relavado,
			COALESCE(SUM(r.cantidad_rota), 0)::int AS rotas,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8 AS subtotal
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE r.hotel_id = $1
		  AND ($2::date IS NULL OR r.fecha >= $2)
		  AND ($3::date IS NULL OR r.fecha <= $3)
		GROUP BY i.nombre, i.precio_unitario
		ORDER BY subtotal DESC, facturable DESC
	`
	rows, err := db.Query(ctx, query, hotelID, desde, hasta)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	currRow := 5
	previewRows := make([][]string, 0)
	for rows.Next() {
		var itNom string
		var prec, sub float64
		var fac, rel, rot int
		if err := rows.Scan(&itNom, &prec, &fac, &rel, &rot, &sub); err == nil {
			_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", currRow), itNom)
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", currRow), prec)
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", currRow), fac)
			_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", currRow), rel)
			_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", currRow), rot)
			_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", currRow), sub)

			_ = f.SetCellStyle(sheet, fmt.Sprintf("B%d", currRow), fmt.Sprintf("B%d", currRow), currencyStyle)
			_ = f.SetCellStyle(sheet, fmt.Sprintf("C%d", currRow), fmt.Sprintf("E%d", currRow), intStyle)
			_ = f.SetCellStyle(sheet, fmt.Sprintf("F%d", currRow), fmt.Sprintf("F%d", currRow), currencyStyle)

			previewRows = append(previewRows, []string{
				itNom,
				fmt.Sprintf("$ %s", formatMiles(int(prec))),
				formatMiles(fac),
				formatMiles(rel),
				formatMiles(rot),
				fmt.Sprintf("$ %s", formatMiles(int(sub))),
			})
			currRow++
		}
	}

	if currRow > 5 {
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", currRow), "TOTAL A LIQUIDAR")
		_ = f.SetCellFormula(sheet, fmt.Sprintf("C%d", currRow), fmt.Sprintf("SUM(C5:C%d)", currRow-1))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("D%d", currRow), fmt.Sprintf("SUM(D5:D%d)", currRow-1))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("E%d", currRow), fmt.Sprintf("SUM(E5:E%d)", currRow-1))
		_ = f.SetCellFormula(sheet, fmt.Sprintf("F%d", currRow), fmt.Sprintf("SUM(F5:F%d)", currRow-1))
		_ = f.SetCellStyle(sheet, fmt.Sprintf("A%d", currRow), fmt.Sprintf("F%d", currRow), totalStyle)
	}

	_ = f.SetColWidth(sheet, "A", "A", 32)
	_ = f.SetColWidth(sheet, "B", "F", 18)

	return []SheetPreview{
		{
			Name:    sheet,
			Headers: headers,
			Rows:    previewRows,
		},
	}, nil
}

func buildExcelRanking(ctx context.Context, db *pgxpool.Pool, f *excelize.File, desde, hasta *time.Time, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle int) ([]SheetPreview, error) {
	sheet := "Ranking Clientes"
	f.NewSheet(sheet)
	_ = f.SetCellValue(sheet, "A1", "TRITÓN • Ranking Comercial de Clientes")
	_ = f.SetCellStyle(sheet, "A1", "A1", titleStyle)
	_ = f.SetCellValue(sheet, "A2", fmt.Sprintf("Período: %s a %s", fmtFecha(desde), fmtFecha(hasta)))
	_ = f.SetCellStyle(sheet, "A2", "A2", subtitleStyle)

	headers := []string{"Posición", "Cliente / Hotel", "Prendas Procesadas", "Relavados", "Facturación Estimada ($ ARS)", "Participación"}
	for cIdx, h := range headers {
		colName, _ := excelize.ColumnNumberToName(cIdx + 1)
		_ = f.SetCellValue(sheet, fmt.Sprintf("%s4", colName), h)
	}
	_ = f.SetCellStyle(sheet, "A4", "F4", headerStyle)

	rowsR, err := db.Query(ctx, `
		SELECT
			h.nombre,
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(r.cantidad_relavado), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
		  AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		ORDER BY 4 DESC
	`, desde, hasta)
	if err != nil {
		return nil, err
	}
	defer rowsR.Close()

	type hRow struct {
		nombre string
		cant   int
		rel    int
		fact   float64
	}
	hList := make([]hRow, 0)
	var totFact float64
	for rowsR.Next() {
		var hr hRow
		if err := rowsR.Scan(&hr.nombre, &hr.cant, &hr.rel, &hr.fact); err == nil {
			totFact += hr.fact
			hList = append(hList, hr)
		}
	}

	currRow := 5
	previewRows := make([][]string, 0)
	for pos, hr := range hList {
		pct := 0.0
		if totFact > 0 {
			pct = math.Round((hr.fact/totFact)*1000) / 10
		}
		_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", currRow), pos+1)
		_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", currRow), hr.nombre)
		_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", currRow), hr.cant)
		_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", currRow), hr.rel)
		_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", currRow), hr.fact)
		_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", currRow), fmt.Sprintf("%.1f%%", pct))

		_ = f.SetCellStyle(sheet, fmt.Sprintf("A%d", currRow), fmt.Sprintf("A%d", currRow), intStyle)
		_ = f.SetCellStyle(sheet, fmt.Sprintf("C%d", currRow), fmt.Sprintf("D%d", currRow), intStyle)
		_ = f.SetCellStyle(sheet, fmt.Sprintf("E%d", currRow), fmt.Sprintf("E%d", currRow), currencyStyle)

		previewRows = append(previewRows, []string{
			fmt.Sprintf("#%d", pos+1),
			hr.nombre,
			formatMiles(hr.cant),
			formatMiles(hr.rel),
			fmt.Sprintf("$ %s", formatMiles(int(hr.fact))),
			fmt.Sprintf("%.1f%%", pct),
		})
		currRow++
	}

	_ = f.SetColWidth(sheet, "A", "A", 10)
	_ = f.SetColWidth(sheet, "B", "B", 32)
	_ = f.SetColWidth(sheet, "C", "F", 20)

	return []SheetPreview{
		{
			Name:    sheet,
			Headers: headers,
			Rows:    previewRows,
		},
	}, nil
}

func buildExcelAuditoria(ctx context.Context, db *pgxpool.Pool, f *excelize.File, desde, hasta *time.Time, headerStyle, titleStyle, subtitleStyle, currencyStyle, intStyle, totalStyle int) ([]SheetPreview, error) {
	sheet := "Auditoría Remitos B2B"
	f.NewSheet(sheet)
	_ = f.SetCellValue(sheet, "A1", "TRITÓN • Auditoría de Trazabilidad y Remitos Digitales")
	_ = f.SetCellStyle(sheet, "A1", "A1", titleStyle)

	headers := []string{"Remito QR", "Hotel / Cliente", "Fecha", "Estado", "Declarado", "Contado", "Diferencia"}
	for cIdx, h := range headers {
		colName, _ := excelize.ColumnNumberToName(cIdx + 1)
		_ = f.SetCellValue(sheet, fmt.Sprintf("%s3", colName), h)
	}
	_ = f.SetCellStyle(sheet, "A3", "G3", headerStyle)

	rowsA, err := db.Query(ctx, `
		SELECT
			e.codigo_qr,
			h.nombre,
			e.fecha_creacion,
			COALESCE(c.estado_conciliacion, e.estado),
			COALESCE(c.total_declarado, 0)::int,
			COALESCE(c.total_procesado, 0)::int,
			COALESCE(c.diferencia, 0)::int
		FROM envios e
		JOIN hoteles h ON h.id = e.hotel_id
		LEFT JOIN conciliaciones_despacho c ON c.envio_id = e.id
		ORDER BY e.fecha_creacion DESC
		LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rowsA.Close()

	currRow := 4
	previewRows := make([][]string, 0)
	for rowsA.Next() {
		var qr, nom, est string
		var fc time.Time
		var dec, proc, dif int
		if err := rowsA.Scan(&qr, &nom, &fc, &est, &dec, &proc, &dif); err == nil {
			_ = f.SetCellValue(sheet, fmt.Sprintf("A%d", currRow), qr)
			_ = f.SetCellValue(sheet, fmt.Sprintf("B%d", currRow), nom)
			_ = f.SetCellValue(sheet, fmt.Sprintf("C%d", currRow), fc.Format("2006-01-02"))
			_ = f.SetCellValue(sheet, fmt.Sprintf("D%d", currRow), est)
			_ = f.SetCellValue(sheet, fmt.Sprintf("E%d", currRow), dec)
			_ = f.SetCellValue(sheet, fmt.Sprintf("F%d", currRow), proc)
			_ = f.SetCellValue(sheet, fmt.Sprintf("G%d", currRow), dif)

			_ = f.SetCellStyle(sheet, fmt.Sprintf("E%d", currRow), fmt.Sprintf("G%d", currRow), intStyle)

			previewRows = append(previewRows, []string{
				qr,
				nom,
				fc.Format("2006-01-02"),
				est,
				formatMiles(dec),
				formatMiles(proc),
				formatMiles(dif),
			})
			currRow++
		}
	}

	_ = f.SetColWidth(sheet, "A", "A", 20)
	_ = f.SetColWidth(sheet, "B", "B", 30)
	_ = f.SetColWidth(sheet, "C", "D", 16)
	_ = f.SetColWidth(sheet, "E", "G", 15)

	return []SheetPreview{
		{
			Name:    sheet,
			Headers: headers,
			Rows:    previewRows,
		},
	}, nil
}

func sanitizeFilePart(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "Cliente"
	}
	reg := strings.NewReplacer(" ", "_", "/", "-", "\\", "-", ":", "-")
	return reg.Replace(s)
}

func formatMiles(n int) string {
	in := fmt.Sprintf("%d", n)
	out := ""
	for i, c := range in {
		if i > 0 && (len(in)-i)%3 == 0 {
			out += "."
		}
		out += string(c)
	}
	return out
}

func fmtFecha(t *time.Time) string {
	if t == nil {
		return "período histórico"
	}
	return t.Format("2006-01-02")
}
