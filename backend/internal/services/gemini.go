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
)

var (
	// ErrNoAPIKey indica que no se configuro GEMINI_API_KEY.
	ErrNoAPIKey = errors.New("modulo de IA no configurado (falta GEMINI_API_KEY)")
	// ErrExtract indica que la extraccion con la IA fallo.
	ErrExtract = errors.New("la IA no pudo extraer los datos")
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"

// GeminiClient es un cliente HTTP minimalista para el API generateContent de Gemini.
type GeminiClient struct {
	APIKey string
	Model  string
	HTTP   *http.Client
}

// NewGeminiClient construye el cliente leyendo GEMINI_API_KEY y GEMINI_MODEL del entorno.
func NewGeminiClient() *GeminiClient {
	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-3.6-flash"
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

// ExtractFile envia el archivo (imagen, pdf, xlsx o csv) al modelo de vision con
// Structured Outputs (JSON Schema) y devuelve las filas extraidas de la planilla.
func (c *GeminiClient) ExtractFile(ctx context.Context, data []byte, mimeType, filename string) (*ExtractionResult, error) {
	if c.APIKey == "" {
		return nil, ErrNoAPIKey
	}

	schema := map[string]any{
		"type": "OBJECT",
		"properties": map[string]any{
			"fecha": map[string]any{
				"type":        "STRING",
				"description": "Fecha de la planilla en formato YYYY-MM-DD, o vacio si no figura en el documento.",
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

func firstN(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// Complete implementa LLMProvider. Envia los mensajes al modelo y devuelve la
// respuesta de texto plano (sin exigir esquema JSON).
func (c *GeminiClient) Complete(ctx context.Context, system string, userMessages []Message) (string, error) {
	if c.APIKey == "" {
		return "", ErrNoAPIKey
	}

	var contents []map[string]any
	for _, m := range userMessages {
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		contents = append(contents, map[string]any{
			"role":  role,
			"parts": []map[string]any{{"text": m.Content}},
		})
	}

	body := map[string]any{
		"contents": contents,
		"generationConfig": map[string]any{
			"temperature": 0.4,
		},
	}
	if system != "" {
		body["systemInstruction"] = map[string]any{"parts": []map[string]any{{"text": system}}}
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExtract, err)
	}

	url := fmt.Sprintf(geminiBaseURL, c.Model) + "?key=" + c.APIKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExtract, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExtract, err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrExtract, err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("el proveedor de IA respondio %d: %s", resp.StatusCode, firstN(string(respBytes), 250))
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
		return "", fmt.Errorf("respuesta invalida del proveedor: %v", err)
	}
	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("el proveedor no devolvio contenido")
	}

	return geminiResp.Candidates[0].Content.Parts[0].Text, nil
}