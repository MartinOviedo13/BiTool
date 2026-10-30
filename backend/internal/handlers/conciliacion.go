package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"lavadero-bi/backend/internal/models"
)

type ResultadoEvaluacionConciliacion struct {
	Estado                string
	TotalRemitoPrendas    int
	TotalProcesadoPrendas int
	TotalProcesadoKilos   float64
	DiferenciaPrendas     int
	TieneDiferencia       bool
	TipoNotificacion      string
	SeveridadNotificacion string
	TituloNotificacion    string
	MensajeNotificacion   string
	Muestra               []models.MuestraItemConciliacion
}

// evaluarConciliacionDespacho compara ítem por ítem lo declarado en remito contra la muestra procesada.
func evaluarConciliacionDespacho(hotelNombre string, fecha string, items []models.MuestraItemConciliacion) ResultadoEvaluacionConciliacion {
	muestra := make([]models.MuestraItemConciliacion, 0, len(items))
	totalRemito := 0
	totalProcesadoPrendas := 0
	totalProcesadoKilos := 0.0
	hayDesvioEnAlgunItem := false

	for _, it := range items {
		diff := it.CantProcesadaPrendas - it.CantRemito
		if diff != 0 {
			hayDesvioEnAlgunItem = true
		}
		totalRemito += it.CantRemito
		totalProcesadoPrendas += it.CantProcesadaPrendas
		totalProcesadoKilos += it.CantProcesadaKilos

		muestra = append(muestra, models.MuestraItemConciliacion{
			ItemID:               it.ItemID,
			ItemNombre:           it.ItemNombre,
			CantRemito:           it.CantRemito,
			CantProcesadaPrendas: it.CantProcesadaPrendas,
			CantProcesadaKilos:   it.CantProcesadaKilos,
			Diferencia:           diff,
		})
	}

	diferenciaGlobal := totalProcesadoPrendas - totalRemito
	tieneDiferencia := diferenciaGlobal != 0 || hayDesvioEnAlgunItem

	res := ResultadoEvaluacionConciliacion{
		TotalRemitoPrendas:    totalRemito,
		TotalProcesadoPrendas: totalProcesadoPrendas,
		TotalProcesadoKilos:   totalProcesadoKilos,
		DiferenciaPrendas:     diferenciaGlobal,
		TieneDiferencia:       tieneDiferencia,
		Muestra:               muestra,
	}

	if tieneDiferencia {
		res.Estado = "validado_con_diferencia"
		res.TipoNotificacion = "ALERTA_DIFERENCIA_REMITO"
		res.SeveridadNotificacion = "warning"
		res.TituloNotificacion = fmt.Sprintf("Alerta de Diferencia vs. Remito - %s (%s)", hotelNombre, fecha)
		res.MensajeNotificacion = fmt.Sprintf(
			"Remito: %d prendas | Procesado: %d prendas (%.2f kg) | Diferencia: %+d prendas. Revisar muestra procesada adjunta antes de retirar.",
			totalRemito, totalProcesadoPrendas, totalProcesadoKilos, diferenciaGlobal,
		)
	} else {
		res.Estado = "validado_ok"
		res.TipoNotificacion = "CARGA_LISTA_REPARTO"
		res.SeveridadNotificacion = "info"
		res.TituloNotificacion = fmt.Sprintf("Carga Validada Lista para Reparto - %s (%s)", hotelNombre, fecha)
		res.MensajeNotificacion = fmt.Sprintf(
			"Coincidencia exacta con remito: %d prendas procesadas (%.2f kg) listas para despacho.",
			totalProcesadoPrendas, totalProcesadoKilos,
		)
	}

	return res
}

// validarConciliacion ejecuta POST /api/conciliacion/validar
func (a *App) validarConciliacion(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	var req models.ValidarConciliacionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Cuerpo JSON invalido.")
		return
	}

	req.Fecha = strings.TrimSpace(req.Fecha)
	if req.HotelID <= 0 || req.Fecha == "" {
		writeError(w, http.StatusBadRequest, "hotel_id y fecha (YYYY-MM-DD) son obligatorios.")
		return
	}
	if _, err := time.Parse("2006-01-02", req.Fecha); err != nil {
		writeError(w, http.StatusBadRequest, "Formato de fecha invalido (use YYYY-MM-DD).")
		return
	}

	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error al iniciar transaccion.")
		return
	}
	defer tx.Rollback(ctx)

	var hotelNombre string
	if err := tx.QueryRow(ctx, "SELECT nombre FROM hoteles WHERE id = $1", req.HotelID).Scan(&hotelNombre); err != nil {
		writeDBError(w, err, "Hotel no encontrado.")
		return
	}

	var remitoID *int
	var idEnvio int
	if err := tx.QueryRow(ctx, "SELECT id FROM envios WHERE hotel_id = $1 AND fecha = $2::date ORDER BY id DESC LIMIT 1", req.HotelID, req.Fecha).Scan(&idEnvio); err == nil {
		remitoID = &idEnvio
	}

	rows, err := tx.Query(ctx, `
		WITH remito_items AS (
			SELECT ed.item_id, SUM(ed.cantidad_declarada)::int AS cant_remito
			FROM envios e
			JOIN envio_detalles ed ON ed.envio_id = e.id
			WHERE e.hotel_id = $1 AND e.fecha = $2::date
			GROUP BY ed.item_id
		),
		procesado_items AS (
			SELECT
				r.item_id,
				SUM(r.cantidad + COALESCE(r.cantidad_relavado, 0) + COALESCE(r.cantidad_rota, 0))::int AS cant_procesada_prendas,
				0::float8 AS cant_procesada_kilos
			FROM registros r
			WHERE r.hotel_id = $1 AND r.fecha = $2::date
			GROUP BY r.item_id
		),
		unidos AS (
			SELECT
				COALESCE(ri.item_id, pi.item_id) AS item_id,
				COALESCE(ri.cant_remito, 0) AS cant_remito,
				COALESCE(pi.cant_procesada_prendas, 0) AS cant_procesada_prendas,
				COALESCE(pi.cant_procesada_kilos, 0)::float8 AS cant_procesada_kilos
			FROM remito_items ri
			FULL OUTER JOIN procesado_items pi ON ri.item_id = pi.item_id
		)
		SELECT
			u.item_id,
			i.nombre AS item_nombre,
			u.cant_remito,
			u.cant_procesada_prendas,
			u.cant_procesada_kilos
		FROM unidos u
		JOIN items i ON i.id = u.item_id
		WHERE u.cant_remito > 0 OR u.cant_procesada_prendas > 0
		ORDER BY i.nombre ASC
	`, req.HotelID, req.Fecha)
	if err != nil {
		writeDBError(w, err, "Error comparando remito con procesado.")
		return
	}
	defer rows.Close()

	var rawItems []models.MuestraItemConciliacion
	for rows.Next() {
		var it models.MuestraItemConciliacion
		if err := rows.Scan(&it.ItemID, &it.ItemNombre, &it.CantRemito, &it.CantProcesadaPrendas, &it.CantProcesadaKilos); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo items de conciliacion.")
			return
		}
		rawItems = append(rawItems, it)
	}
	rows.Close()

	eval := evaluarConciliacionDespacho(hotelNombre, req.Fecha, rawItems)
	muestraJSON, err := json.Marshal(eval.Muestra)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error serializando muestra procesada.")
		return
	}

	var despachoID int
	err = tx.QueryRow(ctx, `
		INSERT INTO despachos_conciliacion (
			hotel_id, remito_id, fecha, estado,
			total_remito_prendas, total_procesado_prendas, total_procesado_kilos, diferencia_prendas,
			muestra_procesado, validado_por_id, validado_en
		) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
		ON CONFLICT (hotel_id, fecha)
		DO UPDATE SET
			remito_id = EXCLUDED.remito_id,
			estado = EXCLUDED.estado,
			total_remito_prendas = EXCLUDED.total_remito_prendas,
			total_procesado_prendas = EXCLUDED.total_procesado_prendas,
			total_procesado_kilos = EXCLUDED.total_procesado_kilos,
			diferencia_prendas = EXCLUDED.diferencia_prendas,
			muestra_procesado = EXCLUDED.muestra_procesado,
			validado_por_id = EXCLUDED.validado_por_id,
			validado_en = NOW()
		RETURNING id
	`,
		req.HotelID,
		remitoID,
		req.Fecha,
		eval.Estado,
		eval.TotalRemitoPrendas,
		eval.TotalProcesadoPrendas,
		eval.TotalProcesadoKilos,
		eval.DiferenciaPrendas,
		string(muestraJSON),
		claims.UserID,
	).Scan(&despachoID)
	if err != nil {
		writeDBError(w, err, "Error guardando despacho conciliado.")
		return
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO notificaciones_operativas (
			rol_destino, hotel_id, despacho_id, tipo, severidad, titulo, mensaje, muestra_datos
		) VALUES ('repartidor', $1, $2, $3, $4, $5, $6, $7::jsonb)
	`,
		req.HotelID,
		despachoID,
		eval.TipoNotificacion,
		eval.SeveridadNotificacion,
		eval.TituloNotificacion,
		eval.MensajeNotificacion,
		string(muestraJSON),
	)
	if err != nil {
		writeDBError(w, err, "Error registrando notificacion para repartidor.")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "Error al confirmar validacion de conciliacion.")
		return
	}

	despacho, err := a.getDespachoByID(ctx, despachoID)
	if err != nil {
		writeDBError(w, err, "Despacho no encontrado.")
		return
	}

	writeJSON(w, http.StatusOK, despacho)
}

// listarDespachosConciliacion ejecuta GET /api/conciliacion/despachos?fecha=YYYY-MM-DD
func (a *App) listarDespachosConciliacion(w http.ResponseWriter, r *http.Request) {
	fechaParam := strings.TrimSpace(r.URL.Query().Get("fecha"))

	rows, err := a.db.Query(r.Context(), `
		SELECT
			dc.id,
			dc.hotel_id,
			h.nombre AS hotel_nombre,
			dc.remito_id,
			e.codigo_qr,
			dc.fecha::text,
			dc.estado,
			dc.total_remito_prendas,
			dc.total_procesado_prendas,
			dc.total_procesado_kilos::float8,
			dc.diferencia_prendas,
			dc.muestra_procesado,
			dc.validado_por_id,
			uv.username AS validado_por_username,
			dc.validado_en,
			dc.entregado_por_id,
			ue.username AS entregado_por_username,
			dc.entregado_en,
			dc.observacion_entrega
		FROM despachos_conciliacion dc
		JOIN hoteles h ON h.id = dc.hotel_id
		LEFT JOIN envios e ON e.id = dc.remito_id
		LEFT JOIN usuarios uv ON uv.id = dc.validado_por_id
		LEFT JOIN usuarios ue ON ue.id = dc.entregado_por_id
		WHERE ($1::date IS NULL OR dc.fecha = $1::date)
		ORDER BY dc.fecha DESC, h.nombre ASC
		LIMIT 200
	`, nullableString(fechaParam))
	if err != nil {
		writeDBError(w, err, "Error consultando despachos conciliados.")
		return
	}
	defer rows.Close()

	lista := make([]models.DespachoConciliacion, 0)
	for rows.Next() {
		d, err := scanDespachoRow(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo despacho conciliado.")
			return
		}
		lista = append(lista, d)
	}

	writeJSON(w, http.StatusOK, lista)
}

// entregarDespachoConciliacion ejecuta POST /api/conciliacion/despachos/{id}/entregar
func (a *App) entregarDespachoConciliacion(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	despachoID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || despachoID <= 0 {
		writeError(w, http.StatusBadRequest, "ID de despacho invalido.")
		return
	}

	var req models.EntregarDespachoRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	obsTrimmed := strings.TrimSpace(req.ObservacionEntrega)

	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error al iniciar transaccion.")
		return
	}
	defer tx.Rollback(ctx)

	var (
		hotelID               int
		hotelNombre           string
		fechaStr              string
		estadoActual          string
		totalRemitoPrendas    int
		totalProcesadoPrendas int
		totalProcesadoKilos   float64
		diferenciaPrendas     int
		muestraRaw            []byte
	)

	err = tx.QueryRow(ctx, `
		SELECT
			dc.hotel_id,
			h.nombre,
			dc.fecha::text,
			dc.estado,
			dc.total_remito_prendas,
			dc.total_procesado_prendas,
			dc.total_procesado_kilos::float8,
			dc.diferencia_prendas,
			dc.muestra_procesado
		FROM despachos_conciliacion dc
		JOIN hoteles h ON h.id = dc.hotel_id
		WHERE dc.id = $1
		FOR UPDATE
	`, despachoID).Scan(
		&hotelID,
		&hotelNombre,
		&fechaStr,
		&estadoActual,
		&totalRemitoPrendas,
		&totalProcesadoPrendas,
		&totalProcesadoKilos,
		&diferenciaPrendas,
		&muestraRaw,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "Despacho no encontrado.")
			return
		}
		writeDBError(w, err, "Despacho no encontrado.")
		return
	}

	// Idempotencia: si ya estaba entregado, devolver 200 OK sin duplicar notificaciones
	if estadoActual == "entregado" {
		_ = tx.Rollback(ctx)
		despacho, getErr := a.getDespachoByID(ctx, despachoID)
		if getErr != nil {
			writeDBError(w, getErr, "Despacho no encontrado.")
			return
		}
		writeJSON(w, http.StatusOK, despacho)
		return
	}

	_, err = tx.Exec(ctx, `
		UPDATE despachos_conciliacion
		SET
			estado = 'entregado',
			entregado_por_id = $2,
			entregado_en = NOW(),
			observacion_entrega = $3
		WHERE id = $1
	`, despachoID, claims.UserID, nullableString(obsTrimmed))
	if err != nil {
		writeDBError(w, err, "Error marcando despacho como entregado.")
		return
	}

	horaEntrega := time.Now().Format("15:04")
	tituloNotif := fmt.Sprintf("Pedido Entregado - %s", hotelNombre)
	detalleDif := "sin diferencias"
	if diferenciaPrendas != 0 {
		detalleDif = fmt.Sprintf("con diferencia de %+d prendas vs. remito (%d remito / %d procesadas)", diferenciaPrendas, totalRemitoPrendas, totalProcesadoPrendas)
	}
	mensajeNotif := fmt.Sprintf(
		"El repartidor %s confirmó la entrega en %s a las %s hs (%d prendas / %.2f kg, %s).",
		claims.Username,
		hotelNombre,
		horaEntrega,
		totalProcesadoPrendas,
		totalProcesadoKilos,
		detalleDif,
	)
	if obsTrimmed != "" {
		mensajeNotif += fmt.Sprintf(" Observación: %s", obsTrimmed)
	}

	if len(muestraRaw) == 0 {
		muestraRaw = []byte("[]")
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO notificaciones_operativas (
			rol_destino, hotel_id, despacho_id, tipo, severidad, titulo, mensaje, muestra_datos
		) VALUES ('admin', $1, $2, 'PEDIDO_ENTREGADO', 'success', $3, $4, $5::jsonb)
	`, hotelID, despachoID, tituloNotif, mensajeNotif, string(muestraRaw))
	if err != nil {
		writeDBError(w, err, "Error creando notificacion de entrega para admin.")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "Error confirmando entrega de despacho.")
		return
	}

	despacho, err := a.getDespachoByID(ctx, despachoID)
	if err != nil {
		writeDBError(w, err, "Despacho no encontrado.")
		return
	}

	writeJSON(w, http.StatusOK, despacho)
}

// listarNotificacionesOperativas ejecuta GET /api/notificaciones
func (a *App) listarNotificacionesOperativas(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	rolFiltro := claims.Rol
	if rolFiltro == "operario" {
		rolFiltro = "repartidor"
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT
			n.id,
			n.rol_destino,
			n.hotel_id,
			h.nombre AS hotel_nombre,
			n.despacho_id,
			n.tipo,
			n.severidad,
			n.titulo,
			n.mensaje,
			n.muestra_datos,
			n.leida,
			n.leida_en,
			n.created_at
		FROM notificaciones_operativas n
		JOIN hoteles h ON h.id = n.hotel_id
		WHERE n.rol_destino = $1
		ORDER BY n.leida ASC, n.created_at DESC
		LIMIT 50
	`, rolFiltro)
	if err != nil {
		writeDBError(w, err, "Error consultando notificaciones.")
		return
	}
	defer rows.Close()

	lista := make([]models.NotificacionOperativa, 0)
	for rows.Next() {
		var n models.NotificacionOperativa
		var rawMuestra []byte
		if err := rows.Scan(
			&n.ID,
			&n.RolDestino,
			&n.HotelID,
			&n.HotelNombre,
			&n.DespachoID,
			&n.Tipo,
			&n.Severidad,
			&n.Titulo,
			&n.Mensaje,
			&rawMuestra,
			&n.Leida,
			&n.LeidaEn,
			&n.CreatedAt,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo notificaciones.")
			return
		}
		n.MuestraDatos = make([]models.MuestraItemConciliacion, 0)
		if len(rawMuestra) > 0 {
			_ = json.Unmarshal(rawMuestra, &n.MuestraDatos)
		}
		lista = append(lista, n)
	}

	writeJSON(w, http.StatusOK, lista)
}

// marcarNotificacionLeida ejecuta PATCH /api/notificaciones/{id}/leer
func (a *App) marcarNotificacionLeida(w http.ResponseWriter, r *http.Request) {
	notifID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || notifID <= 0 {
		writeError(w, http.StatusBadRequest, "ID de notificacion invalido.")
		return
	}

	cmdTag, err := a.db.Exec(r.Context(), `
		UPDATE notificaciones_operativas
		SET leida = TRUE, leida_en = NOW()
		WHERE id = $1
	`, notifID)
	if err != nil {
		writeDBError(w, err, "Notificacion no encontrada.")
		return
	}
	if cmdTag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Notificacion no encontrada.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"success": true, "id": notifID})
}

type despachoScanner interface {
	Scan(dest ...any) error
}

func scanDespachoRow(s despachoScanner) (models.DespachoConciliacion, error) {
	var d models.DespachoConciliacion
	var rawMuestra []byte
	err := s.Scan(
		&d.ID,
		&d.HotelID,
		&d.HotelNombre,
		&d.RemitoID,
		&d.CodigoQR,
		&d.Fecha,
		&d.Estado,
		&d.TotalRemitoPrendas,
		&d.TotalProcesadoPrendas,
		&d.TotalProcesadoKilos,
		&d.DiferenciaPrendas,
		&rawMuestra,
		&d.ValidadoPorID,
		&d.ValidadoPorUsername,
		&d.ValidadoEn,
		&d.EntregadoPorID,
		&d.EntregadoPorUsername,
		&d.EntregadoEn,
		&d.ObservacionEntrega,
	)
	if err != nil {
		return d, err
	}
	d.MuestraProcesado = make([]models.MuestraItemConciliacion, 0)
	if len(rawMuestra) > 0 {
		_ = json.Unmarshal(rawMuestra, &d.MuestraProcesado)
	}
	return d, nil
}

func (a *App) getDespachoByID(ctx context.Context, despachoID int) (models.DespachoConciliacion, error) {
	row := a.db.QueryRow(ctx, `
		SELECT
			dc.id,
			dc.hotel_id,
			h.nombre AS hotel_nombre,
			dc.remito_id,
			e.codigo_qr,
			dc.fecha::text,
			dc.estado,
			dc.total_remito_prendas,
			dc.total_procesado_prendas,
			dc.total_procesado_kilos::float8,
			dc.diferencia_prendas,
			dc.muestra_procesado,
			dc.validado_por_id,
			uv.username AS validado_por_username,
			dc.validado_en,
			dc.entregado_por_id,
			ue.username AS entregado_por_username,
			dc.entregado_en,
			dc.observacion_entrega
		FROM despachos_conciliacion dc
		JOIN hoteles h ON h.id = dc.hotel_id
		LEFT JOIN envios e ON e.id = dc.remito_id
		LEFT JOIN usuarios uv ON uv.id = dc.validado_por_id
		LEFT JOIN usuarios ue ON ue.id = dc.entregado_por_id
		WHERE dc.id = $1
	`, despachoID)
	return scanDespachoRow(row)
}

