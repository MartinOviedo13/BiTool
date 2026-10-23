package services

import (
	"strings"
	"unicode"
)

// CatalogEntry representa un elemento del catálogo (hotel o ítem) para emparejamiento en planillas.
type CatalogEntry struct {
	ID     int
	Nombre string
	Codigo string
}

type normalizedEntry struct {
	id   int
	norm string
}

// CatalogMatcher optimiza la búsqueda de hoteles e ítems en O(1) mediante un mapa en memoria
// indexado por nombre y código normalizados, con fallback difuso cacheado.
type CatalogMatcher struct {
	normMap map[string]int
	entries []normalizedEntry
}

var accentReplacer = strings.NewReplacer(
	"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
	"Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ü", "u", "Ñ", "n",
)

// NormalizeExcelText normaliza un texto a minúsculas, sin tildes, sin signos de puntuación
// ni espacios redundantes para comparaciones rápidas.
func NormalizeExcelText(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = accentReplacer.Replace(strings.ToLower(s))

	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// NewCatalogMatcher construye un matcher O(1) indexando nombre y código normalizados.
func NewCatalogMatcher(catalog []CatalogEntry) *CatalogMatcher {
	normMap := make(map[string]int, len(catalog)*2)
	entries := make([]normalizedEntry, 0, len(catalog))

	for _, item := range catalog {
		normName := NormalizeExcelText(item.Nombre)
		if normName != "" {
			normMap[normName] = item.ID
			entries = append(entries, normalizedEntry{id: item.ID, norm: normName})
		}
		normCode := NormalizeExcelText(item.Codigo)
		if normCode != "" {
			normMap[normCode] = item.ID
		}
	}

	return &CatalogMatcher{
		normMap: normMap,
		entries: entries,
	}
}

// Match busca un texto en el catálogo: primero en O(1) en el mapa normalizado y,
// si no existe coincidencia exacta, ejecuta búsqueda difusa y cachea el resultado en el mapa.
func (m *CatalogMatcher) Match(raw string) (int, bool) {
	norm := NormalizeExcelText(raw)
	if norm == "" {
		return 0, false
	}

	// 1. Búsqueda exacta O(1) (incluye hits cacheados previamente)
	if id, ok := m.normMap[norm]; ok {
		return id, true
	}

	// 2. Fallback difuso: contención de subcadenas (mínimo 3 caracteres para evitar falsos positivos)
	if len(norm) >= 3 {
		bestID := 0
		bestDiff := int(^uint(0) >> 1)
		for _, entry := range m.entries {
			if len(entry.norm) >= 3 && (strings.Contains(entry.norm, norm) || strings.Contains(norm, entry.norm)) {
				diff := absInt(len(entry.norm) - len(norm))
				if diff < bestDiff {
					bestDiff = diff
					bestID = entry.id
				}
			}
		}
		if bestID != 0 {
			m.normMap[norm] = bestID
			return bestID, true
		}
	}

	// 3. Fallback difuso por distancia de edición (Levenshtein) para errores leves de tipeo
	if len(norm) >= 4 {
		bestID := 0
		bestDist := 3 // umbral máximo permitido: hasta 2 ediciones
		for _, entry := range m.entries {
			if absInt(len(entry.norm)-len(norm)) > 2 {
				continue
			}
			dist := levenshteinDistance(norm, entry.norm)
			maxAllowed := 1
			if len(norm) >= 7 {
				maxAllowed = 2
			}
			if dist <= maxAllowed && dist < bestDist {
				bestDist = dist
				bestID = entry.id
			}
		}
		if bestID != 0 {
			m.normMap[norm] = bestID
			return bestID, true
		}
	}

	return 0, false
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func levenshteinDistance(a, b string) int {
	if a == b {
		return 0
	}
	la, lb := len(a), len(b)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}

	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			del := prev[j] + 1
			ins := curr[j-1] + 1
			sub := prev[j-1] + cost
			minVal := del
			if ins < minVal {
				minVal = ins
			}
			if sub < minVal {
				minVal = sub
			}
			curr[j] = minVal
		}
		copy(prev, curr)
	}
	return prev[lb]
}

