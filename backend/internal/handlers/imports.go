package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"lavadero-bi/backend/internal/services"
)

func (a *App) uploadImport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "El archivo es demasiado grande o el formato es invalido.")
		return
	}

	fechaStr := r.FormValue("fecha")
	if fechaStr == "" {
		writeError(w, http.StatusBadRequest, "Falta el campo 'fecha' (YYYY-MM-DD)")
		return
	}
	fecha, err := time.Parse("2006-01-02", fechaStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "El formato de fecha debe ser YYYY-MM-DD")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Falta el archivo 'file'")
		return
	}
	defer file.Close()

	importService := services.NewImportService(a.db)
	result, err := importService.ProcessExcel(r.Context(), file, header.Filename, fecha)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (a *App) listImports(w http.ResponseWriter, r *http.Request) {
	importService := services.NewImportService(a.db)
	list, err := importService.ListImports(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (a *App) getImport(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID invalido")
		return
	}

	importService := services.NewImportService(a.db)
	imp, err := importService.GetImport(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "Importacion no encontrada")
		return
	}
	writeJSON(w, http.StatusOK, imp)
}
