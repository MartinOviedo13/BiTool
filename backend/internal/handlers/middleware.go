package handlers

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

func jwtSecret() []byte {
	return []byte(strings.TrimSpace(os.Getenv("JWT_SECRET")))
}

func parseAllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}
	parts := strings.Split(raw, ",")
	allowed := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			allowed = append(allowed, trimmed)
		}
	}
	if len(allowed) == 0 {
		return []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}
	return allowed
}

func isLocalNetworkOrigin(origin string) bool {
	return strings.HasPrefix(origin, "http://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") ||
		strings.HasPrefix(origin, "http://192.168.") ||
		strings.HasPrefix(origin, "http://10.") ||
		strings.HasPrefix(origin, "http://172.")
}

func withCORSOrigins(allowedOrigins []string) func(http.Handler) http.Handler {
	allowedSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowedSet[strings.TrimSpace(o)] = struct{}{}
	}
	allowLAN := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS")) == ""

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			isMCP := strings.HasPrefix(r.URL.Path, "/api/mcp")

			if origin != "" {
				_, ok := allowedSet[origin]
				_, allowAll := allowedSet["*"]
				isVercel := strings.HasSuffix(origin, ".vercel.app")
				isGoogle := strings.HasSuffix(origin, ".google.com") || origin == "https://gemini.google.com"

				if ok || allowAll || isVercel || isGoogle || isMCP || (allowLAN && isLocalNetworkOrigin(origin)) {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Credentials", "true")
					w.Header().Set("Vary", "Origin")
				}
			} else if isMCP {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}

			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, x-goog-api-key, x-mcp-api-key")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func withCORS(next http.Handler) http.Handler {
	return withCORSOrigins(parseAllowedOrigins())(next)
}

// requireAuth verifica que la request tenga un JWT valido.
// Admite el token por cabecera Authorization: Bearer <token> o por query param ?token=<token> (para EventSource / SSE).
// Inyecta los claims en el contexto bajo claimsKey.
func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenStr string
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else if queryToken := strings.TrimSpace(r.URL.Query().Get("token")); queryToken != "" {
			tokenStr = queryToken
		}

		if tokenStr == "" {
			writeError(w, http.StatusUnauthorized, "Token de autenticacion requerido.")
			return
		}

		claims := &jwtClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
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

// requireRole valida que el usuario autenticado posea alguno de los roles permitidos.
func requireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
			if !ok || claims == nil {
				writeError(w, http.StatusUnauthorized, "No autenticado.")
				return
			}

			for _, role := range allowedRoles {
				if claims.Rol == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			writeError(w, http.StatusForbidden, "No tienes permisos para acceder a este recurso.")
		})
	}
}
