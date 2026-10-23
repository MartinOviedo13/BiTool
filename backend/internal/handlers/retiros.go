package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"lavadero-bi/backend/internal/models"
)

// listarRetirosPendientes devuelve los remitos cargados para la fecha (por defecto hoy)
// organizados para la hoja de ruta del repartidor (listos para retirar vs ya retirados).
func (a *App) listarRetirosPendientes(w http.ResponseWriter, r *http.Request) {
	fechaParam := strings.TrimSpace(r.URL.Query().Get("fecha"))
	if fechaParam == "" {
		fechaParam = time.Now().Format("2006-01-02")
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT
			e.id,
			e.hotel_id,
			h.nombre AS hotel_nombre,
			e.fecha::text,
			e.codigo_qr,
			COALESCE(e.estado, 'listo_para_retiro') AS estado,
			COALESCE(SUM(ed.cantidad_declarada), 0)::int AS total_prendas,
			e.creado_en,
			e.retirado_en,
			u.username AS retirado_por_username,
			e.observacion_retiro
		FROM envios e
		JOIN hoteles h ON h.id = e.hotel_id
		LEFT JOIN envio_detalles ed ON ed.envio_id = e.id
		LEFT JOIN usuarios u ON u.id = e.retirado_por_id
		WHERE e.fecha = $1::date
		GROUP BY e.id, e.hotel_id, h.nombre, e.fecha, e.codigo_qr, e.estado, e.creado_en, e.retirado_en, u.username, e.observacion_retiro
		ORDER BY
			CASE WHEN COALESCE(e.estado, 'listo_para_retiro') = 'listo_para_retiro' THEN 1 ELSE 2 END,
			e.creado_en DESC
	`, fechaParam)
	if err != nil {
		writeDBError(w, err, "Error consultando retiros.")
		return
	}
	defer rows.Close()

	lista := make([]models.RetiroPendienteDTO, 0)
	envioIDs := make([]int, 0)
	idxMap := make(map[int]int)

	for rows.Next() {
		var r models.RetiroPendienteDTO
		if err := rows.Scan(
			&r.EnvioID,
			&r.HotelID,
			&r.HotelNombre,
			&r.Fecha,
			&r.CodigoQR,
			&r.Estado,
			&r.TotalPrendas,
			&r.CreadoEn,
			&r.RetiradoEn,
			&r.RetiradoPorUsername,
			&r.ObservacionRetiro,
		); err != nil {
			writeError(w, http.StatusInternalServerError, "Error leyendo lista de retiros.")
			return
		}
		r.Detalles = make([]models.RetiroItemDTO, 0)
		idxMap[r.EnvioID] = len(lista)
		envioIDs = append(envioIDs, r.EnvioID)
		lista = append(lista, r)
	}

	if len(envioIDs) > 0 {
		detRows, detErr := a.db.Query(r.Context(), `
			SELECT ed.envio_id, i.nombre, ed.cantidad_declarada
			FROM envio_detalles ed
			JOIN items i ON i.id = ed.item_id
			WHERE ed.envio_id = ANY($1)
			ORDER BY ed.envio_id, ed.cantidad_declarada DESC
		`, envioIDs)
		if detErr == nil {
			defer detRows.Close()
			for detRows.Next() {
				var envioID int
				var it models.RetiroItemDTO
				if err := detRows.Scan(&envioID, &it.ItemNombre, &it.CantidadDeclarada); err == nil {
					if idx, ok := idxMap[envioID]; ok {
						lista[idx].Detalles = append(lista[idx].Detalles, it)
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, lista)
}

// confirmarRetiroEnvio permite al repartidor registrar el retiro físico de las prendas en el hotel.
func (a *App) confirmarRetiroEnvio(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(claimsKey).(*jwtClaims)
	if !ok || claims == nil {
		writeError(w, http.StatusUnauthorized, "No autenticado.")
		return
	}

	envioID, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil || envioID <= 0 {
		writeError(w, http.StatusBadRequest, "ID de remito inválido.")
		return
	}

	var req models.ConfirmarRetiroRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	obs := strings.TrimSpace(req.Observacion)
	var obsPtr *string
	if obs != "" {
		obsPtr = &obs
	}

	var hotelID int
	var hotelNombre string
	var codigoQR string
	err = a.db.QueryRow(r.Context(), `
		SELECT e.hotel_id, h.nombre, e.codigo_qr
		FROM envios e
		JOIN hoteles h ON h.id = e.hotel_id
		WHERE e.id = $1
	`, envioID).Scan(&hotelID, &hotelNombre, &codigoQR)
	if err != nil {
		writeDBError(w, err, "Remito no encontrado.")
		return
	}

	now := time.Now()
	_, err = a.db.Exec(r.Context(), `
		UPDATE envios
		SET estado = 'retirado',
		    retirado_por_id = $1,
		    retirado_en = $2,
		    observacion_retiro = COALESCE($3, observacion_retiro)
		WHERE id = $4
	`, claims.UserID, now, obsPtr, envioID)
	if err != nil {
		writeDBError(w, err, "Error al confirmar retiro de remito.")
		return
	}

	// Notificar a administración y operarios de planta que la carga ya va en camino
	notifTitulo := fmt.Sprintf("%s: Carga retirada", hotelNombre)
	notifMensaje := fmt.Sprintf("El repartidor %s retiró el remito %s. En viaje hacia el lavadero.", claims.Username, codigoQR)
	if obs != "" {
		notifMensaje += fmt.Sprintf(" Obs: \"%s\"", obs)
	}

	_, _ = a.db.Exec(r.Context(), `
		INSERT INTO notificaciones_operativas (rol_destino, hotel_id, despacho_id, tipo, severidad, titulo, mensaje, muestra_datos)
		VALUES ('admin', $1, NULL, 'REMITO_RETIRADO', 'success', $2, $3, '[]'::jsonb)
	`, hotelID, notifTitulo, notifMensaje)

	// Emitir evento SSE en tiempo real
	GetBroker().Broadcast("REMITO_RETIRADO", hotelID, notifTitulo, notifMensaje, map[string]any{
		"envio_id":     envioID,
		"codigo_qr":    codigoQR,
		"hotel_id":     hotelID,
		"hotel_nombre": hotelNombre,
		"estado":       "retirado",
		"retirado_en":  now.Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"envio_id":    envioID,
		"estado":      "retirado",
		"retirado_en": now.Format(time.RFC3339),
	})
}

