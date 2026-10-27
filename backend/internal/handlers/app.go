package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"lavadero-bi/backend/internal/mcp"
	"lavadero-bi/backend/internal/services"
)

type App struct {
	db  *pgxpool.Pool
	ia  *services.IAService
	mcp *mcp.Server
}

func NewApp(db *pgxpool.Pool) *App {
	mcpServer := mcp.NewServer("lavadero-bi-mcp", "1.0.0")
	mcp.RegisterAllBITools(mcpServer, db)
	mcp.RegisterAllResources(mcpServer, db)

	app := &App{
		db:  db,
		mcp: mcpServer,
	}
	if services.ResolveGeminiAPIKey() != "" {
		app.ia = services.NewIAService(db, services.NewGeminiClient(), mcpServer)
	}
	return app
}

func (a *App) Routes() http.Handler {
	return a.RoutesWithAllowedOrigins(parseAllowedOrigins())
}

func (a *App) RoutesWithAllowedOrigins(allowedOrigins []string) http.Handler {
	router := chi.NewRouter()
	router.Use(withCORSOrigins(allowedOrigins))

	// ── Publico ──────────────────────────────────────────────────
	router.Get("/", a.handleRoot)
	router.Get("/health", a.handleHealth)
	router.Post("/auth/login", a.login)

	// Endpoint estándar MCP (Streamable HTTP + SSE + JSON-RPC 2.0) para Gemini y clientes externos
	router.Get("/api/mcp", a.handleMCP)
	router.Post("/api/mcp", a.handleMCP)
	router.Delete("/api/mcp", a.handleMCP)

	// ── Autenticado general (todos los roles) ─────────────────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)

		r.Get("/auth/me", a.me)
		r.Get("/items", a.listItems)               // Catalogo de prendas necesario para todos
		r.Get("/api/envios", a.listEnvios)         // Listado de remitos (filtrado por hotel_id si es cliente)
		r.Get("/api/realtime/stream", a.handleSSE) // Canal en tiempo real Server-Sent Events
	})

	// ── Portal B2B Clientes (cliente + admin + operario) ────────
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("cliente", "admin", "operario"))

		r.Post("/api/envios", a.createEnvio)
		r.Get("/api/portal/dashboard", a.portalHotelDashboard)

		// Ficha 360 y Liquidacion
		r.Get("/api/hoteles/{id}/ficha360", a.fichaHotel360)
		r.Get("/api/hoteles/{id}/liquidacion/exportar.csv", a.exportarLiquidacionHotelCSV)
	})

	// ── Consultas Logística / Reparto y Personal (admin + operario + repartidor) ──
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("admin", "operario", "repartidor"))

		// Hoteles: listado para filtros y hojas de ruta
		r.Get("/hoteles", a.listHoteles)

		// B2B: Auditoria de diferencias y remitos para entrega
		r.Get("/api/auditoria", a.auditoriaComparacion)
		r.Get("/api/envios/qr/{codigo_qr}", a.getEnvioByQR)

		// Conciliacion de despachos, retiros y notificaciones operativas
		r.Get("/api/conciliacion/despachos", a.listarDespachosConciliacion)
		r.Get("/api/logistica/retiros", a.listarRetirosPendientes)
		r.Get("/api/notificaciones", a.listarNotificacionesOperativas)
		r.Patch("/api/notificaciones/{id}/leer", a.marcarNotificacionLeida)
	})

	// ── Operaciones de Campo (Retiro y Entrega en Destino - repartidor + admin) ──
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("repartidor", "admin"))

		r.Post("/api/logistica/retiros/{id}/confirmar", a.confirmarRetiroEnvio)
		r.Post("/api/conciliacion/despachos/{id}/entregar", a.entregarDespachoConciliacion)
	})

	// ── Personal Lavadero con permisos de carga (admin + operario) ───
	router.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(requireRole("admin", "operario"))

		// Hoteles: creacion
		r.Post("/hoteles", a.createHotel)

		// Registros: carga diaria
		r.Get("/registros", a.listRegistros)
		r.Post("/registros", a.createRegistro)
		r.Post("/registros/batch", a.createRegistrosBatch)

		// B2B: Ajuste de conteo fisico en planta y validacion de conciliacion
		r.Post("/api/auditoria/conteo", a.registrarConteoAuditoria)
		r.Post("/api/conciliacion/validar", a.validarConciliacion)
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
		r.Get("/analisis/metricas-resumen", a.obtenerMetricasResumen)
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
