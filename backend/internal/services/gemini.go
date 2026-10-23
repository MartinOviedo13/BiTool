package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"lavadero-bi/backend/internal/mcp"
)

var (
	// ErrNoAPIKey indica que no se configuro GEMINI_API_KEY.
	ErrNoAPIKey = errors.New("modulo de IA no configurado (falta GEMINI_API_KEY)")
	// ErrExtract indica que la extraccion con la IA fallo.
	ErrExtract = errors.New("la IA no pudo extraer los datos")
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"

// GeminiClient es un cliente HTTP para el API generateContent de Gemini con soporte de Tools y MCP.
type GeminiClient struct {
	APIKey string
	Model  string
	HTTP   *http.Client
}

// NewGeminiClient construye el cliente leyendo GEMINI_API_KEY y GEMINI_MODEL del entorno.
// Por defecto utiliza 'gemini-3.8-flash' optimizado para Agentic Tool Use.
func NewGeminiClient() *GeminiClient {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" || strings.HasPrefix(model, "gemini-2.5") || strings.HasPrefix(model, "gemini-1.5") {
		model = "gemini-3.8-flash"
	}
	return &GeminiClient{
		APIKey: strings.TrimSpace(os.Getenv("GEMINI_API_KEY")),
		Model:  model,
		HTTP:   &http.Client{Timeout: 90 * time.Second},
	}
}

// ExtractedRow es una celda de la planilla leida por el modelo (nombres sin normalizar).
type ExtractedRow struct {
	Hotel    string `json:"hotel"`
	Item     string `json:"item"`
	Cantidad int    `json:"cantidad"`
}

// ExtractionResult es la salida estructurada que devuelve el modelo.
type ExtractionResult struct {
	Fecha string         `json:"fecha"`
	Filas []ExtractedRow `json:"filas"`
}

// ExtractFile envía el archivo al modelo de visión con Structured Outputs.
func (c *GeminiClient) ExtractFile(ctx context.Context, data []byte, mimeType, filename string) (*ExtractionResult, error) {
	if c.APIKey == "" {
		return nil, ErrNoAPIKey
	}

	schema := map[string]any{
		"type": "OBJECT",
		"properties": map[string]any{
			"fecha": map[string]any{
				"type":        "STRING",
				"description": "Fecha de la planilla en formato YYYY-MM-DD, o vacío si no figura en el documento.",
			},
			"filas": map[string]any{
				"type":        "ARRAY",
				"description": "Una entrada por cada celda con cantidad mayor a cero: hotel/cliente de la fila, prenda/concepto de la columna y la cantidad.",
				"items": map[string]any{
					"type": "OBJECT",
					"properties": map[string]any{
						"hotel":    map[string]any{"type": "STRING", "description": "Nombre del hotel/cliente tal como aparece en la planilla."},
						"item":     map[string]any{"type": "STRING", "description": "Nombre de la prenda/concepto tal como aparece en la planilla."},
						"cantidad": map[string]any{"type": "INTEGER", "description": "Cantidad de prendas procesadas para esa celda."},
					},
					"required": []string{"hotel", "item", "cantidad"},
				},
			},
		},
		"required": []string{"fecha", "filas"},
	}

	system := `Sos un extractor de planillas de lavanderia industrial. Una planilla operativa tiene HOTELES/CLIENTES en las FILAS y PRENDAS/CONCEPTOS en las COLUMNAS; cada celda contiene la cantidad de prendas procesadas. Extrae los datos tal cual estan escritos en el documento (nombres de hotel y prenda sin normalizar ni corregir). Devolve una entrada por cada celda con cantidad mayor a cero. Ignora encabezados, totales, subtotales, pies de pagina, notas y comentarios. Si el documento indica la fecha, usala en formato YYYY-MM-DD; si no aparece la fecha, devolvela vacia.`

	parts := []map[string]any{
		{"text": "Extrae los datos estructurados de esta planilla."},
	}
	if len(data) > 0 {
		parts = append(parts, map[string]any{
			"inline_data": map[string]any{
				"mime_type": mimeType,
				"data":      base64.StdEncoding.EncodeToString(data),
			},
		})
	}

	body := map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]any{{"text": system}}},
		"contents": []map[string]any{
			{
				"role":  "user",
				"parts": parts,
			},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"responseSchema":   schema,
			"temperature":      0,
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExtract, err)
	}

	url := fmt.Sprintf(geminiBaseURL, c.Model) + "?key=" + c.APIKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExtract, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExtract, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExtract, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w (la API respondio %d): %s", ErrExtract, resp.StatusCode, firstN(string(respBytes), 250))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("%w: respuesta invalida: %v", ErrExtract, err)
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, ErrExtract
	}

	var result ExtractionResult
	if err := json.Unmarshal([]byte(geminiResp.Candidates[0].Content.Parts[0].Text), &result); err != nil {
		return nil, fmt.Errorf("%w: el modelo no devolvio JSON valido: %v", ErrExtract, err)
	}
	if result.Filas == nil {
		result.Filas = []ExtractedRow{}
	}

	return &result, nil
}

// Complete implementa LLMProvider (un solo turno de texto plano).
func (c *GeminiClient) Complete(ctx context.Context, system string, userMessages []Message) (string, error) {
	resp, err := c.GenerateWithTools(ctx, system, userMessages, nil)
	if err != nil {
		return "", err
	}
	return resp.Text, nil
}

// GenerateWithTools envía el historial y el conjunto de Tools MCP al modelo Gemini.
func (c *GeminiClient) GenerateWithTools(ctx context.Context, system string, history []Message, tools []mcp.Tool) (*LLMResponse, error) {
	if c.APIKey == "" {
		return nil, ErrNoAPIKey
	}

	contents := make([]map[string]any, 0, len(history))
	for _, m := range history {
		role := m.Role
		parts := make([]map[string]any, 0)

		if role == "assistant" {
			role = "model"
			if m.Content != "" {
				parts = append(parts, map[string]any{"text": m.Content})
			}
			for _, tc := range m.ToolCalls {
				parts = append(parts, map[string]any{
					"functionCall": map[string]any{
						"name": tc.Name,
						"args": tc.Arguments,
					},
				})
			}
		} else if role == "function" || m.ToolResponse != nil {
			role = "function"
			name := "tool_result"
			contentStr := m.Content
			if m.ToolResponse != nil {
				name = m.ToolResponse.Name
				contentStr = m.ToolResponse.Content
			}
			// Parsear contenido a JSON si es posible para entregarlo estructurado a la IA
			var parsedResponse any
			if err := json.Unmarshal([]byte(contentStr), &parsedResponse); err != nil {
				parsedResponse = map[string]any{"output": contentStr}
			}
			parts = append(parts, map[string]any{
				"functionResponse": map[string]any{
					"name": name,
					"response": map[string]any{
						"result": parsedResponse,
					},
				},
			})
		} else {
			// user
			role = "user"
			if m.Content != "" {
				parts = append(parts, map[string]any{"text": m.Content})
			}
		}

		if len(parts) > 0 {
			contents = append(contents, map[string]any{
				"role":  role,
				"parts": parts,
			})
		}
	}

	body := map[string]any{
		"contents": contents,
		"generationConfig": map[string]any{
			"temperature": 0.2,
		},
	}

	if system != "" {
		body["systemInstruction"] = map[string]any{
			"parts": []map[string]any{{"text": system}},
		}
	}

	// Declarar Tools MCP para Function Calling
	if len(tools) > 0 {
		declarations := make([]map[string]any, 0, len(tools))
		for _, t := range tools {
			declarations = append(declarations, map[string]any{
				"name":        t.Name,
				"description": t.Description,
				"parameters":  convertMCPPropertiesToGeminiSchema(t.InputSchema),
			})
		}
		body["tools"] = []map[string]any{
			{"functionDeclarations": declarations},
		}
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("error serializando request Gemini: %w", err)
	}

	url := fmt.Sprintf(geminiBaseURL, c.Model) + "?key=" + c.APIKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("error construyendo request Gemini: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error de red llamando a Gemini: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error leyendo respuesta de Gemini: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("el proveedor de IA respondio %d: %s", resp.StatusCode, firstN(string(respBytes), 300))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text         string `json:"text"`
					FunctionCall *struct {
						Name string         `json:"name"`
						Args map[string]any `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("respuesta invalida del proveedor: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("el proveedor de IA no devolvio contenido")
	}

	var textParts []string
	var toolCalls []ToolCall

	for _, p := range geminiResp.Candidates[0].Content.Parts {
		if p.Text != "" {
			textParts = append(textParts, p.Text)
		}
		if p.FunctionCall != nil {
			toolCalls = append(toolCalls, ToolCall{
				Name:      p.FunctionCall.Name,
				Arguments: p.FunctionCall.Args,
			})
		}
	}

	return &LLMResponse{
		Text:      strings.TrimSpace(strings.Join(textParts, "\n")),
		ToolCalls: toolCalls,
	}, nil
}

func convertMCPPropertiesToGeminiSchema(schema mcp.ToolSchema) map[string]any {
	typeMap := strings.ToUpper(schema.Type)
	if typeMap == "" {
		typeMap = "OBJECT"
	}

	props := make(map[string]any, len(schema.Properties))
	for k, prop := range schema.Properties {
		propType := strings.ToUpper(prop.Type)
		if propType == "" {
			propType = "STRING"
		}
		item := map[string]any{
			"type":        propType,
			"description": prop.Description,
		}
		if len(prop.Enum) > 0 {
			item["enum"] = prop.Enum
		}
		props[k] = item
	}

	res := map[string]any{
		"type":       typeMap,
		"properties": props,
	}
	if len(schema.Required) > 0 {
		res["required"] = schema.Required
	}
	return res
}

func firstN(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}
