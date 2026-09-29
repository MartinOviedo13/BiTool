package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
	"lavadero-bi/backend/internal/models"
)

type ImportError struct {
	Fila    int    `json:"fila"`
	Columna string `json:"columna,omitempty"`
	Mensaje string `json:"mensaje"`
}

type ImportService struct {
	db *pgxpool.Pool
}

func NewImportService(db *pgxpool.Pool) *ImportService {
	return &ImportService{db: db}
}

// ProcessExcel lee el archivo, valida y guarda en staging y luego en registros.
func (s *ImportService) ProcessExcel(ctx context.Context, file io.Reader, filename string, fecha time.Time) (*models.Import, error) {
	// 1. Crear registro de import
	var imp models.Import
	err := s.db.QueryRow(ctx, `
		INSERT INTO imports (nombre_archivo, estado) 
		VALUES ($1, 'procesando') 
		RETURNING id, nombre_archivo, estado, filas_totales, filas_con_error, creado_en
	`, filename).Scan(&imp.ID, &imp.NombreArchivo, &imp.Estado, &imp.FilasTotales, &imp.FilasConError, &imp.CreadoEn)
	if err != nil {
		return nil, fmt.Errorf("creando registro import: %w", err)
	}

	// 2. Leer Excel
	f, err := excelize.OpenReader(file)
	if err != nil {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 0, Mensaje: "Error al abrir el archivo Excel: " + err.Error()}})
		return s.GetImport(ctx, imp.ID)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 0, Mensaje: "El archivo Excel no tiene hojas"}})
		return s.GetImport(ctx, imp.ID)
	}
	sheet := sheets[0]
	rows, err := f.GetRows(sheet)
	if err != nil {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 0, Mensaje: "Error al leer filas: " + err.Error()}})
		return s.GetImport(ctx, imp.ID)
	}
	if len(rows) < 2 {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 0, Mensaje: "El archivo debe tener al menos una fila de encabezados y una de datos"}})
		return s.GetImport(ctx, imp.ID)
	}

	// 3. Obtener diccionarios de base de datos (hoteles e items)
	hotelMap, err := s.getHotelMap(ctx)
	if err != nil {
		return nil, fmt.Errorf("cargando hoteles: %w", err)
	}
	itemMap, err := s.getItemMap(ctx)
	if err != nil {
		return nil, fmt.Errorf("cargando items: %w", err)
	}

	// 4. Mapear encabezados
	headers := rows[0]
	if len(headers) < 2 {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 1, Mensaje: "Faltan columnas en el encabezado"}})
		return s.GetImport(ctx, imp.ID)
	}

	itemCols := make(map[int]int)
	var errores []ImportError
	for i := 1; i < len(headers); i++ {
		h := strings.TrimSpace(headers[i])
		if h == "" {
			continue
		}
		itemID, ok := itemMap[strings.ToLower(h)]
		if !ok {
			errores = append(errores, ImportError{Fila: 1, Columna: h, Mensaje: "Tipo de prenda no reconocido: " + h})
		} else {
			itemCols[i] = itemID
		}
	}

	if len(errores) > 0 {
		_ = s.failImport(ctx, imp.ID, errores)
		return s.GetImport(ctx, imp.ID)
	}

	// 5. Procesar filas
	var stagingData [][]any
	filasProcesadas := 0

	for r := 1; r < len(rows); r++ {
		row := rows[r]
		if len(row) == 0 {
			continue
		}
		clienteName := strings.TrimSpace(row[0])
		if clienteName == "" {
			continue
		}
		filasProcesadas++

		hotelID, ok := hotelMap[strings.ToLower(clienteName)]
		if !ok {
			errores = append(errores, ImportError{Fila: r + 1, Columna: headers[0], Mensaje: "Cliente nuevo o no reconocido: " + clienteName})
			continue
		}

		for c := 1; c < len(row); c++ {
			valStr := strings.TrimSpace(row[c])
			if valStr == "" || valStr == "-" {
				continue
			}
			itemID, mapped := itemCols[c]
			if !mapped {
				continue
			}
			
			qty, err := strconv.Atoi(valStr)
			if err != nil {
				errores = append(errores, ImportError{Fila: r + 1, Columna: headers[c], Mensaje: "Cantidad no es un numero valido: " + valStr})
				continue
			}
			if qty < 0 {
				errores = append(errores, ImportError{Fila: r + 1, Columna: headers[c], Mensaje: "Cantidad negativa no permitida: " + valStr})
				continue
			}

			stagingData = append(stagingData, []any{imp.ID, fecha, hotelID, itemID, qty})
		}
	}

	if len(errores) > 0 {
		s.updateImport(ctx, imp.ID, "error", filasProcesadas, len(errores), errores)
		return s.GetImport(ctx, imp.ID)
	}

	if len(stagingData) == 0 {
		_ = s.failImport(ctx, imp.ID, []ImportError{{Fila: 0, Mensaje: "El archivo no contiene celdas validas con cantidades"}})
		return s.GetImport(ctx, imp.ID)
	}

	// 6. Transaccion: CopyFrom staging y Upsert final
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("iniciando transaccion: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.CopyFrom(ctx,
		pgx.Identifier{"staging_registros"},
		[]string{"import_id", "fecha", "hotel_id", "item_id", "cantidad"},
		pgx.CopyFromRows(stagingData),
	)
	if err != nil {
		return nil, fmt.Errorf("insertando en staging: %w", err)
	}

	upsertQuery := `
		INSERT INTO registros (fecha, hotel_id, item_id, cantidad, import_id)
		SELECT fecha, hotel_id, item_id, cantidad, import_id 
		FROM staging_registros 
		WHERE import_id = $1
		ON CONFLICT (fecha, hotel_id, item_id) 
		DO UPDATE SET cantidad = EXCLUDED.cantidad, import_id = EXCLUDED.import_id
	`
	_, err = tx.Exec(ctx, upsertQuery, imp.ID)
	if err != nil {
		return nil, fmt.Errorf("upsert a tabla final: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaccion: %w", err)
	}

	s.updateImport(ctx, imp.ID, "completado", filasProcesadas, 0, nil)

	return s.GetImport(ctx, imp.ID)
}

func (s *ImportService) failImport(ctx context.Context, importID int, errores []ImportError) error {
	return s.updateImport(ctx, importID, "error", 0, len(errores), errores)
}

func (s *ImportService) updateImport(ctx context.Context, id int, estado string, totales, errCount int, errores []ImportError) error {
	var errJson []byte
	if len(errores) > 0 {
		errJson, _ = json.Marshal(errores)
	} else {
		errJson = []byte("[]")
	}
	_, err := s.db.Exec(ctx, `
		UPDATE imports 
		SET estado = $1, filas_totales = $2, filas_con_error = $3, errores = $4 
		WHERE id = $5
	`, estado, totales, errCount, string(errJson), id)
	return err
}

func (s *ImportService) GetImport(ctx context.Context, id int) (*models.Import, error) {
	var imp models.Import
	var errBytes []byte
	err := s.db.QueryRow(ctx, `
		SELECT id, nombre_archivo, estado, filas_totales, filas_con_error, errores, creado_en 
		FROM imports WHERE id = $1
	`, id).Scan(&imp.ID, &imp.NombreArchivo, &imp.Estado, &imp.FilasTotales, &imp.FilasConError, &errBytes, &imp.CreadoEn)
	if err != nil {
		return nil, err
	}
	if len(errBytes) > 0 {
		_ = json.Unmarshal(errBytes, &imp.Errores)
	}
	return &imp, nil
}

func (s *ImportService) ListImports(ctx context.Context) ([]models.Import, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, nombre_archivo, estado, filas_totales, filas_con_error, creado_en 
		FROM imports ORDER BY creado_en DESC LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Import
	for rows.Next() {
		var imp models.Import
		if err := rows.Scan(&imp.ID, &imp.NombreArchivo, &imp.Estado, &imp.FilasTotales, &imp.FilasConError, &imp.CreadoEn); err != nil {
			return nil, err
		}
		list = append(list, imp)
	}
	return list, nil
}

func (s *ImportService) getHotelMap(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.Query(ctx, "SELECT id, nombre FROM hoteles")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int)
	for rows.Next() {
		var id int
		var nom string
		if err := rows.Scan(&id, &nom); err != nil {
			return nil, err
		}
		m[strings.ToLower(strings.TrimSpace(nom))] = id
	}
	return m, nil
}

func (s *ImportService) getItemMap(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.Query(ctx, "SELECT id, nombre FROM items")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int)
	for rows.Next() {
		var id int
		var nom string
		if err := rows.Scan(&id, &nom); err != nil {
			return nil, err
		}
		m[strings.ToLower(strings.TrimSpace(nom))] = id
	}
	return m, nil
}
