package handlers

import (
	"encoding/json"
	"net/http"

	"lavadero-bi/backend/internal/models"
)

type itemPayload struct {
	Nombre         *string  `json:"nombre"`
	PrecioUnitario *float64 `json:"precio_unitario"`
	SeFactura      *bool    `json:"se_factura"`
}

func (a *App) listItems(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
		SELECT id, nombre, precio_unitario, se_factura
		FROM items
		ORDER BY nombre
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron listar los items.")
		return
	}
	defer rows.Close()

	items := []models.Item{}
	for rows.Next() {
		var item models.Item
		if err := rows.Scan(&item.ID, &item.Nombre, &item.PrecioUnitario, &item.SeFactura); err != nil {
			writeError(w, http.StatusInternalServerError, "No se pudo leer un item.")
			return
		}
		items = append(items, item)
	}

	writeJSON(w, http.StatusOK, items)
}

func (a *App) createItem(w http.ResponseWriter, r *http.Request) {
	var payload itemPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}

	nombre := cleanRequiredString(payload.Nombre)
	if nombre == "" {
		writeError(w, http.StatusBadRequest, "El nombre es obligatorio.")
		return
	}
	if payload.PrecioUnitario != nil && *payload.PrecioUnitario < 0 {
		writeError(w, http.StatusBadRequest, "El precio no puede ser negativo.")
		return
	}

	seFactura := true
	if payload.SeFactura != nil {
		seFactura = *payload.SeFactura
	}

	var item models.Item
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO items (nombre, precio_unitario, se_factura)
		VALUES ($1, $2, $3)
		RETURNING id, nombre, precio_unitario, se_factura
	`, nombre, payload.PrecioUnitario, seFactura).Scan(
		&item.ID,
		&item.Nombre,
		&item.PrecioUnitario,
		&item.SeFactura,
	)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un item con ese nombre.")
			return
		}
		writeError(w, http.StatusInternalServerError, "No se pudo crear el item.")
		return
	}

	writeJSON(w, http.StatusCreated, item)
}

func (a *App) updateItem(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID invalido.")
		return
	}

	var payload itemPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON invalido.")
		return
	}
	if payload.PrecioUnitario != nil && *payload.PrecioUnitario < 0 {
		writeError(w, http.StatusBadRequest, "El precio no puede ser negativo.")
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

	var item models.Item
	err = a.db.QueryRow(r.Context(), `
		UPDATE items
		SET
			nombre = COALESCE($2, nombre),
			precio_unitario = COALESCE($3, precio_unitario),
			se_factura = COALESCE($4, se_factura),
			updated_at = now()
		WHERE id = $1
		RETURNING id, nombre, precio_unitario, se_factura
	`, id, nombre, payload.PrecioUnitario, payload.SeFactura).Scan(
		&item.ID,
		&item.Nombre,
		&item.PrecioUnitario,
		&item.SeFactura,
	)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "Ya existe un item con ese nombre.")
			return
		}
		writeError(w, http.StatusNotFound, "Item no encontrado.")
		return
	}

	writeJSON(w, http.StatusOK, item)
}
