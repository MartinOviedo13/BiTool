package handlers

import (
	"encoding/json"
	"testing"
	"time"

	"lavadero-bi/backend/internal/models"
)

func TestCreateEnvioRequest_Serialization(t *testing.T) {
	hotelID := 5
	rawJSON := `{
		"hotel_id": 5,
		"fecha": "2026-10-29",
		"numero_remito": "R-0001-00045231",
		"observaciones": "Remito manual papel recibido en recepción",
		"detalles": [
			{"item_id": 1, "cantidad_declarada": 50},
			{"item_id": 2, "cantidad_declarada": 30}
		]
	}`

	var req models.CreateEnvioRequest
	if err := json.Unmarshal([]byte(rawJSON), &req); err != nil {
		t.Fatalf("Error al deserializar CreateEnvioRequest: %v", err)
	}

	if req.HotelID == nil || *req.HotelID != hotelID {
		t.Errorf("Se esperaba hotel_id %d, pero se obtuvo %v", hotelID, req.HotelID)
	}
	if req.NumeroRemito != "R-0001-00045231" {
		t.Errorf("Se esperaba numero_remito R-0001-00045231, se obtuvo %s", req.NumeroRemito)
	}
	if req.Observaciones != "Remito manual papel recibido en recepción" {
		t.Errorf("Observaciones no coinciden")
	}
	if len(req.Detalles) != 2 {
		t.Errorf("Se esperaban 2 detalles, se obtuvieron %d", len(req.Detalles))
	}
	if req.Detalles[0].ItemID != 1 || req.Detalles[0].CantidadDeclarada != 50 {
		t.Errorf("Detalle 1 no coincide")
	}
}

func TestEnvio_ModelFields(t *testing.T) {
	numRemito := "0002-12480"
	obs := "Bolsas verdes"
	now := time.Now()

	envio := models.Envio{
		ID:            10,
		HotelID:       3,
		Fecha:         now,
		CodigoQR:      "REM-3-0002-12480-123",
		NumeroRemito:  &numRemito,
		Observaciones: &obs,
		TotalPrendas:  85,
		Estado:        "listo_para_retiro",
	}

	data, err := json.Marshal(envio)
	if err != nil {
		t.Fatalf("Error serializando Envio: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Error deserializando map: %v", err)
	}

	if parsed["numero_remito"] != numRemito {
		t.Errorf("JSON no contiene numero_remito correcto")
	}
	if parsed["total_prendas"] != float64(85) {
		t.Errorf("JSON no contiene total_prendas correcto")
	}
}
