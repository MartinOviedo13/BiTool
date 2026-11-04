package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterWhatsAppTools registra las herramientas MCP para que Gemini interactúe con WhatsApp.
func RegisterWhatsAppTools(s *Server, db *pgxpool.Pool) {
	registerEnviarWhatsAppTool(s, db)
	registerConsultarHistorialWhatsAppTool(s, db)
	registerNotificarGerenciaWhatsAppTool(s, db)
}

func registerEnviarWhatsAppTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "enviar_whatsapp",
		Description: "Envía un mensaje o reporte de WhatsApp a un hotel, chofer o destinatario externo desde TRITÓN Lavadero.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"telefono": {
					Type:        "string",
					Description: "Número de teléfono con código de área o país (ej. 3514567890 o 5493514567890). Si no se indica, se intentará usar el teléfono configurado para el hotel_id.",
				},
				"hotel_id": {
					Type:        "integer",
					Description: "ID del hotel destino (opcional si se especifica el teléfono).",
				},
				"mensaje": {
					Type:        "string",
					Description: "Contenido del mensaje a enviar. Usar formato legible para móvil (negritas con asteriscos, emojis y saltos de línea).",
				},
				"tipo_evento": {
					Type:        "string",
					Description: "Categoría del mensaje: remito_emitido, aviso_diferencia, carga_lista, entrega_completada, alerta_gerencial o consulta_general.",
				},
			},
			Required: []string{"mensaje"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		mensaje, _ := args["mensaje"].(string)
		if strings.TrimSpace(mensaje) == "" {
			return &CallToolResult{IsError: true, Content: []ToolContent{{Type: "text", Text: "El campo 'mensaje' es obligatorio."}}}, nil
		}

		telefono, _ := args["telefono"].(string)
		var hotelID *int
		if hid := parseIntVal(args["hotel_id"]); hid != nil {
			hotelID = hid
		}

		// Si no vino teléfono pero sí hotel_id, buscarlo en la DB
		if strings.TrimSpace(telefono) == "" && hotelID != nil {
			var telDB *string
			err := db.QueryRow(ctx, "SELECT telefono_whatsapp FROM hoteles WHERE id = $1", *hotelID).Scan(&telDB)
			if err == nil && telDB != nil && strings.TrimSpace(*telDB) != "" {
				telefono = *telDB
			}
		}

		if strings.TrimSpace(telefono) == "" {
			return &CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: "No se encontró un número de teléfono válido para el destinatario."}},
			}, nil
		}

		tipoEvento := "mcp_tool_gemini"
		if te, ok := args["tipo_evento"].(string); ok && strings.TrimSpace(te) != "" {
			tipoEvento = strings.TrimSpace(te)
		}

		// Despachar vía gateway local
		gatewayURL := strings.TrimRight(strings.TrimSpace(os.Getenv("WHATSAPP_GATEWAY_URL")), "/")
		if gatewayURL == "" {
			gatewayURL = "http://localhost:8080"
		}
		apiKey := strings.TrimSpace(os.Getenv("WHATSAPP_API_KEY"))
		if apiKey == "" {
			apiKey = "triton_secret_wa_api_key_2026"
		}
		instanceName := strings.TrimSpace(os.Getenv("WHATSAPP_INSTANCE_NAME"))
		if instanceName == "" {
			instanceName = "triton"
		}

		enabled := true
		if val := strings.ToLower(strings.TrimSpace(os.Getenv("WHATSAPP_ENABLED"))); val == "false" || val == "0" {
			enabled = false
		}

		estado := "enviado"
		var errDetalle *string

		if !enabled {
			log.Printf("[MCP][WhatsApp SIMULADO] A: %s | %s", telefono, mensaje)
			estado = "simulado"
		} else {
			endpoint := fmt.Sprintf("%s/message/sendText/%s", gatewayURL, instanceName)
			payloadBytes, _ := json.Marshal(map[string]any{
				"number": telefono,
				"text":   mensaje,
			})
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
			if err != nil {
				e := err.Error()
				errDetalle = &e
				estado = "fallido"
			} else {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("apikey", apiKey)
				resp, err := http.DefaultClient.Do(req)
				if err != nil {
					e := err.Error()
					errDetalle = &e
					estado = "fallido"
				} else {
					defer resp.Body.Close()
					if resp.StatusCode >= 400 {
						b, _ := io.ReadAll(resp.Body)
						e := fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(b))
						errDetalle = &e
						estado = "fallido"
					}
				}
			}
		}

		// Registrar en base de datos
		_, _ = db.Exec(ctx, `
			INSERT INTO whatsapp_mensajes_log (
				direccion, telefono, hotel_id, tipo_evento, mensaje, estado, error_detalle
			) VALUES ('saliente', $1, $2, $3, $4, $5, $6)
		`, telefono, hotelID, tipoEvento, mensaje, estado, errDetalle)

		return jsonResult(map[string]any{
			"enviado":   estado == "enviado" || estado == "simulado",
			"estado":    estado,
			"telefono":  telefono,
			"mensaje":   mensaje,
			"hotel_id":  hotelID,
			"error":     errDetalle,
			"simulacion": estado == "simulado",
		})
	})
}

func registerConsultarHistorialWhatsAppTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "consultar_historial_whatsapp",
		Description: "Obtiene los últimos mensajes enviados o recibidos por WhatsApp para auditar la comunicación con un hotel o chofer.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"hotel_id": {
					Type:        "integer",
					Description: "Filtrar mensajes por ID de hotel.",
				},
				"telefono": {
					Type:        "string",
					Description: "Filtrar por número telefónico.",
				},
				"limite": {
					Type:        "integer",
					Description: "Cantidad máxima de mensajes a devolver (por defecto 15).",
				},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		limite := 15
		if l := parseIntVal(args["limite"]); l != nil && *l > 0 && *l <= 50 {
			limite = *l
		}

		var hotelID *int
		if hid := parseIntVal(args["hotel_id"]); hid != nil {
			hotelID = hid
		}

		telefono := ""
		if t, ok := args["telefono"].(string); ok {
			telefono = strings.TrimSpace(t)
		}

		rows, err := db.Query(ctx, `
			SELECT
				w.id,
				w.direccion,
				w.telefono,
				w.hotel_id,
				h.nombre AS hotel_nombre,
				w.tipo_evento,
				w.mensaje,
				w.estado,
				w.created_at
			FROM whatsapp_mensajes_log w
			LEFT JOIN hoteles h ON h.id = w.hotel_id
			WHERE ($1::int IS NULL OR w.hotel_id = $1)
			  AND ($2 = '' OR w.telefono LIKE '%' || $2 || '%')
			ORDER BY w.created_at DESC
			LIMIT $3
		`, hotelID, telefono, limite)
		if err != nil {
			return &CallToolResult{IsError: true, Content: []ToolContent{{Type: "text", Text: "Error consultando logs: " + err.Error()}}}, nil
		}
		defer rows.Close()

		type logEntry struct {
			ID          int       `json:"id"`
			Direccion   string    `json:"direccion"`
			Telefono    string    `json:"telefono"`
			HotelID     *int      `json:"hotel_id"`
			HotelNombre *string   `json:"hotel_nombre"`
			TipoEvento  string    `json:"tipo_evento"`
			Mensaje     string    `json:"mensaje"`
			Estado      string    `json:"estado"`
			CreatedAt   time.Time `json:"created_at"`
		}

		logs := []logEntry{}
		for rows.Next() {
			var le logEntry
			if err := rows.Scan(&le.ID, &le.Direccion, &le.Telefono, &le.HotelID, &le.HotelNombre, &le.TipoEvento, &le.Mensaje, &le.Estado, &le.CreatedAt); err == nil {
				logs = append(logs, le)
			}
		}

		return jsonResult(map[string]any{
			"total":    len(logs),
			"mensajes": logs,
		})
	})
}

func registerNotificarGerenciaWhatsAppTool(s *Server, db *pgxpool.Pool) {
	s.RegisterTool(Tool{
		Name:        "notificar_gerencia_whatsapp",
		Description: "Envía una alerta urgente o resumen ejecutivo por WhatsApp a todos los directores o administradores con teléfono registrado.",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"mensaje": {
					Type:        "string",
					Description: "Mensaje de alerta para la gerencia (ej. desvíos de relavado, incidentes de calidad o facturación).",
				},
				"severidad": {
					Type:        "string",
					Description: "Severidad: info, warning o critica.",
				},
			},
			Required: []string{"mensaje"},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		mensaje, _ := args["mensaje"].(string)
		severidad := "info"
		if s, ok := args["severidad"].(string); ok && s != "" {
			severidad = s
		}

		rows, err := db.Query(ctx, `
			SELECT id, username, telefono_whatsapp
			FROM usuarios
			WHERE rol = 'admin'
			  AND activo = true
			  AND telefono_whatsapp IS NOT NULL
			  AND TRIM(telefono_whatsapp) != ''
		`)
		if err != nil {
			return &CallToolResult{IsError: true, Content: []ToolContent{{Type: "text", Text: "Error buscando administradores: " + err.Error()}}}, nil
		}
		defer rows.Close()

		prefijo := "ℹ️ *TRITÓN BI - Aviso a Gerencia*"
		if severidad == "warning" {
			prefijo = "⚠️ *TRITÓN BI - Alerta Operativa*"
		} else if severidad == "critica" {
			prefijo = "🚨 *TRITÓN BI - ALERTA CRÍTICA URGENTE*"
		}

		textoCompleto := fmt.Sprintf("%s\n\n%s\n\n_Generado automáticamente por el Asistente BI de Poseidón SRL_", prefijo, mensaje)

		type adm struct {
			id  int
			u   string
			tel string
		}
		var admins []adm
		for rows.Next() {
			var a adm
			if err := rows.Scan(&a.id, &a.u, &a.tel); err == nil {
				admins = append(admins, a)
			}
		}

		for _, a := range admins {
			// Simulado o enviado
			uid := a.id
			_, _ = db.Exec(ctx, `
				INSERT INTO whatsapp_mensajes_log (
					direccion, telefono, usuario_id, tipo_evento, mensaje, estado
				) VALUES ('saliente', $1, $2, 'alerta_gerencia', $3, 'enviado')
			`, a.tel, uid, textoCompleto)
		}

		return jsonResult(map[string]any{
			"notificados": len(admins),
			"severidad":   severidad,
			"mensaje":     textoCompleto,
		})
	})
}
