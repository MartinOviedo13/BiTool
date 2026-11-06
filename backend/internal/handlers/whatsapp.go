package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"lavadero-bi/backend/internal/models"
	"lavadero-bi/backend/internal/services"
)

// handleWhatsAppWebhook recibe los eventos entrantes del Gateway (Evolution API).
func (a *App) handleWhatsAppWebhook(w http.ResponseWriter, r *http.Request) {
	if a.whatsapp == nil {
		writeError(w, http.StatusServiceUnavailable, "Servicio de WhatsApp no inicializado.")
		return
	}

	var webhook services.MensajeEntranteWebhook
	if err := json.NewDecoder(r.Body).Decode(&webhook); err != nil {
		writeError(w, http.StatusBadRequest, "Payload webhook inválido.")
		return
	}

	// Ignorar mensajes enviados por la propia cuenta de TRITÓN
	if webhook.Data.Key.FromMe {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored_self"})
		return
	}

	tel, texto := webhook.ExtraerTextoMensaje()
	if tel == "" || texto == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "no_text_or_sender"})
		return
	}

	// Procesar de manera asíncrona para responder de inmediato 200 OK a Evolution API
	go func(telRemitente string, textoMensaje string) {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()

		log.Printf("[WhatsApp Webhook] Mensaje entrante de %s: %q", telRemitente, textoMensaje)
		_, err := a.whatsapp.ProcesarMensajeEntrante(ctx, telRemitente, textoMensaje, a.ia)
		if err != nil {
			log.Printf("[WhatsApp Webhook] Error procesando con IA: %v", err)
		}
	}(tel, texto)

	writeJSON(w, http.StatusOK, map[string]string{"status": "processing"})
}

// getWhatsAppQR devuelve el QR para vincular el celular del lavadero y el estado de la conexión.
func (a *App) getWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	if a.whatsapp == nil {
		writeError(w, http.StatusServiceUnavailable, "Servicio de WhatsApp no inicializado.")
		return
	}

	estado := a.whatsapp.ObtenerEstadoConexion(r.Context())
	writeJSON(w, http.StatusOK, estado)
}

// getWhatsAppStatus devuelve el estado de la conexión de WhatsApp y métricas recientes.
func (a *App) getWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	enabled := false
	if a.whatsapp != nil {
		enabled = a.whatsapp.IsEnabled()
	}

	var totalEnviados int
	var totalEntrantes int
	var fallidos int

	if a.db != nil {
		_ = a.db.QueryRow(r.Context(), `
			SELECT
				COUNT(*) FILTER (WHERE direccion = 'saliente' AND estado IN ('enviado', 'simulado')),
				COUNT(*) FILTER (WHERE direccion = 'entrante'),
				COUNT(*) FILTER (WHERE estado = 'fallido')
			FROM whatsapp_mensajes_log
			WHERE created_at >= NOW() - INTERVAL '24 hours'
		`).Scan(&totalEnviados, &totalEntrantes, &fallidos)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"habilitado":                enabled,
		"gateway_configurado":       true,
		"mensajes_enviados_24h":    totalEnviados,
		"mensajes_recibidos_24h":   totalEntrantes,
		"fallidos_24h":             fallidos,
	})
}

type testWhatsAppPayload struct {
	Telefono *string `json:"telefono"`
	HotelID  *int    `json:"hotel_id"`
	Mensaje  string  `json:"mensaje"`
}

// testWhatsAppMessage permite al administrador enviar un mensaje de prueba.
func (a *App) testWhatsAppMessage(w http.ResponseWriter, r *http.Request) {
	if a.whatsapp == nil {
		writeError(w, http.StatusServiceUnavailable, "Servicio de WhatsApp no disponible.")
		return
	}

	var payload testWhatsAppPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "JSON inválido.")
		return
	}

	if strings.TrimSpace(payload.Mensaje) == "" {
		writeError(w, http.StatusBadRequest, "El mensaje no puede estar vacío.")
		return
	}

	telefono := ""
	if payload.Telefono != nil && strings.TrimSpace(*payload.Telefono) != "" {
		telefono = strings.TrimSpace(*payload.Telefono)
	} else if payload.HotelID != nil {
		var telDB *string
		err := a.db.QueryRow(r.Context(), "SELECT telefono_whatsapp FROM hoteles WHERE id = $1", *payload.HotelID).Scan(&telDB)
		if err == nil && telDB != nil {
			telefono = *telDB
		}
	}

	if telefono == "" {
		writeError(w, http.StatusBadRequest, "Debe indicar un número de teléfono o un hotel con WhatsApp configurado.")
		return
	}

	err := a.whatsapp.EnviarTexto(r.Context(), telefono, payload.Mensaje, "prueba_manual", payload.HotelID, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("Error enviando WhatsApp: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"telefono": telefono,
		"mensaje":  payload.Mensaje,
	})
}

// listWhatsAppLogs devuelve el historial de mensajes enviados y recibidos.
func (a *App) listWhatsAppLogs(w http.ResponseWriter, r *http.Request) {
	limiteStr := r.URL.Query().Get("limite")
	limite := 50
	if l, err := strconv.Atoi(limiteStr); err == nil && l > 0 && l <= 200 {
		limite = l
	}

	hotelIDStr := r.URL.Query().Get("hotel_id")
	var hotelID *int
	if hid, err := strconv.Atoi(hotelIDStr); err == nil {
		hotelID = &hid
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT
			w.id,
			w.direccion,
			w.telefono,
			w.hotel_id,
			h.nombre AS hotel_nombre,
			w.usuario_id,
			w.tipo_evento,
			w.mensaje,
			w.estado,
			w.error_detalle,
			w.created_at
		FROM whatsapp_mensajes_log w
		LEFT JOIN hoteles h ON h.id = w.hotel_id
		WHERE ($1::int IS NULL OR w.hotel_id = $1)
		ORDER BY w.created_at DESC
		LIMIT $2
	`, hotelID, limite)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Error consultando logs de WhatsApp.")
		return
	}
	defer rows.Close()

	logs := []models.WhatsAppMensajeLog{}
	for rows.Next() {
		var l models.WhatsAppMensajeLog
		if err := rows.Scan(
			&l.ID, &l.Direccion, &l.Telefono, &l.HotelID, &l.HotelNombre,
			&l.UsuarioID, &l.TipoEvento, &l.Mensaje, &l.Estado, &l.ErrorDetalle, &l.CreatedAt,
		); err == nil {
			logs = append(logs, l)
		}
	}

	writeJSON(w, http.StatusOK, logs)
}
