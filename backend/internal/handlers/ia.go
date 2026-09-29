package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type iaAskPayload struct {
	Mensaje    *string `json:"mensaje"`
	FechaDesde *string `json:"fecha_desde"`
	FechaHasta *string `json:"fecha_hasta"`
}

// askIA recibe una pregunta en lenguaje natural y el rango de fechas de
// contexto, y devuelve la respuesta redactada por el LLM a partir de KPIs
// agregados (la IA nunca accede directamente a la base).
func (a *App) askIA(w http.ResponseWriter, r *http.Request) {
	var payload iaAskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
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

	if a.ia == nil {
		writeError(w, http.StatusServiceUnavailable, "Modulo de IA no configurado (falta GEMINI_API_KEY en backend/.env).")
		return
	}

	respuesta, err := a.ia.Ask(r.Context(), strings.TrimSpace(*payload.Mensaje), desde, hasta)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"respuesta": respuesta})
}

// parseDatesFromPayload valida y convierte las fechas opcionales del payload
// (formato YYYY-MM-DD). El rango debe ser coherente (desde <= hasta).
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
