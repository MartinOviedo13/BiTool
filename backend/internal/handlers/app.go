package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	db *pgxpool.Pool
}

func NewApp(db *pgxpool.Pool) *App {
	return &App{db: db}
}

func (a *App) Routes() http.Handler {
	router := chi.NewRouter()
	router.Use(withCORS)

	router.Get("/", a.handleRoot)
	router.Get("/health", a.handleHealth)

	router.Route("/hoteles", func(r chi.Router) {
		r.Get("/", a.listHoteles)
		r.Post("/", a.createHotel)
		r.Patch("/{id}", a.updateHotel)
	})

	router.Route("/items", func(r chi.Router) {
		r.Get("/", a.listItems)
		r.Post("/", a.createItem)
		r.Patch("/{id}", a.updateItem)
	})

	router.Route("/registros", func(r chi.Router) {
		r.Get("/", a.listRegistros)
		r.Post("/", a.createRegistro)
		r.Post("/batch", a.createRegistrosBatch)
		r.Post("/import/preview", a.importPreview)
		r.Patch("/{id}", a.updateRegistro)
		r.Delete("/{id}", a.deleteRegistro)
	})

	router.Route("/analisis", func(r chi.Router) {
		r.Get("/resumen", a.resumenGeneral)
		r.Get("/ranking-hoteles", a.rankingHoteles)
	})

	return router
}
