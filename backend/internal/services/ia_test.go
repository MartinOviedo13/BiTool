package services

import (
	"context"
	"testing"
	"time"

	"lavadero-bi/backend/internal/mcp"
)

// mockLLMProvider simula el comportamiento de Gemini para pruebas unitarias.
type mockLLMProvider struct {
	turn int
}

func (m *mockLLMProvider) Complete(ctx context.Context, system string, userMessages []Message) (string, error) {
	return "Respuesta final sintetizada", nil
}

func (m *mockLLMProvider) GenerateWithTools(ctx context.Context, system string, history []Message, tools []mcp.Tool) (*LLMResponse, error) {
	m.turn++
	if m.turn == 1 {
		// En el primer turno solicita ejecutar la tool 'get_resumen_mock'
		return &LLMResponse{
			Text: "Voy a consultar las métricas generales.",
			ToolCalls: []ToolCall{
				{
					Name: "get_resumen_mock",
					Arguments: map[string]any{
						"fecha_desde": "2026-03-01",
						"fecha_hasta": "2026-03-31",
					},
				},
			},
		}, nil
	}

	// En el segundo turno, tras recibir la respuesta de la tool, emite la respuesta final
	return &LLMResponse{
		Text: "En marzo de 2026 se procesaron 45.000 prendas con facturación estimada de 8.500.000 ARS.",
	}, nil
}

func TestIAServiceWithMCP(t *testing.T) {
	mcpServer := mcp.NewServer("test-mcp", "1.0.0")

	var toolExecuted bool
	mcpServer.RegisterTool(mcp.Tool{
		Name:        "get_resumen_mock",
		Description: "Mock de resumen",
		InputSchema: mcp.ToolSchema{Type: "object"},
	}, func(ctx context.Context, args map[string]any) (*mcp.CallToolResult, error) {
		toolExecuted = true
		return &mcp.CallToolResult{
			Content: []mcp.ToolContent{{
				Type: "text",
				Text: `{"prendas_totales": 45000, "facturacion_ars": 8500000}`,
			}},
		}, nil
	})

	mockProv := &mockLLMProvider{}
	service := NewIAService(nil, mockProv, mcpServer)

	ctx := context.Background()
	desde := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	hasta := time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC)

	resp, err := service.AskWithMCP(ctx, "¿Cómo fue la producción del mes?", &desde, &hasta, nil)
	if err != nil {
		t.Fatalf("AskWithMCP falló: %v", err)
	}

	if !toolExecuted {
		t.Errorf("se esperaba que la herramienta 'get_resumen_mock' fuera ejecutada a través de MCP")
	}

	if len(resp.ToolsUsadas) == 0 || resp.ToolsUsadas[0] != "get_resumen_mock" {
		t.Errorf("esperaba 'get_resumen_mock' en ToolsUsadas, obtuve: %v", resp.ToolsUsadas)
	}

	if resp.Respuesta == "" {
		t.Errorf("esperaba texto de respuesta no vacío")
	}
}
