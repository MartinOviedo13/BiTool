package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// optionalIntQuery lee un parametro entero opcional del query string.
// Devuelve nil si el parametro no fue provisto; error si fue provisto pero no es
// un entero valido (para no ignorar silenciosamente valores malformados).
func optionalIntQuery(r *http.Request, key string) (*int, error) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return nil, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil, fmt.Errorf("%s debe ser un numero entero", key)
	}

	return &parsed, nil
}

// requiredDateRangeParams lee fecha_desde y fecha_hasta, valida formato y que
// el rango sea coherente (desde <= hasta). Ambos pueden ser opcionales.
func requiredDateRangeParams(r *http.Request) (desde, hasta *time.Time, err error) {
	d, e := parseDateParam(r, "fecha_desde")
	if e != nil {
		return nil, nil, fmt.Errorf("fecha_desde debe tener formato YYYY-MM-DD")
	}
	h, e := parseDateParam(r, "fecha_hasta")
	if e != nil {
		return nil, nil, fmt.Errorf("fecha_hasta debe tener formato YYYY-MM-DD")
	}
	if d != nil && h != nil && h.Before(*d) {
		return nil, nil, fmt.Errorf("fecha_hasta no puede ser anterior a fecha_desde")
	}
	return d, h, nil
}
