package routes

import (
	"net/http"
	"os"
	"strings"

	"lavadero-bi/backend/internal/handlers"
)

func AllowedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}
	parts := strings.Split(raw, ",")
	allowedOrigins := make([]string, 0, len(parts))
	for _, part := range parts {
		if origin := strings.TrimSpace(part); origin != "" {
			allowedOrigins = append(allowedOrigins, origin)
		}
	}
	if len(allowedOrigins) == 0 {
		return []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}
	return allowedOrigins
}

func New(app *handlers.App) http.Handler {
	return app.RoutesWithAllowedOrigins(AllowedOrigins())
}

