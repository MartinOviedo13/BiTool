package routes

import (
	"net/http"

	"lavadero-bi/backend/internal/handlers"
)

func New(app *handlers.App) http.Handler {
	return app.Routes()
}
