package services

import "testing"

func TestNormalizeExcelText(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "texto simple con mayusculas y espacios",
			input:    "  King David  ",
			expected: "kingdavid",
		},
		{
			name:     "texto con tildes y enie",
			input:    "Sábana 2 Plazas - Algodón / Baño",
			expected: "sabana2plazasalgodonbano",
		},
		{
			name:     "texto con signos de puntuacion",
			input:    "Hotel_Amerian (Cba.)",
			expected: "hotelameriancba",
		},
		{
			name:     "vacio o solo espacios",
			input:    "   ",
			expected: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := NormalizeExcelText(tc.input)
			if got != tc.expected {
				t.Errorf("NormalizeExcelText(%q) = %q; esperado %q", tc.input, got, tc.expected)
			}
		})
	}
}

func TestCatalogMatcher(t *testing.T) {
	catalog := []CatalogEntry{
		{ID: 1, Nombre: "King David", Codigo: "KD01"},
		{ID: 2, Nombre: "Amerian Carlos Paz", Codigo: "ACP"},
		{ID: 3, Nombre: "Sábana 1 Plaza", Codigo: "SAB1"},
		{ID: 4, Nombre: "Toallón Baño", Codigo: "TOA"},
	}

	matcher := NewCatalogMatcher(catalog)

	tests := []struct {
		name       string
		query      string
		expectedID int
		expectedOK bool
	}{
		{
			name:       "coincidencia exacta normalizada",
			query:      "king david",
			expectedID: 1,
			expectedOK: true,
		},
		{
			name:       "coincidencia con tildes, guiones y mayusculas",
			query:      "  SÁBANA - 1 PLAZA ",
			expectedID: 3,
			expectedOK: true,
		},
		{
			name:       "coincidencia por codigo exacto",
			query:      "KD-01",
			expectedID: 1,
			expectedOK: true,
		},
		{
			name:       "coincidencia difusa por subcadena",
			query:      "Hotel King David",
			expectedID: 1,
			expectedOK: true,
		},
		{
			name:       "coincidencia difusa por error leve de tipeo (Levenshtein)",
			query:      "Toallon Banoo",
			expectedID: 4,
			expectedOK: true,
		},
		{
			name:       "elemento inexistente",
			query:      "Prenda Inexistente XYZ",
			expectedID: 0,
			expectedOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			id, ok := matcher.Match(tc.query)
			if ok != tc.expectedOK || id != tc.expectedID {
				t.Errorf("Match(%q) = (%d, %v); esperado (%d, %v)", tc.query, id, ok, tc.expectedID, tc.expectedOK)
			}
		})
	}

	// Verificar que un match difuso quedó cacheado en O(1) en normMap
	normFuzzy := NormalizeExcelText("Toallon Banoo")
	if cachedID, exists := matcher.normMap[normFuzzy]; !exists || cachedID != 4 {
		t.Errorf("Se esperaba que %q quedara cacheado en normMap con ID 4, obtenido (%d, %v)", normFuzzy, cachedID, exists)
	}
}

