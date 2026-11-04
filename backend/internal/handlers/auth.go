package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"lavadero-bi/backend/internal/models"
)

type contextKey string

const claimsKey contextKey = "claims"

type jwtClaims struct {
	UserID      int     `json:"user_id"`
	Username    string  `json:"username"`
	Rol         string  `json:"rol"`
	HotelID     *int    `json:"hotel_id,omitempty"`
	HotelNombre *string `json:"hotel_nombre,omitempty"`
	jwt.RegisteredClaims
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Cuerpo de la solicitud invalido.")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Usuario y contrasena son requeridos.")
		return
	}

	var user models.Usuario
	var passwordHash string
	var hotelNombre *string
	err := a.db.QueryRow(r.Context(), `
		SELECT u.id, u.username, u.password_hash, u.rol, u.hotel_id, u.activo, h.nombre
		FROM usuarios u
		LEFT JOIN hoteles h ON h.id = u.hotel_id
		WHERE u.username = $1
	`, req.Username).Scan(
		&user.ID,
		&user.Username,
		&passwordHash,
		&user.Rol,
		&user.HotelID,
		&user.Activo,
		&hotelNombre,
	)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Credenciales incorrectas.")
		return
	}
	if !user.Activo {
		writeError(w, http.StatusUnauthorized, "Usuario inactivo.")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "Credenciales incorrectas.")
		return
	}

	user.HotelNombre = hotelNombre

	claims := jwtClaims{
		UserID:      user.ID,
		Username:    user.Username,
		Rol:         user.Rol,
		HotelID:     user.HotelID,
		HotelNombre: user.HotelNombre,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().AddDate(0, 0, 7)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "lavadero-bi",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(jwtSecret())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error generando token.")
		return
	}

	writeJSON(w, http.StatusOK, models.LoginResponse{
		Token:       signed,
		Rol:         user.Rol,
		Username:    user.Username,
		HotelID:     user.HotelID,
		HotelNombre: user.HotelNombre,
	})
}

func (a *App) me(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":           claims.UserID,
		"username":     claims.Username,
		"rol":          claims.Rol,
		"hotel_id":     claims.HotelID,
		"hotel_nombre": claims.HotelNombre,
	})
}

type usuarioPayload struct {
	Username         *string `json:"username"`
	Password         *string `json:"password"`
	Rol              *string `json:"rol"`
	HotelID          *int    `json:"hotel_id"`
	Activo           *bool   `json:"activo"`
	TelefonoWhatsApp *string `json:"telefono_whatsapp"`
}

func (a *App) listUsuarios(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
		SELECT u.id, u.username, u.rol, u.hotel_id, u.activo, u.telefono_whatsapp, h.nombre
		FROM usuarios u
		LEFT JOIN hoteles h ON h.id = u.hotel_id
		ORDER BY u.rol, u.username
	`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudieron listar los usuarios.")
		return
	}
	defer rows.Close()

	usuarios := []models.Usuario{}
	for rows.Next() {
		var u models.Usuario
		var hotelNombre *string
		if err := rows.Scan(&u.ID, &u.Username, &u.Rol, &u.HotelID, &u.Activo, &u.TelefonoWhatsApp, &hotelNombre); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo usuario.")
			return
		}
		u.HotelNombre = hotelNombre
		usuarios = append(usuarios, u)
	}

	writeJSON(w, http.StatusOK, usuarios)
}

func (a *App) createUsuario(w http.ResponseWriter, r *http.Request) {
	var payload usuarioPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido.")
		return
	}

	username := cleanRequiredString(payload.Username)
	if username == "" {
		writeError(w, http.StatusBadRequest, "El nombre de usuario es obligatorio.")
		return
	}
	password := cleanRequiredString(payload.Password)
	if len(password) < 4 {
		writeError(w, http.StatusBadRequest, "La contraseña debe tener al menos 4 caracteres.")
		return
	}
	rol := "repartidor"
	if payload.Rol != nil && strings.TrimSpace(*payload.Rol) != "" {
		rol = strings.TrimSpace(*payload.Rol)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error cifrando contraseña.")
		return
	}

	activo := true
	if payload.Activo != nil {
		activo = *payload.Activo
	}

	var telefono *string
	if payload.TelefonoWhatsApp != nil {
		t := strings.TrimSpace(*payload.TelefonoWhatsApp)
		if t != "" {
			telefono = &t
		}
	}

	var u models.Usuario
	err = a.db.QueryRow(r.Context(), `
		INSERT INTO usuarios (username, password_hash, rol, hotel_id, activo, telefono_whatsapp)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, username, rol, hotel_id, activo, telefono_whatsapp
	`, username, string(hash), rol, payload.HotelID, activo, telefono).Scan(
		&u.ID, &u.Username, &u.Rol, &u.HotelID, &u.Activo, &u.TelefonoWhatsApp,
	)
	if err != nil {
		writeDBError(w, err, "Error al crear usuario.")
		return
	}

	if u.HotelID != nil {
		_ = a.db.QueryRow(r.Context(), "SELECT nombre FROM hoteles WHERE id = $1", *u.HotelID).Scan(&u.HotelNombre)
	}

	writeJSON(w, http.StatusCreated, u)
}

func (a *App) updateUsuario(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "ID inválido.")
		return
	}

	var payload usuarioPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido.")
		return
	}

	var telefono *string
	if payload.TelefonoWhatsApp != nil {
		t := strings.TrimSpace(*payload.TelefonoWhatsApp)
		telefono = &t
	}

	var passwordHash *string
	if payload.Password != nil && strings.TrimSpace(*payload.Password) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(*payload.Password)), 12)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Error cifrando contraseña.")
			return
		}
		hStr := string(hash)
		passwordHash = &hStr
	}

	var u models.Usuario
	err = a.db.QueryRow(r.Context(), `
		UPDATE usuarios
		SET
			rol = COALESCE($2, rol),
			activo = COALESCE($3, activo),
			telefono_whatsapp = CASE WHEN $4::boolean THEN $5 ELSE telefono_whatsapp END,
			password_hash = COALESCE($6, password_hash)
		WHERE id = $1
		RETURNING id, username, rol, hotel_id, activo, telefono_whatsapp
	`, id, payload.Rol, payload.Activo, payload.TelefonoWhatsApp != nil, telefono, passwordHash).Scan(
		&u.ID, &u.Username, &u.Rol, &u.HotelID, &u.Activo, &u.TelefonoWhatsApp,
	)
	if err != nil {
		writeDBError(w, err, "Usuario no encontrado.")
		return
	}

	if u.HotelID != nil {
		_ = a.db.QueryRow(r.Context(), "SELECT nombre FROM hoteles WHERE id = $1", *u.HotelID).Scan(&u.HotelNombre)
	}

	writeJSON(w, http.StatusOK, u)
}
