package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterAllResources registra los recursos de contexto MCP en el servidor.
func RegisterAllResources(s *Server, db *pgxpool.Pool) {
	// 1. Reglas de negocio e indicadores clave
	s.RegisterResource(Resource{
		URI:         "lavadero://contexto/reglas-negocio",
		Name:        "Reglas de Negocio y Umbrales Industriales de Poseidón SRL",
		Description: "Umbrales clave de auditoría: relavado, roturas, concentración y políticas tarifarias.",
		MimeType:    "text/plain",
	}, func(ctx context.Context, uri string) (*ResourceContent, error) {
		text := strings.TrimSpace(`
REGLAS DE NEGOCIO — LAVADERO INDUSTRIAL TRITÓN (Poseidón SRL):
1. CONTROL DE CALIDAD Y RELAVADO:
   - Umbral óptimo de relavado: menor o igual al 5% del volumen total.
   - Si supera el 5%, se activa alerta preventiva de dosificación y calibración de centrífugas.
2. ROTURAS Y BAJAS DE PRENDAS:
   - Umbral máximo admisible de prendas rotas o dadas de baja: 2% del total.
   - Tasas mayores a 2% indican exceso de cloro o desgaste mecánico.
3. CONCENTRACIÓN DE CLIENTES:
   - Una dependencia de un único hotel mayor o igual al 50% del volumen representa un riesgo de capacidad ociosa ante bajas de temporada.
4. FACTURACIÓN:
   - Las prendas con se_factura = true y precio unitario nulo o cero subestiman la facturación real.
5. REMITOS Y CONCILIACIÓN:
   - Remitos con estado "validado_con_diferencia" requieren seguimiento administrativo con el hotel.
`)
		return &ResourceContent{
			URI:      uri,
			MimeType: "text/plain",
			Text:     text,
		}, nil
	})

	// 2. Resumen de catálogo (hoteles e ítems) para desambiguación rápida
	s.RegisterResource(Resource{
		URI:         "lavadero://catalogos/resumen",
		Name:        "Resumen Maestro de Catálogos",
		Description: "Lista compacta de nombres de hoteles activos y prendas para facilitar el reconocimiento de entidades.",
		MimeType:    "text/plain",
	}, func(ctx context.Context, uri string) (*ResourceContent, error) {
		hrows, err := db.Query(ctx, "SELECT nombre FROM hoteles WHERE activo = true ORDER BY nombre ASC")
		if err != nil {
			return nil, err
		}
		defer hrows.Close()

		var hoteles []string
		for hrows.Next() {
			var n string
			if err := hrows.Scan(&n); err == nil {
				hoteles = append(hoteles, n)
			}
		}

		irows, err := db.Query(ctx, "SELECT nombre, se_factura FROM items ORDER BY nombre ASC")
		if err != nil {
			return nil, err
		}
		defer irows.Close()

		var items []string
		for irows.Next() {
			var n string
			var sf bool
			if err := irows.Scan(&n, &sf); err == nil {
				tipo := "facturable"
				if !sf {
					tipo = "no facturable"
				}
				items = append(items, fmt.Sprintf("%s (%s)", n, tipo))
			}
		}

		content := fmt.Sprintf("HOTELES ACTIVOS (%d):\n- %s\n\nPRENDAS DEL CATÁLOGO (%d):\n- %s",
			len(hoteles), strings.Join(hoteles, "\n- "),
			len(items), strings.Join(items, "\n- "))

		return &ResourceContent{
			URI:      uri,
			MimeType: "text/plain",
			Text:     content,
		}, nil
	})
}
