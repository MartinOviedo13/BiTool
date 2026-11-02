package handlers

import (
	"encoding/json"
	"testing"
	"time"

	"lavadero-bi/backend/internal/models"
)

func TestMatchHotel_ExactAndFuzzy(t *testing.T) {
	hoteles := []models.Hotel{
		{ID: 1, Nombre: "Hotel Sheraton Córdoba", Activo: true},
		{ID: 2, Nombre: "Amerian Park Hotel", Activo: true},
		{ID: 3, Nombre: "Howard Johnson Villa Carlos Paz", Activo: true},
	}

	// Coincidencia exacta por ID
	match := matchHotel(2, "Cualquier texto", hoteles)
	if match == nil || *match != 2 {
		t.Errorf("Se esperaba match ID 2 por ID directo, obtenido: %v", match)
	}

	// Coincidencia por nombre sin tildes ni mayúsculas
	match = matchHotel(0, "hotel sheraton cordoba", hoteles)
	if match == nil || *match != 1 {
		t.Errorf("Se esperaba match ID 1 por nombre sin tildes, obtenido: %v", match)
	}

	// Coincidencia por subcadena
	match = matchHotel(0, "Amerian Park", hoteles)
	if match == nil || *match != 2 {
		t.Errorf("Se esperaba match ID 2 por subcadena, obtenido: %v", match)
	}

	// Sin coincidencia
	match = matchHotel(0, "Hostel Desconocido 999", hoteles)
	if match != nil {
		t.Errorf("Se esperaba nil para hotel desconocido, obtenido: %v", *match)
	}
}

func TestMatchItem_ExactAndFuzzy(t *testing.T) {
	items := []models.Item{
		{ID: 10, Nombre: "1 PZ", Activo: true},
		{ID: 11, Nombre: "Toallones", Activo: true},
		{ID: 12, Nombre: "Toallas", Activo: true},
		{ID: 13, Nombre: "Fundas", Activo: true},
	}

	// Match por ID directo
	m := matchItem(11, "toallon", items)
	if m == nil || *m != 11 {
		t.Errorf("Se esperaba match ID 11 por ID directo, obtenido: %v", m)
	}

	// Match por subcadena / nombre
	m = matchItem(0, "Toallas de mano", items)
	if m == nil || *m != 12 {
		t.Errorf("Se esperaba match ID 12 por contención, obtenido: %v", m)
	}

	// Normalización
	m = matchItem(0, "fúndás", items)
	if m == nil || *m != 13 {
		t.Errorf("Se esperaba match ID 13 ignorando tildes, obtenido: %v", m)
	}
}

func TestRemitoBorrador_Serialization(t *testing.T) {
	rawJSON := `{
		"hotel_id": 3,
		"fecha": "2026-11-01",
		"numero_remito": "REM-4820",
		"observaciones": "Bolsas húmedas",
		"items": [
			{
				"item_id": 11,
				"item_nombre_detectado": "Toallones",
				"cantidad": 45,
				"cantidad_relavado": 2,
				"cantidad_rota": 0,
				"confianza": 0.95,
				"dudoso": false
			},
			{
				"item_id": 10,
				"item_nombre_detectado": "1 PZ",
				"cantidad": 30,
				"cantidad_relavado": 0,
				"cantidad_rota": 1,
				"confianza": 0.65,
				"dudoso": true,
				"nota": "Número 3 o 8 dudoso"
			}
		]
	}`

	var req models.UpdateRemitoBorradorRequest
	if err := json.Unmarshal([]byte(rawJSON), &req); err != nil {
		t.Fatalf("Error al deserializar UpdateRemitoBorradorRequest: %v", err)
	}

	if req.HotelID == nil || *req.HotelID != 3 {
		t.Errorf("hotel_id no coincide")
	}
	if req.NumeroRemito == nil || *req.NumeroRemito != "REM-4820" {
		t.Errorf("numero_remito no coincide")
	}
	if len(req.Items) != 2 {
		t.Fatalf("Se esperaban 2 items, se obtuvieron %d", len(req.Items))
	}

	if !req.Items[1].Dudoso {
		t.Errorf("El item 2 debería ser dudoso")
	}
	if req.Items[1].Nota == nil || *req.Items[1].Nota != "Número 3 o 8 dudoso" {
		t.Errorf("Nota del item 2 no coincide")
	}

	// Model completo
	now := time.Now()
	borrador := models.RemitoBorrador{
		ID:                1,
		HotelID:           req.HotelID,
		Estado:            "pendiente_revision",
		ConfianzaPromedio: 0.85,
		CreadoEn:          now,
		ActualizadoEn:     now,
	}
	if borrador.Estado != "pendiente_revision" {
		t.Errorf("Estado inválido")
	}
}

func TestLoteResponse_Serialization(t *testing.T) {
	rawJSON := `{
		"lote_id": "LOTE-20261101-220000-abcd",
		"total": 5,
		"procesados": 4,
		"pendientes": 1,
		"con_error": 0,
		"completado": false,
		"borradores": [
			{
				"id": 101,
				"lote_id": "LOTE-20261101-220000-abcd",
				"estado": "pendiente_revision",
				"confianza_promedio": 0.92,
				"items": []
			}
		]
	}`

	var resp models.LoteProcesamientoResponse
	if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
		t.Fatalf("Error al deserializar LoteProcesamientoResponse: %v", err)
	}

	if resp.LoteID != "LOTE-20261101-220000-abcd" || resp.Total != 5 || resp.Completado {
		t.Errorf("Datos de LoteProcesamientoResponse no coinciden: %+v", resp)
	}

	confResp := models.ConfirmarLoteOKResponse{
		LoteID:      resp.LoteID,
		Confirmados: 3,
		Omitidos:    1,
		Mensaje:     "OK",
	}
	if confResp.Confirmados != 3 {
		t.Errorf("Confirmados erróneo")
	}
}

