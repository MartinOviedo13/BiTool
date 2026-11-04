package services_test

import (
	"context"
	"testing"

	"lavadero-bi/backend/internal/services"
)

func TestNormalizarTelefono(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"3514567890", "5493514567890"},
		{"03514567890", "5493514567890"},
		{"+54 9 351 456-7890", "5493514567890"},
		{"5493514567890", "5493514567890"},
		{"351154567890", "5493514567890"},
		{"", ""},
		{"abc-/?", ""},
	}

	for _, c := range cases {
		got := services.NormalizarTelefono(c.input)
		if got != c.expected {
			t.Errorf("NormalizarTelefono(%q) = %q; esperaba %q", c.input, got, c.expected)
		}
	}
}

func TestWhatsAppService_Simulacion(t *testing.T) {
	// Sin DB y con gateway deshabilitado (simulado)
	t.Setenv("WHATSAPP_ENABLED", "false")
	svc := services.NewWhatsAppService(nil)

	if svc.IsEnabled() {
		t.Errorf("Se esperaba que IsEnabled() fuera false con WHATSAPP_ENABLED=false")
	}

	ctx := context.Background()
	err := svc.EnviarTexto(ctx, "3514567890", "Hola mundo", "test", nil, nil)
	if err != nil {
		t.Fatalf("EnviarTexto en modo simulado no debería fallar: %v", err)
	}
}
