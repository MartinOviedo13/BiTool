package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"lavadero-bi/backend/internal/mcp"
)

// IAService orquesta el ciclo de consulta inteligente conectando la API de IA (Gemini)
// con el catálogo de herramientas y recursos del servidor MCP.
type IAService struct {
	db        *pgxpool.Pool
	provider  LLMProvider
	mcpServer *mcp.Server
}

// NewIAService construye el servicio inyectando el pool, el LLMProvider y el servidor MCP.
func NewIAService(db *pgxpool.Pool, provider LLMProvider, mcpServer *mcp.Server) *IAService {
	return &IAService{
		db:        db,
		provider:  provider,
		mcpServer: mcpServer,
	}
}

// GetMCPServer expone la instancia del servidor MCP.
func (s *IAService) GetMCPServer() *mcp.Server {
	return s.mcpServer
}

const iaSystemPrompt = `Sos el asistente de inteligencia de negocio y auditoría operativa del lavadero industrial Poseidón SRL (marca comercial TRITÓN).
Tenés acceso a herramientas del protocolo MCP (Model Context Protocol) para consultar en tiempo real métricas de negocio, rankings, fichas de clientes, alertas, remitos B2B y proyecciones de personal.

REGLAS DE ACTUACIÓN:
1. Usá las herramientas MCP para responder con datos precisos. NUNCA inventes números ni nombres de clientes.
2. Si la pregunta requiere datos que están disponibles en una herramienta (ej. qué hotel facturó menos, tasa de relavado, quién es el principal cliente, estado de remitos con diferencias, o dotación de personal), INVOCÁ la herramienta correspondiente.
3. Respondé en español argentino, con tono profesional y ejecutivo, claro y conciso para los directores y operarios del lavadero.
4. Cuando cites cantidades monetarias, expresalas en pesos argentinos (ARS).
5. Si detectás tasas de relavado > 5% o roturas > 2%, mencioná la recomendación de control de calidad correspondiente.
6. Si una pregunta no puede responderse con ninguna de las herramientas disponibles, explicalo amablemente.`

// IAResponse agrupa la respuesta generada y las herramientas MCP que se utilizaron.
type IAResponse struct {
	Respuesta   string   `json:"respuesta"`
	ToolsUsadas []string `json:"tools_usadas"`
}

// AskWithMCP ejecuta el ciclo agéntico de Tool Calling con el servidor MCP.
func (s *IAService) AskWithMCP(ctx context.Context, pregunta string, desde, hasta *time.Time, historial []Message) (*IAResponse, error) {
	if s.provider == nil {
		return nil, ErrNoAPIKey
	}

	// 1. Obtener herramientas disponibles desde el servidor MCP
	var availableTools []mcp.Tool
	if s.mcpServer != nil {
		availableTools = s.mcpServer.ListTools()
	}

	// 2. Construir contexto inicial con fechas por defecto
	periodoContext := fmt.Sprintf("Contexto temporal seleccionado por el usuario en el dashboard: desde %s hasta %s.",
		fmtFecha(desde), fmtFecha(hasta))

	systemInstruction := iaSystemPrompt + "\n\n" + periodoContext

	// 3. Preparar historial de mensajes
	conversation := make([]Message, 0, len(historial)+8)

	// Agregar mensajes previos del historial si fueron provistos
	for _, hm := range historial {
		if hm.Role == "user" || hm.Role == "assistant" {
			conversation = append(conversation, hm)
		}
	}

	// Agregar la pregunta actual del usuario
	promptActual := pregunta
	if desde != nil && hasta != nil {
		promptActual = fmt.Sprintf("%s\n(Rango de análisis sugerido: %s a %s)", pregunta, desde.Format("2006-01-02"), hasta.Format("2006-01-02"))
	}
	conversation = append(conversation, Message{Role: "user", Content: promptActual})

	toolsUsadasMap := make(map[string]bool)
	const maxRounds = 4

	// 4. Ciclo agéntico (Loop de Tool Calling)
	for round := 0; round < maxRounds; round++ {
		resp, err := s.provider.GenerateWithTools(ctx, systemInstruction, conversation, availableTools)
		if err != nil {
			log.Printf("[IA Services] Error en ronda %d de Gemini: %v", round+1, err)
			return nil, err
		}

		// Si el modelo no solicitó ninguna tool call, tenemos la respuesta final
		if len(resp.ToolCalls) == 0 {
			toolsList := make([]string, 0, len(toolsUsadasMap))
			for t := range toolsUsadasMap {
				toolsList = append(toolsList, t)
			}
			return &IAResponse{
				Respuesta:   resp.Text,
				ToolsUsadas: toolsList,
			}, nil
		}

		// Si el modelo solicitó invocar herramientas MCP:
		assistantTurn := Message{
			Role:      "assistant",
			Content:   resp.Text,
			ToolCalls: resp.ToolCalls,
		}
		conversation = append(conversation, assistantTurn)

		// Ejecutar cada herramienta solicitada a través de MCP
		for _, tc := range resp.ToolCalls {
			toolsUsadasMap[tc.Name] = true
			log.Printf("[IA MCP Host] Invocando tool: %s con args: %+v", tc.Name, tc.Arguments)

			var resultContent string
			var isError bool

			if s.mcpServer != nil {
				callRes, err := s.mcpServer.CallTool(ctx, tc.Name, tc.Arguments)
				if err != nil {
					isError = true
					resultContent = fmt.Sprintf(`{"error": "%s"}`, err.Error())
				} else if len(callRes.Content) > 0 {
					resultContent = callRes.Content[0].Text
					isError = callRes.IsError
				} else {
					resultContent = `{"resultado": "ok"}`
				}
			} else {
				isError = true
				resultContent = `{"error": "servidor MCP no inicializado"}`
			}

			// Agregar respuesta de la herramienta al historial
			conversation = append(conversation, Message{
				Role: "function",
				ToolResponse: &ToolResult{
					ID:      tc.ID,
					Name:    tc.Name,
					Content: resultContent,
					IsError: isError,
				},
			})
		}
	}

	// Si se alcanzó el límite de rondas, forzar síntesis final
	finalResp, err := s.provider.Complete(ctx, systemInstruction, conversation)
	if err != nil {
		return nil, err
	}

	toolsList := make([]string, 0, len(toolsUsadasMap))
	for t := range toolsUsadasMap {
		toolsList = append(toolsList, t)
	}

	return &IAResponse{
		Respuesta:   finalResp,
		ToolsUsadas: toolsList,
	}, nil
}

// Ask mantiene compatibilidad con la firma anterior devolviendo solo el string de respuesta.
func (s *IAService) Ask(ctx context.Context, pregunta string, desde, hasta *time.Time) (string, error) {
	resp, err := s.AskWithMCP(ctx, pregunta, desde, hasta, nil)
	if err != nil {
		return "", err
	}
	return resp.Respuesta, nil
}

func fmtFecha(t *time.Time) string {
	if t == nil {
		return "período histórico"
	}
	return t.Format("2006-01-02")
}
