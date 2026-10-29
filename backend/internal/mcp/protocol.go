package mcp

import (
	"encoding/json"
)

// JSON-RPC 2.0 y Protocolo MCP (Model Context Protocol)

const (
	JSONRPCVersion = "2.0"
	LatestProtocolVersion = "2024-11-05"
)

type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      any           `json:"id,omitempty"`
	Result  any           `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// Códigos de error estándar JSON-RPC
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// Tipos para MCP initialize
type InitializeParams struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ClientCapabilities `json:"capabilities"`
	ClientInfo      ImplementationInfo `json:"clientInfo"`
}

type ClientCapabilities struct {
	Roots     *RootsCapability     `json:"roots,omitempty"`
	Sampling  *SamplingCapability  `json:"sampling,omitempty"`
}

type RootsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type SamplingCapability struct{}

type ImplementationInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type InitializeResult struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ServerCapabilities `json:"capabilities"`
	ServerInfo      ImplementationInfo `json:"serverInfo"`
	Instructions    string             `json:"instructions,omitempty"`
}

type ServerCapabilities struct {
	Tools     *ToolsCapability     `json:"tools,omitempty"`
	Resources *ResourcesCapability `json:"resources,omitempty"`
	Prompts   *PromptsCapability   `json:"prompts,omitempty"`
}

type ToolsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

type ResourcesCapability struct {
	Subscribe   bool `json:"subscribe,omitempty"`
	ListChanged bool `json:"listChanged,omitempty"`
}

type PromptsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

// Tool representa una herramienta expuesta por el servidor MCP
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema ToolSchema  `json:"inputSchema"`
}

// ToolSchema define la estructura JSON Schema para los argumentos de una tool
type ToolSchema struct {
	Type       string                  `json:"type"`
	Properties map[string]ToolProperty `json:"properties"`
	Required   []string                `json:"required,omitempty"`
}

type ToolProperty struct {
	Type        string   `json:"type"`
	Description string   `json:"description,omitempty"`
	Enum        []string `json:"enum,omitempty"`
	Items       *ToolProperty `json:"items,omitempty"`
}

type ListToolsResult struct {
	Tools []Tool `json:"tools"`
}

type CallToolParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

type ToolContent struct {
	Type string `json:"type"` // "text", "image", "resource"
	Text string `json:"text,omitempty"`
}

type CallToolResult struct {
	Content  []ToolContent    `json:"content"`
	IsError  bool             `json:"isError,omitempty"`
	Artifact *ArtifactPayload `json:"artifact,omitempty"`
}

// ChartSeries describe una serie numérica para gráficos interactivos en el Canvas IA.
type ChartSeries struct {
	Key        string `json:"key"`
	Label      string `json:"label"`
	Color      string `json:"color,omitempty"`
	IsCurrency bool   `json:"is_currency,omitempty"`
}

// ArtifactKPI representa un indicador sintético destacado sobre un gráfico o reporte.
type ArtifactKPI struct {
	Label string `json:"label"`
	Value string `json:"value"`
	Tone  string `json:"tone,omitempty"` // "brand", "emerald", "amber", "rose"
}

// SheetPreview permite previsualizar hojas de un Excel o tabla en el Canvas antes o después de descargar.
type SheetPreview struct {
	Name    string     `json:"name"`
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

// ArtifactPayload representa un artefacto enriquecido (gráfico interactivo o archivo Excel descargable) generado por una tool MCP.
type ArtifactPayload struct {
	ID            string           `json:"id"`
	Type          string           `json:"type"`                 // "chart" | "excel"
	Title         string           `json:"title"`
	Subtitle      string           `json:"subtitle,omitempty"`
	ChartType     string           `json:"chart_type,omitempty"` // "bar" | "line" | "area" | "pie"
	XKey          string           `json:"x_key,omitempty"`
	Series        []ChartSeries    `json:"series,omitempty"`
	Data          []map[string]any `json:"data,omitempty"`
	KPIs          []ArtifactKPI    `json:"kpis,omitempty"`
	Filename      string           `json:"filename,omitempty"`
	MimeType      string           `json:"mime_type,omitempty"`
	FileBase64    string           `json:"file_base64,omitempty"`
	SizeBytes     int              `json:"size_bytes,omitempty"`
	SheetsPreview []SheetPreview   `json:"sheets_preview,omitempty"`
}

// Resource representa un recurso informativo contextual de MCP
type Resource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

type ListResourcesResult struct {
	Resources []Resource `json:"resources"`
}

type ReadResourceParams struct {
	URI string `json:"uri"`
}

type ResourceContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
}

type ReadResourceResult struct {
	Contents []ResourceContent `json:"contents"`
}
