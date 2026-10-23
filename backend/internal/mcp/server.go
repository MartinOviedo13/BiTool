package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"sync"
)

// ToolHandler procesa la ejecución de una herramienta MCP.
type ToolHandler func(ctx context.Context, args map[string]any) (*CallToolResult, error)

// ResourceReader provee el contenido de un recurso MCP.
type ResourceReader func(ctx context.Context, uri string) (*ResourceContent, error)

type registeredTool struct {
	Tool    Tool
	Handler ToolHandler
}

type registeredResource struct {
	Resource Resource
	Reader   ResourceReader
}

// Server gestiona el catálogo de tools, resources y el despacho JSON-RPC del protocolo MCP.
type Server struct {
	name      string
	version   string
	mu        sync.RWMutex
	tools     map[string]registeredTool
	resources map[string]registeredResource
}

// NewServer construye una instancia de servidor MCP.
func NewServer(name, version string) *Server {
	return &Server{
		name:      name,
		version:   version,
		tools:     make(map[string]registeredTool),
		resources: make(map[string]registeredResource),
	}
}

// RegisterTool registra una herramienta en el catálogo.
func (s *Server) RegisterTool(tool Tool, handler ToolHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tools[tool.Name] = registeredTool{
		Tool:    tool,
		Handler: handler,
	}
}

// RegisterResource registra un recurso de contexto en el catálogo.
func (s *Server) RegisterResource(res Resource, reader ResourceReader) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resources[res.URI] = registeredResource{
		Resource: res,
		Reader:   reader,
	}
}

// ListTools devuelve todas las herramientas registradas.
func (s *Server) ListTools() []Tool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Tool, 0, len(s.tools))
	for _, rt := range s.tools {
		result = append(result, rt.Tool)
	}
	return result
}

// CallTool invoca directamente una herramienta en memoria.
func (s *Server) CallTool(ctx context.Context, name string, args map[string]any) (*CallToolResult, error) {
	s.mu.RLock()
	rt, exists := s.tools[name]
	s.mu.RUnlock()

	if !exists {
		return &CallToolResult{
			IsError: true,
			Content: []ToolContent{{
				Type: "text",
				Text: fmt.Sprintf("herramienta no encontrada: %s", name),
			}},
		}, fmt.Errorf("herramienta '%s' no registrada", name)
	}

	return rt.Handler(ctx, args)
}

// ListResources devuelve los recursos disponibles.
func (s *Server) ListResources() []Resource {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Resource, 0, len(s.resources))
	for _, rr := range s.resources {
		result = append(result, rr.Resource)
	}
	return result
}

// ReadResource lee el contenido de un recurso por su URI.
func (s *Server) ReadResource(ctx context.Context, uri string) (*ResourceContent, error) {
	s.mu.RLock()
	rr, exists := s.resources[uri]
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("recurso '%s' no registrado", uri)
	}
	return rr.Reader(ctx, uri)
}

// HandleJSONRPC procesa un mensaje JSON-RPC del protocolo MCP y genera la respuesta correspondiente.
func (s *Server) HandleJSONRPC(ctx context.Context, reqBytes []byte) []byte {
	var req JSONRPCRequest
	if err := json.Unmarshal(reqBytes, &req); err != nil {
		resp, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			Error:   &JSONRPCError{Code: CodeParseError, Message: "Parse error: " + err.Error()},
		})
		return resp
	}

	// Manejo de notificaciones (sin ID)
	isNotification := req.ID == nil

	var result any
	var rpcErr *JSONRPCError

	switch req.Method {
	case "initialize":
		result = InitializeResult{
			ProtocolVersion: LatestProtocolVersion,
			ServerInfo: ImplementationInfo{
				Name:    s.name,
				Version: s.version,
			},
			Capabilities: ServerCapabilities{
				Tools:     &ToolsCapability{ListChanged: false},
				Resources: &ResourcesCapability{Subscribe: false, ListChanged: false},
				Prompts:   &PromptsCapability{ListChanged: false},
			},
			Instructions: "Servidor MCP de Lavadero BI (TRITÓN / Poseidón SRL). Provee herramientas de Business Intelligence, auditoría, trazabilidad y proyección de demanda.",
		}

	case "notifications/initialized":
		if isNotification {
			return nil
		}
		result = map[string]any{}

	case "ping":
		result = map[string]any{}

	case "tools/list":
		result = ListToolsResult{Tools: s.ListTools()}

	case "tools/call":
		var p CallToolParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			rpcErr = &JSONRPCError{Code: CodeInvalidParams, Message: "Parámetros inválidos para tools/call: " + err.Error()}
			break
		}
		res, err := s.CallTool(ctx, p.Name, p.Arguments)
		if err != nil && res == nil {
			res = &CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: err.Error()}},
			}
		}
		result = res

	case "resources/list":
		result = ListResourcesResult{Resources: s.ListResources()}

	case "resources/read":
		var p ReadResourceParams
		if err := json.Unmarshal(req.Params, &p); err != nil {
			rpcErr = &JSONRPCError{Code: CodeInvalidParams, Message: "Parámetros inválidos para resources/read: " + err.Error()}
			break
		}
		content, err := s.ReadResource(ctx, p.URI)
		if err != nil {
			rpcErr = &JSONRPCError{Code: CodeInvalidParams, Message: err.Error()}
			break
		}
		result = ReadResourceResult{Contents: []ResourceContent{*content}}

	case "prompts/list":
		result = map[string]any{"prompts": []any{}}

	default:
		rpcErr = &JSONRPCError{Code: CodeMethodNotFound, Message: fmt.Sprintf("Método '%s' no implementado", req.Method)}
	}

	if isNotification {
		return nil
	}

	respObj := JSONRPCResponse{
		JSONRPC: JSONRPCVersion,
		ID:      req.ID,
		Result:  result,
		Error:   rpcErr,
	}

	respBytes, err := json.Marshal(respObj)
	if err != nil {
		fallback, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: JSONRPCVersion,
			ID:      req.ID,
			Error:   &JSONRPCError{Code: CodeInternalError, Message: "Error serializando respuesta: " + err.Error()},
		})
		return fallback
	}
	return respBytes
}

// ServeStdio ejecuta el loop del servidor MCP a través de Entrada y Salida Estándar (stdio).
// Ideal para conectarse a clientes como Claude Desktop, Antigravity o Cursor.
func (s *Server) ServeStdio(ctx context.Context, r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	// Permitir payloads JSON-RPC grandes (hasta 10MB)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		resp := s.HandleJSONRPC(ctx, line)
		if resp != nil {
			if _, err := w.Write(resp); err != nil {
				return err
			}
			if _, err := w.Write([]byte("\n")); err != nil {
				return err
			}
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Printf("[MCP Stdio] Error de lectura: %v", err)
		return err
	}
	return nil
}
