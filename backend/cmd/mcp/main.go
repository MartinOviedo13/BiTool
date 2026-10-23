package main

import (
	"bufio"
	"context"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"lavadero-bi/backend/internal/database"
	"lavadero-bi/backend/internal/mcp"
)

func main() {
	loadDotEnv(".env")
	loadDotEnv("../.env")

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("[MCP CLI] Configuración inválida: DATABASE_URL es obligatoria en .env")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		log.Fatalf("[MCP CLI] Error conectando a PostgreSQL: %v", err)
	}
	defer db.Close()

	server := mcp.NewServer("lavadero-bi-mcp-cli", "1.0.0")
	mcp.RegisterAllBITools(server, db)
	mcp.RegisterAllResources(server, db)

	// Enviar logs a stderr para no contaminar el canal stdio de JSON-RPC
	log.SetOutput(os.Stderr)
	log.Println("[MCP CLI] Servidor MCP iniciado sobre stdio. Esperando mensajes JSON-RPC...")

	if err := server.ServeStdio(ctx, os.Stdin, os.Stdout); err != nil {
		log.Fatalf("[MCP CLI] Error en loop stdio: %v", err)
	}
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		line = strings.TrimPrefix(line, "\uFEFF")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		key = strings.TrimPrefix(key, "\uFEFF")
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
}
