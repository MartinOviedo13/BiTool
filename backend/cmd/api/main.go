package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"lavadero-bi/backend/internal/database"
	"lavadero-bi/backend/internal/handlers"
	"lavadero-bi/backend/internal/routes"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	loadDotEnv(".env")

	addr := getEnv("SERVER_ADDR", ":8000")
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgresql://postgres:tu_password@localhost:5432/lavadero_bi"
	}

	ctx := context.Background()
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	app := handlers.NewApp(db)
	server := &http.Server{
		Addr:              addr,
		Handler:           routes.New(app),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Lavadero BI API escuchando en http://127.0.0.1%s", addr)
	return server.ListenAndServe()
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
