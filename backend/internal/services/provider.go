package services

import (
	"context"
	"lavadero-bi/backend/internal/mcp"
)

// Message representa un turno de conversacion enviado o recibido del modelo.
type Message struct {
	Role         string       `json:"role"` // "system", "user", "assistant" o "function"
	Content      string       `json:"content,omitempty"`
	ToolCalls    []ToolCall   `json:"tool_calls,omitempty"`
	ToolResponse *ToolResult  `json:"tool_response,omitempty"`
}

// ToolCall representa la solicitud del modelo para ejecutar una herramienta.
type ToolCall struct {
	ID        string         `json:"id,omitempty"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

// ToolResult contiene el resultado de ejecutar una herramienta.
type ToolResult struct {
	Name    string `json:"name"`
	Content string `json:"content"`
	IsError bool   `json:"is_error,omitempty"`
}

// LLMResponse encapsula la respuesta del modelo en un turno (texto y/o llamadas a tools).
type LLMResponse struct {
	Text      string     `json:"text,omitempty"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
}

// LLMProvider desacopla la lógica de IA del proveedor concreto (Gemini, etc.).
type LLMProvider interface {
	// Complete envía mensajes y devuelve únicamente texto.
	Complete(ctx context.Context, system string, userMessages []Message) (string, error)
	// GenerateWithTools permite al modelo invocar herramientas MCP (Function Calling).
	GenerateWithTools(ctx context.Context, system string, history []Message, tools []mcp.Tool) (*LLMResponse, error)
}
