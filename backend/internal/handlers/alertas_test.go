package handlers

import "testing"

func hasAlertaID(alertas []Alerta, id string) bool {
	for _, a := range alertas {
		if a.ID == id {
			return true
		}
	}
	return false
}

func TestEvaluarAlertasUmbrales(t *testing.T) {
	t.Run("sin alertas cuando metricas estan dentro de umbrales normales", func(t *testing.T) {
		alertas := evaluarAlertas(AlertaInput{
			Total:         1000,
			Facturable:    960,
			Relavado:      40, // 4% (<= 5%)
			Rotas:         10, // 1% (<= 2%)
			Facturacion:   500000,
			SinPrecio:     0,
			Concentracion: 30,
			Inactivos:     nil,
		})
		if len(alertas) != 0 {
			t.Errorf("Se esperaban 0 alertas, se obtuvieron %d: %+v", len(alertas), alertas)
		}
	})

	t.Run("dispara alerta de relavado alto cuando supera el 5%", func(t *testing.T) {
		alertas := evaluarAlertas(AlertaInput{
			Total:       1000,
			Facturable:  920,
			Relavado:    80, // 8% (> 5%)
			Rotas:       5,
			Facturacion: 450000,
		})
		if !hasAlertaID(alertas, "relavado-alto") {
			t.Errorf("Se esperaba alerta 'relavado-alto', obtenidas: %+v", alertas)
		}
	})

	t.Run("dispara alerta de roturas altas cuando supera el 2%", func(t *testing.T) {
		alertas := evaluarAlertas(AlertaInput{
			Total:       1000,
			Facturable:  950,
			Relavado:    20,
			Rotas:       30, // 3% (> 2%)
			Facturacion: 450000,
		})
		if !hasAlertaID(alertas, "roturas-altas") {
			t.Errorf("Se esperaba alerta 'roturas-altas', obtenidas: %+v", alertas)
		}
	})

	t.Run("dispara alertas de tarifario, facturacion cero, concentracion e inactivos acotados a 5", func(t *testing.T) {
		alertas := evaluarAlertas(AlertaInput{
			Total:         500,
			Facturable:    500,
			Relavado:      0,
			Rotas:         0,
			Facturacion:   0,
			SinPrecio:     2,
			Concentracion: 65.0,
			Inactivos:     []string{"H1", "H2", "H3", "H4", "H5", "H6", "H7"},
		})

		if !hasAlertaID(alertas, "sin-precio") {
			t.Errorf("Falta alerta 'sin-precio'")
		}
		if !hasAlertaID(alertas, "facturacion-cero") {
			t.Errorf("Falta alerta 'facturacion-cero'")
		}
		if !hasAlertaID(alertas, "dependencia-fuerte") {
			t.Errorf("Falta alerta 'dependencia-fuerte'")
		}
		if !hasAlertaID(alertas, "hotel-inactivo-4") {
			t.Errorf("Falta alerta 'hotel-inactivo-4'")
		}
		if hasAlertaID(alertas, "hotel-inactivo-5") {
			t.Errorf("Los hoteles inactivos deben acotarse a un maximo de 5")
		}
	})
}

