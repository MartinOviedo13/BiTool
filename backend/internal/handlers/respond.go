package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func parseID(r *http.Request) (int, error) {
	return strconv.Atoi(chi.URLParam(r, "id"))
}

func parseDateParam(r *http.Request, key string) (*time.Time, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return nil, nil
	}

	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func isFKViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

func isNotFound(err error) bool {
	// pgx devuelve ErrNoRows cuando no hay filas que coincidan con el WHERE.
	return errors.Is(err, pgx.ErrNoRows)
}

// fkConstraintName extrae el nombre de la constraint involucrada en un error
// de violacion de Foreign Key (util para mensajes claros).
func fkConstraintName(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.ConstraintName
	}
	return ""
}

// fkMessage devuelve un mensaje claro segun la constraint de Foreign Key que
// se violo (hoteles vs items).
func fkMessage(constraint string) string {
	switch constraint {
	case "registros_hotel_id_fkey":
		return "El hotel indicado no existe."
	case "registros_item_id_fkey":
		return "El item/prenda indicado no existe."
	default:
		return "Referencia invalida: el hotel o el item indicado no existe."
	}
}

func uniqueMessage(constraint string) string {
	switch constraint {
	case "hoteles_nombre_key":
		return "Ya existe un hotel con ese nombre."
	case "items_nombre_key":
		return "Ya existe un item con ese nombre."
	case "uq_registro_fecha_hotel_item", "uq_registros_hotel_item_fecha":
		return "Ya existe un registro para esa fecha, hotel e item."
	default:
		return "Ya existe un registro con esos datos (valor duplicado)."
	}
}

// writeDBError centraliza la traduccion de errores de PostgreSQL/pgx a codigos HTTP semanticos.
func writeDBError(w http.ResponseWriter, err error, notFoundMsg string) {
	if errors.Is(err, pgx.ErrNoRows) {
		if strings.TrimSpace(notFoundMsg) == "" {
			notFoundMsg = "Recurso no encontrado."
		}
		writeError(w, http.StatusNotFound, notFoundMsg)
		return
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23503": // foreign_key_violation
			writeError(w, http.StatusUnprocessableEntity, fkMessage(pgErr.ConstraintName))
			return
		case "23505": // unique_violation
			writeError(w, http.StatusConflict, uniqueMessage(pgErr.ConstraintName))
			return
		case "23514": // check_violation
			writeError(w, http.StatusBadRequest, "Los datos enviados violan una restriccion de validacion.")
			return
		}
	}

	writeError(w, http.StatusInternalServerError, "Error interno al procesar la operacion en la base de datos.")
}

