package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"lavadero-bi/backend/internal/services"
)

const defaultGeminiModel = "gemini-3.8-flash"

type iaMessagePayload struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type iaAskPayload struct {
	Mensaje    *string            `json:"mensaje"`
	FechaDesde *string            `json:"fecha_desde"`
	FechaHasta *string            `json:"fecha_hasta"`
	Historial  []iaMessagePayload `json:"historial,omitempty"`
}

type iaAskResponse struct {
	Respuesta   string   `json:"respuesta"`
	ToolsUsadas []string `json:"tools_usadas,omitempty"`
}

// askIA recibe una pregunta en lenguaje natural, opcionalmente con rango de fechas
// e historial reciente, y procesa la consulta invocando herramientas MCP según se requiera.
func (a *App) askIA(w http.ResponseWriter, r *http.Request) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" || a.ia == nil {
		writeError(w, http.StatusServiceUnavailable, "Módulo de IA no configurado (falta GEMINI_API_KEY en backend/.env).")
		return
	}

	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = defaultGeminiModel
	}

	var payload iaAskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido.")
		return
	}
	if payload.Mensaje == nil || strings.TrimSpace(*payload.Mensaje) == "" {
		writeError(w, http.StatusBadRequest, "El campo 'mensaje' es obligatorio.")
		return
	}

	desde, hasta, err := parseDatesFromPayload(payload.FechaDesde, payload.FechaHasta)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	history := make([]services.Message, 0, len(payload.Historial))
	for _, m := range payload.Historial {
		if strings.TrimSpace(m.Content) != "" {
			history = append(history, services.Message{
				Role:    m.Role,
				Content: m.Content,
			})
		}
	}

	res, err := a.ia.AskWithMCP(r.Context(), strings.TrimSpace(*payload.Mensaje), desde, hasta, history)
	if err != nil {
		log.Printf("[IA] Error consultando modelo %s con MCP: %v", model, err)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, iaAskResponse{
		Respuesta:   res.Respuesta,
		ToolsUsadas: res.ToolsUsadas,
	})
}

// handleMCP procesa solicitudes directas de clientes externos bajo el estándar JSON-RPC 2.0 (MCP).
// Si MCP_API_KEY está configurada en el entorno, valida la clave por Authorization: Bearer, header x-mcp-api-key o query ?key=.
func (a *App) handleMCP(w http.ResponseWriter, r *http.Request) {
	if a.mcp == nil {
		writeError(w, http.StatusServiceUnavailable, "Servidor MCP no inicializado.")
		return
	}

	expectedKey := strings.TrimSpace(os.Getenv("MCP_API_KEY"))
	if expectedKey != "" {
		authHeader := r.Header.Get("Authorization")
		token := strings.TrimPrefix(authHeader, "Bearer ")
		queryKey := r.URL.Query().Get("key")
		customHeader := r.Header.Get("x-mcp-api-key")

		if token != expectedKey && queryKey != expectedKey && customHeader != expectedKey {
			writeError(w, http.StatusUnauthorized, "Clave MCP inválida o no provista (se requiere MCP_API_KEY).")
			return
		}
	}

	reqBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "No se pudo leer el cuerpo de la petición.")
		return
	}

	respBytes := a.mcp.HandleJSONRPC(r.Context(), reqBytes)
	if respBytes == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(respBytes)
}

// parseDatesFromPayload valida y convierte las fechas opcionales del payload
func parseDatesFromPayload(fd, fh *string) (desde, hasta *time.Time, err error) {
	if fd != nil && *fd != "" {
		t, e := time.Parse("2006-01-02", strings.TrimSpace(*fd))
		if e != nil {
			return nil, nil, fmt.Errorf("fecha_desde debe tener formato YYYY-MM-DD.")
		}
		desde = &t
	}
	if fh != nil && *fh != "" {
		t, e := time.Parse("2006-01-02", strings.TrimSpace(*fh))
		if e != nil {
			return nil, nil, fmt.Errorf("fecha_hasta debe tener formato YYYY-MM-DD.")
		}
		hasta = &t
	}
	if desde != nil && hasta != nil && hasta.Before(*desde) {
		return nil, nil, fmt.Errorf("fecha_hasta no puede ser anterior a fecha_desde.")
	}
	return desde, hasta, nil
}
