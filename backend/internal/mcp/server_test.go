package mcp

import (
	"context"
	"encoding/json"
	"testing"
)

func TestMCPServerToolsAndResources(t *testing.T) {
	s := NewServer("test-server", "1.0.0")

	s.RegisterTool(Tool{
		Name:        "saludar",
		Description: "Retorna un saludo",
		InputSchema: ToolSchema{
			Type: "object",
			Properties: map[string]ToolProperty{
				"nombre": {Type: "string"},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		nom, _ := args["nombre"].(string)
		if nom == "" {
			nom = "Mundo"
		}
		return &CallToolResult{
			Content: []ToolContent{{Type: "text", Text: "Hola " + nom}},
		}, nil
	})

	s.RegisterResource(Resource{
		URI:  "test://saludo",
		Name: "Texto fijo",
	}, func(ctx context.Context, uri string) (*ResourceContent, error) {
		return &ResourceContent{
			URI:  uri,
			Text: "Contenido de prueba",
		}, nil
	})

	ctx := context.Background()

	// 1. Probar ListTools
	tools := s.ListTools()
	if len(tools) != 1 || tools[0].Name != "saludar" {
		t.Fatalf("esperaba tool 'saludar', obtuve %v", tools)
	}

	// 2. Probar CallTool directamente
	callRes, err := s.CallTool(ctx, "saludar", map[string]any{"nombre": "Tritón"})
	if err != nil || len(callRes.Content) == 0 || callRes.Content[0].Text != "Hola Tritón" {
		t.Fatalf("resultado inesperado en CallTool: %v, err: %v", callRes, err)
	}

	// 3. Probar JSON-RPC initialize
	initReq := []byte(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	initRespBytes := s.HandleJSONRPC(ctx, initReq)
	var initResp JSONRPCResponse
	if err := json.Unmarshal(initRespBytes, &initResp); err != nil {
		t.Fatalf("error parseando respuesta initialize: %v", err)
	}
	if initResp.Error != nil {
		t.Fatalf("initialize devolvió error: %v", initResp.Error)
	}

	// 4. Probar JSON-RPC tools/call
	toolReq := []byte(`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"saludar","arguments":{"nombre":"Martín"}}}`)
	toolRespBytes := s.HandleJSONRPC(ctx, toolReq)
	var toolResp JSONRPCResponse
	if err := json.Unmarshal(toolRespBytes, &toolResp); err != nil {
		t.Fatalf("error parseando respuesta tools/call: %v", err)
	}
	if toolResp.Error != nil {
		t.Fatalf("tools/call devolvió error: %v", toolResp.Error)
	}
}
