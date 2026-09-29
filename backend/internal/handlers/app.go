package handlers

import (
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"lavadero-bi/backend/internal/services"
)

type App struct {
	db *pgxpool.Pool
	ia *services.IAService
}

func NewApp(db *pgxpool.Pool) *App {
	app := &App{db: db}
	if os.Getenv("GEMINI_API_KEY") != "" {
		app.ia = services.NewIAService(db, services.NewGeminiClient())
	}
	return app
}

func (a *App) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(withCORS)

	// ── Publico ──────────────────────────────────────────────────
	router.Get("/", a.handleRoot)
	router.Get("/health", a.handleHealth)
	router.Post("/auth/login", a.login)

	// ── Autenticado general (todos los roles) ─────────────────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)

		r.Get("/auth/me", a.me)
		r.Get("/items", a.listItems) // Catalogo de prendas necesario para todos
	})

	// ── Portal B2B Clientes (cliente + admin) ─────────────────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("cliente", "admin"))

		r.Post("/api/envios", a.createEnvio)
		r.Get("/api/envios", a.listEnvios)
		r.Get("/api/portal/dashboard", a.portalHotelDashboard)
	})

	// ── Personal Lavadero (admin + operario) ──────────────────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("admin", "operario"))

		// Hoteles: lectura y creacion para operarios y admin
		r.Get("/hoteles", a.listHoteles)
		r.Post("/hoteles", a.createHotel)

		// Registros: carga diaria
		r.Get("/registros", a.listRegistros)
		r.Post("/registros", a.createRegistro)
		r.Post("/registros/batch", a.createRegistrosBatch)

		// B2B: Auditoria de diferencias y escaneo de QR
		r.Get("/api/auditoria", a.auditoriaComparacion)
		r.Post("/api/auditoria/conteo", a.registrarConteoAuditoria)
		r.Get("/api/envios/qr/{codigo_qr}", a.getEnvioByQR)
	})

	// ── Solo Admin ───────────────────────────────────────────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("admin"))

		// Hoteles: edicion solo admin
		r.Patch("/hoteles/{id}", a.updateHotel)

		// Items: creacion y edicion solo admin
		r.Post("/items", a.createItem)
		r.Patch("/items/{id}", a.updateItem)

		// Registros: importacion (nueva v2 con Excelize)
		r.Post("/api/imports", a.uploadImport)
		r.Get("/api/imports", a.listImports)
		r.Get("/api/imports/{id}", a.getImport)

		// Registros: importacion (v1 IA) y modificacion
		r.Post("/registros/import/preview", a.importPreview)
		r.Post("/registros/import/ia-extract", a.importExtract)
		r.Patch("/registros/{id}", a.updateRegistro)
		r.Delete("/registros/{id}", a.deleteRegistro)

		// Analisis / BI
		r.Get("/analisis/resumen", a.resumenGeneral)
		r.Get("/analisis/ranking-hoteles", a.rankingHoteles)
		r.Get("/analisis/comparar", a.compararPeriodo)
		r.Get("/analisis/tendencia", a.tendencia)
		r.Get("/analisis/exportar.csv", a.exportarCSV)

		// Alertas e IA
		r.Get("/alertas", a.alertas)
		r.Post("/ia/ask", a.askIA)
	})

	return router
}
