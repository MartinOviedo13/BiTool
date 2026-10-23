package handlers

import (
	"testing"

	"lavadero-bi/backend/internal/models"
)

func TestEvaluarConciliacionDespacho(t *testing.T) {
	tests := []struct {
		name              string
		hotelNombre       string
		fecha             string
		items             []models.MuestraItemConciliacion
		expectedEstado    string
		expectedTipoNotif string
		expectedSeveridad string
		expectedTotalRem  int
		expectedTotalProc int
		expectedDifGlobal int
		expectedTieneDif  bool
	}{
		{
			name:        "coincidencia exacta entre remito y procesado -> validado_ok",
			hotelNombre: "King David",
			fecha:       "2026-10-19",
			items: []models.MuestraItemConciliacion{
				{ItemID: 1, ItemNombre: "1 PZ", CantRemito: 40, CantProcesadaPrendas: 40, CantProcesadaKilos: 20.0},
				{ItemID: 2, ItemNombre: "Toallones", CantRemito: 60, CantProcesadaPrendas: 60, CantProcesadaKilos: 30.0},
			},
			expectedEstado:    "validado_ok",
			expectedTipoNotif: "CARGA_LISTA_REPARTO",
			expectedSeveridad: "info",
			expectedTotalRem:  100,
			expectedTotalProc: 100,
			expectedDifGlobal: 0,
			expectedTieneDif:  false,
		},
		{
			name:        "faltantes en procesado respecto al remito -> validado_con_diferencia y alerta repartidor",
			hotelNombre: "NH Panorama",
			fecha:       "2026-10-19",
			items: []models.MuestraItemConciliacion{
				{ItemID: 1, ItemNombre: "2 PZ", CantRemito: 50, CantProcesadaPrendas: 45, CantProcesadaKilos: 27.0},
				{ItemID: 3, ItemNombre: "Fundas", CantRemito: 30, CantProcesadaPrendas: 30, CantProcesadaKilos: 6.0},
			},
			expectedEstado:    "validado_con_diferencia",
			expectedTipoNotif: "ALERTA_DIFERENCIA_REMITO",
			expectedSeveridad: "warning",
			expectedTotalRem:  80,
			expectedTotalProc: 75,
			expectedDifGlobal: -5,
			expectedTieneDif:  true,
		},
		{
			name:        "diferencia compensada entre prendas con mismo total global -> validado_con_diferencia",
			hotelNombre: "Amerian",
			fecha:       "2026-10-19",
			items: []models.MuestraItemConciliacion{
				{ItemID: 1, ItemNombre: "Toallas", CantRemito: 20, CantProcesadaPrendas: 25, CantProcesadaKilos: 7.5},
				{ItemID: 2, ItemNombre: "Toallones", CantRemito: 20, CantProcesadaPrendas: 15, CantProcesadaKilos: 7.5},
			},
			expectedEstado:    "validado_con_diferencia",
			expectedTipoNotif: "ALERTA_DIFERENCIA_REMITO",
			expectedSeveridad: "warning",
			expectedTotalRem:  40,
			expectedTotalProc: 40,
			expectedDifGlobal: 0,
			expectedTieneDif:  true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := evaluarConciliacionDespacho(tc.hotelNombre, tc.fecha, tc.items)

			if res.Estado != tc.expectedEstado {
				t.Errorf("Estado esperado %q, obtenido %q", tc.expectedEstado, res.Estado)
			}
			if res.TipoNotificacion != tc.expectedTipoNotif {
				t.Errorf("TipoNotificacion esperado %q, obtenido %q", tc.expectedTipoNotif, res.TipoNotificacion)
			}
			if res.SeveridadNotificacion != tc.expectedSeveridad {
				t.Errorf("Severidad esperada %q, obtenida %q", tc.expectedSeveridad, res.SeveridadNotificacion)
			}
			if res.TotalRemitoPrendas != tc.expectedTotalRem {
				t.Errorf("TotalRemitoPrendas esperado %d, obtenido %d", tc.expectedTotalRem, res.TotalRemitoPrendas)
			}
			if res.TotalProcesadoPrendas != tc.expectedTotalProc {
				t.Errorf("TotalProcesadoPrendas esperado %d, obtenido %d", tc.expectedTotalProc, res.TotalProcesadoPrendas)
			}
			if res.DiferenciaPrendas != tc.expectedDifGlobal {
				t.Errorf("DiferenciaPrendas esperada %d, obtenida %d", tc.expectedDifGlobal, res.DiferenciaPrendas)
			}
			if res.TieneDiferencia != tc.expectedTieneDif {
				t.Errorf("TieneDiferencia esperado %v, obtenido %v", tc.expectedTieneDif, res.TieneDiferencia)
			}
			if len(res.Muestra) != len(tc.items) {
				t.Fatalf("longitud de muestra esperada %d, obtenida %d", len(tc.items), len(res.Muestra))
			}
			for i, m := range res.Muestra {
				expectedItemDiff := tc.items[i].CantProcesadaPrendas - tc.items[i].CantRemito
				if m.Diferencia != expectedItemDiff {
					t.Errorf("item %s diferencia esperada %d, obtenida %d", m.ItemNombre, expectedItemDiff, m.Diferencia)
				}
			}
		})
	}
}

