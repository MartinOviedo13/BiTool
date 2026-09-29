package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// requireAuth verifica que la request tenga un JWT valido.
// Inyecta los claims en el contexto bajo claimsKey.
func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "Token de autenticacion requerido.")
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return jwtSecret(), nil
		})
		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "Token invalido o expirado.")
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireRole devuelve un middleware que verifica el rol del usuario autenticado.
// Permite pasar uno o mas roles autorizados.
// Debe usarse siempre despues de requireAuth.
func requireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
			if !ok || claims == nil {
				writeError(w, http.StatusUnauthorized, "No autenticado.")
				return
			}
			permitido := false
			for _, rol := range roles {
				if claims.Rol == rol {
					permitido = true
					break
				}
			}
			if !permitido {
				writeError(w, http.StatusForbidden, "Acceso denegado para tu rol.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
