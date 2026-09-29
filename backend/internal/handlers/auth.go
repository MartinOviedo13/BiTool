package handlers

import (
	"encoding/json"
	"net/http"
	"os"
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

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "dev-secret-change-me"
	}
	return []byte(s)
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
