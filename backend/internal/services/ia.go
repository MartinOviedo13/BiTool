package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// IAService orquesta las consultas de Business Intelligence que alimentan al
// asistente de lenguaje natural. Calcula KPIs agregados y delega la redaccion
// de la respuesta al LLMProvider desacoplado.
type IAService struct {
	db       *pgxpool.Pool
	provider LLMProvider
}

// NewIAService construye el servicio con un proveedor de IA.
func NewIAService(db *pgxpool.Pool, provider LLMProvider) *IAService {
	return &IAService{db: db, provider: provider}
}

// snapshot agrupa las metricas agregadas de un rango de fechas.
type snapshot struct {
	CantidadTotal      int
	CantidadFacturable int
	CantidadRelavado   int
	Facturacion        float64
	TopVolumen         []topEntry
}

type topEntry struct {
	Hotel    string
	Cantidad int
}

// resumen rango principal (sin filtro).
func (s *IAService) snapshotRango(ctx context.Context, desde, hasta *time.Time) (snapshot, error) {
	var sn snapshot

	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(r.cantidad), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN NOT i.se_factura THEN r.cantidad ELSE 0 END), 0)::int,
			COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad * COALESCE(i.precio_unitario, 0) ELSE 0 END), 0)::float8
		FROM registros r
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
	`, desde, hasta).Scan(
		&sn.CantidadTotal,
		&sn.CantidadFacturable,
		&sn.CantidadRelavado,
		&sn.Facturacion,
	)
	if err != nil {
		return sn, fmt.Errorf("calculando resumen para IA: %w", err)
	}

	return sn, nil
}

func (s *IAService) rankingTop(ctx context.Context, desde, hasta *time.Time, limit int) ([]topEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT h.nombre, COALESCE(SUM(CASE WHEN i.se_factura THEN r.cantidad ELSE 0 END), 0)::int
		FROM hoteles h
		JOIN registros r ON r.hotel_id = h.id
		JOIN items i ON i.id = r.item_id
		WHERE ($1::date IS NULL OR r.fecha >= $1)
			AND ($2::date IS NULL OR r.fecha <= $2)
		GROUP BY h.id, h.nombre
		ORDER BY 2 DESC
		LIMIT $3
	`, desde, hasta, limit)
	if err != nil {
		return nil, fmt.Errorf("calculando ranking para IA: %w", err)
	}
	defer rows.Close()

	top := []topEntry{}
	for rows.Next() {
		var e topEntry
		if err := rows.Scan(&e.Hotel, &e.Cantidad); err != nil {
			return nil, err
		}
		top = append(top, e)
	}
	return top, nil
}

// periodoAnterior devuelve el bloque de la misma duracion inmediatamente previo.
func periodoAnterior(desde, hasta *time.Time) (time.Time, time.Time) {
	d := time.Now()
	h := time.Now()
	if desde != nil {
		d = *desde
	}
	if hasta != nil {
		h = *hasta
	}
	days := int(h.Sub(d).Hours()/24) + 1
	return d.AddDate(0, 0, -days), d.AddDate(0, 0, -1)
}

const iaSystemPrompt = `Sos el asistente de inteligencia de negocio del lavadero industrial Poseidon SRL.
Recibis SOLO metricas agregadas calculadas por el sistema (nunca datos crudos ni personales).
Responde en espanol argentino, claro y conciso, orientado a un dueno de pyme.
NO inventes ni extrapoles numeros: usa exclusivamente los datos que te dan.
Si una pregunta no puede responderse con los datos provistos, decilo y sugeri que informacion podria ayudar.
Compara con el periodo anterior cuando corresponda y destaca variaciones positivas o negativas con porcentajes.
Cantidades de prendas y facturacion estimada en pesos argentinos.`

// Ask procesa una pregunta del usuario sobre un rango de fechas y devuelve la
// respuesta redactada en lenguaje natural.
func (s *IAService) Ask(ctx context.Context, pregunta string, desde, hasta *time.Time) (string, error) {
	snActual, err := s.snapshotRango(ctx, desde, hasta)
	if err != nil {
		return "", err
	}

	top, err := s.rankingTop(ctx, desde, hasta, 5)
	if err != nil {
		return "", err
	}
	snActual.TopVolumen = top

	antDesde, antHasta := periodoAnterior(desde, hasta)
	snAnterior, err := s.snapshotRango(ctx, &antDesde, &antHasta)
	if err != nil {
		return "", err
	}

	periodoLabel := fmt.Sprintf("%s a %s", fmtFecha(desde), fmtFecha(hasta))
	antPeriodoLabel := fmt.Sprintf("%s a %s", antDesde.Format("2006-01-02"), antHasta.Format("2006-01-02"))

	nivelDatos := buildNivelDatos(snActual, snAnterior, periodoLabel, antPeriodoLabel)

	msg := Message{Role: "user", Content: nivelDatos + "\n\nPregunta del usuario: " + pregunta}

	respuesta, err := s.provider.Complete(ctx, iaSystemPrompt, []Message{msg})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(respuesta), nil
}

// buildNivelDatos arma un bloque de texto con las metricas agregadas que el
// modelo puede citar (solo numeros, sin filas crudas).
func buildNivelDatos(sn, ant snapshot, periodo, antPeriodo string) string {
	var b strings.Builder
	b.WriteString("METRICAS DEL PERIODO ACTUAL (" + periodo + "):")
	b.WriteString(fmt.Sprintf("\n- Volumen total procesado: %d prendas", sn.CantidadTotal))
	b.WriteString(fmt.Sprintf("\n- Prendas facturables: %d", sn.CantidadFacturable))
	b.WriteString(fmt.Sprintf("\n- Prendas de relavado (reproceso): %d", sn.CantidadRelavado))
	b.WriteString(fmt.Sprintf("\n- Facturacion estimada: %s ARS", formatARS(sn.Facturacion)))

	if len(sn.TopVolumen) > 0 {
		b.WriteString("\n- Top hoteles por volumen:")
		for i, e := range sn.TopVolumen {
			b.WriteString(fmt.Sprintf("\n    %d. %s (%d prendas)", i+1, e.Hotel, e.Cantidad))
		}
	}

	b.WriteString("\n\nMETRICAS DEL PERIODO ANTERIOR (" + antPeriodo + "):")
	b.WriteString(fmt.Sprintf("\n- Volumen total procesado: %d prendas", ant.CantidadTotal))
	b.WriteString(fmt.Sprintf("\n- Prendas facturables: %d", ant.CantidadFacturable))
	b.WriteString(fmt.Sprintf("\n- Prendas de relavado: %d", ant.CantidadRelavado))
	b.WriteString(fmt.Sprintf("\n- Facturacion estimada: %s ARS", formatARS(ant.Facturacion)))

	return b.String()
}

func fmtFecha(t *time.Time) string {
	if t == nil {
		return "historico"
	}
	return t.Format("2006-01-02")
}

func formatARS(v float64) string {
	// Formato simple con separador de miles.
	sign := ""
	if v < 0 {
		sign = "-"
		v = -v
	}
	s := fmt.Sprintf("%.0f", v)
	out := []rune(s)
	var res []rune
	for i, r := range out {
		if i > 0 && (len(out)-i)%3 == 0 {
			res = append(res, '.')
		}
		res = append(res, r)
	}
	return sign + string(res)
}
