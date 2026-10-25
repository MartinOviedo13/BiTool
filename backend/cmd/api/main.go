package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
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

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if databaseURL == "" || len(jwtSecret) < 32 {
		log.Fatal("Configuración inválida: DATABASE_URL y JWT_SECRET (>= 32 caracteres) son obligatorios")
	}

	addr := getEnv("SERVER_ADDR", "")
	if addr == "" {
		if port := os.Getenv("PORT"); port != "" {
			addr = ":" + port
		} else {
			addr = ":8000"
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("Lavadero BI API escuchando en http://127.0.0.1%s", addr)
		if serveErr := server.ListenAndServe(); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			errCh <- serveErr
		}
		close(errCh)
	}()

	select {
	case serveErr := <-errCh:
		return serveErr
	case <-ctx.Done():
		log.Println("Señal de apagado recibida, cerrando servidor HTTP de forma elegante...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

