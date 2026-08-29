package handlers

import (
	"net/http"
	"strconv"
	"strings"
)

func optionalIntQuery(r *http.Request, key string) *int {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	if value == "" {
		return nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}

	return &parsed
}
