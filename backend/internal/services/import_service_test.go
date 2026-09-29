package services_test

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
	"lavadero-bi/backend/internal/services"
)

func TestProcessExcel(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("Saltando test: DATABASE_URL no esta configurada")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("No se pudo conectar a la base de datos: %v", err)
	}
	defer pool.Close()

	// Preparar datos de prueba
	hotelName := fmt.Sprintf("Hotel Test %d", time.Now().UnixNano())
	itemName := fmt.Sprintf("Sabana Test %d", time.Now().UnixNano())

	var hotelID int
	err = pool.QueryRow(ctx, "INSERT INTO hoteles (nombre) VALUES ($1) RETURNING id", hotelName).Scan(&hotelID)
	if err != nil {
		t.Fatalf("Insertando hotel de prueba: %v", err)
	}
	defer pool.Exec(ctx, "DELETE FROM hoteles WHERE id = $1", hotelID) // Limpieza

	var itemID int
	err = pool.QueryRow(ctx, "INSERT INTO items (nombre, se_factura) VALUES ($1, true) RETURNING id", itemName).Scan(&itemID)
	if err != nil {
		t.Fatalf("Insertando item de prueba: %v", err)
	}
	defer pool.Exec(ctx, "DELETE FROM items WHERE id = $1", itemID) // Limpieza

	// Crear archivo Excel en memoria
	f := excelize.NewFile()
	sheet := "Sheet1"
	f.SetCellValue(sheet, "A1", "Cliente")
	f.SetCellValue(sheet, "B1", itemName)
	f.SetCellValue(sheet, "A2", hotelName)
	f.SetCellValue(sheet, "B2", "150")

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatalf("Generando archivo Excel: %v", err)
	}

	// Ejecutar servicio
	svc := services.NewImportService(pool)
	fecha := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	imp, err := svc.ProcessExcel(ctx, &buf, "test.xlsx", fecha)
	if err != nil {
		t.Fatalf("ProcessExcel devolvio error: %v", err)
	}

	if imp.Estado != "completado" {
		t.Errorf("Estado esperado 'completado', obtenido '%s'", imp.Estado)
	}
	if imp.FilasConError > 0 {
		t.Errorf("Se esperaban 0 errores, hubieron %d", imp.FilasConError)
	}

	// Limpieza registros
	defer pool.Exec(ctx, "DELETE FROM registros WHERE import_id = $1", imp.ID)
	defer pool.Exec(ctx, "DELETE FROM imports WHERE id = $1", imp.ID)
}
