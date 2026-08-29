package handlers

import "net/http"

func (a *App) handleRoot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"nombre": "Lavadero BI",
		"estado": "API funcionando",
	})
}

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := a.db.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "No se pudo conectar a la base de datos.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
