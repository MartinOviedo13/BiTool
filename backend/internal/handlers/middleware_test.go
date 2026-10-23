package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func generateTestToken(t *testing.T, secret string, rol string) string {
	t.Helper()
	claims := jwtClaims{
		UserID:   1,
		Username: "usuario_test",
		Rol:      rol,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "lavadero-bi",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("Error firmando token de prueba: %v", err)
	}
	return signed
}

func TestAuthAndRoleMiddleware(t *testing.T) {
	const testSecret = "secreto-super-seguro-para-tests-de-al-menos-32-bytes"
	t.Setenv("JWT_SECRET", testSecret)

	protectedHandler := requireAuth(requireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})))

	validAdminToken := generateTestToken(t, testSecret, "admin")
	validClienteToken := generateTestToken(t, testSecret, "cliente")
	invalidSignatureToken := generateTestToken(t, "otro-secreto-distinto-invalido-1234567890", "admin")

	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
	}{
		{
			name:           "401 sin token de autenticacion",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "401 token con firma invalida",
			authHeader:     "Bearer " + invalidSignatureToken,
			expectedStatus: http.StatusUnauthorized,
		},
		{
			name:           "403 rol insuficiente (cliente en ruta exclusiva de admin)",
			authHeader:     "Bearer " + validClienteToken,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "200 rol autorizado (admin)",
			authHeader:     "Bearer " + validAdminToken,
			expectedStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/analisis/resumen", nil)
			if tc.authHeader != "" {
				req.Header.Set("Authorization", tc.authHeader)
			}
			rec := httptest.NewRecorder()

			protectedHandler.ServeHTTP(rec, req)

			if rec.Code != tc.expectedStatus {
				t.Errorf("status esperado %d, obtenido %d (body: %s)", tc.expectedStatus, rec.Code, rec.Body.String())
			}
		})
	}
}

