package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"lavadero-bi/backend/internal/models"
)

type hotelPayload struct {
	Nombre *string `json:"nombre"`
	Activo *bool   `json:"activo"`
}

func (a *App) listHoteles(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
		SELECT id, nombre, activo
		FROM hoteles
		ORDER BY nombre
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron listar los hoteles.")
		return
	}
	defer rows.Close()

	hoteles := []models.Hotel{}
	for rows.Next() {
		var hotel models.Hotel
		if err := rows.Scan(&hotel.ID, &hotel.Nombre, &hotel.Activo); err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudo leer un hotel.")
			return
		}
		hoteles = append(hoteles, hotel)
	}

	writeJSON(w, http.StatusOK, hoteles)
}

func (a *App) createHotel(w http.ResponseWriter, r *http.Request) {
	var payload hotelPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}

	nombre := cleanRequiredString(payload.Nombre)
	if nombre == "" {
		writeError(w, http.StatusBadRequest, "El nombre es obligatorio.")
		return
	}

	activo := true
	if payload.Activo != nil {
		activo = *payload.Activo
	}

	var hotel models.Hotel
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO hoteles (nombre, activo)
		VALUES ($1, $2)
		RETURNING id, nombre, activo
	`, nombre, activo).Scan(&hotel.ID, &hotel.Nombre, &hotel.Activo)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un hotel con ese nombre.")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo crear el hotel.")
		return
	}

	writeJSON(w, http.StatusCreated, hotel)
}

func (a *App) updateHotel(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID invalido.")
		return
	}

	var payload hotelPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}

	var nombre *string
	if payload.Nombre != nil {
		clean := cleanRequiredString(payload.Nombre)
		if clean == "" {
			writeError(w, http.StatusBadRequest, "El nombre no puede estar vacio.")
			return
		}
		nombre = &clean
	}

	var hotel models.Hotel
	err = a.db.QueryRow(r.Context(), `
		UPDATE hoteles
		SET
			nombre = COALESCE($2, nombre),
			activo = COALESCE($3, activo),
			updated_at = now()
		WHERE id = $1
		RETURNING id, nombre, activo
	`, id, nombre, payload.Activo).Scan(&hotel.ID, &hotel.Nombre, &hotel.Activo)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un hotel con ese nombre.")
			return
		}
		writeError(w, http.StatusNotFound, "Hotel no encontrado.")
		return
	}

	writeJSON(w, http.StatusOK, hotel)
}

func cleanRequiredString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
