package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"lavadero-bi/backend/internal/models"
)

// WhatsAppService gestiona el envío de notificaciones y la interacción bidireccional por WhatsApp.
type WhatsAppService struct {
	db           *pgxpool.Pool
	enabled      bool
	gatewayURL   string
	apiKey       string
	instanceName string
	client       *http.Client
}

// NewWhatsAppService inicializa el servicio leyendo variables de entorno.
func NewWhatsAppService(db *pgxpool.Pool) *WhatsAppService {
	gatewayURL := strings.TrimRight(strings.TrimSpace(os.Getenv("WHATSAPP_GATEWAY_URL")), "/")
	if gatewayURL == "" {
		if os.Getenv("RENDER") != "" {
			gatewayURL = "https://triton-whatsapp-gateway.onrender.com"
		} else {
			gatewayURL = "http://localhost:8080"
		}
	}

	apiKey := strings.TrimSpace(os.Getenv("WHATSAPP_API_KEY"))
	if apiKey == "" {
		apiKey = "triton_whatsapp_secret_key_2026"
	}

	instanceName := strings.TrimSpace(os.Getenv("WHATSAPP_INSTANCE_NAME"))
	if instanceName == "" {
		instanceName = "triton"
	}

	enabled := true
	if val := strings.ToLower(strings.TrimSpace(os.Getenv("WHATSAPP_ENABLED"))); val == "false" || val == "0" {
		enabled = false
	}

	return &WhatsAppService{
		db:           db,
		enabled:      enabled,
		gatewayURL:   gatewayURL,
		apiKey:       apiKey,
		instanceName: instanceName,
		client:       &http.Client{Timeout: 15 * time.Second},
	}
}

// GatewayURL obtiene la URL activa del gateway de WhatsApp con fallback a Render.
func (s *WhatsAppService) GatewayURL() string {
	if val := strings.TrimRight(strings.TrimSpace(os.Getenv("WHATSAPP_GATEWAY_URL")), "/"); val != "" {
		return val
	}
	if s.gatewayURL != "" && s.gatewayURL != "http://localhost:8080" {
		return s.gatewayURL
	}
	if os.Getenv("RENDER") != "" {
		return "https://triton-whatsapp-gateway.onrender.com"
	}
	return "http://localhost:8080"
}

// APIKey obtiene la clave de autenticación con fallback al secreto estándar.
func (s *WhatsAppService) APIKey() string {
	if val := strings.TrimSpace(os.Getenv("WHATSAPP_API_KEY")); val != "" {
		return val
	}
	if s.apiKey != "" && s.apiKey != "triton_secret_wa_api_key_2026" {
		return s.apiKey
	}
	return "triton_whatsapp_secret_key_2026"
}

// IsEnabled indica si el canal de WhatsApp está habilitado operativamente.
func (s *WhatsAppService) IsEnabled() bool {
	return s.enabled
}

type EstadoConexionWhatsApp struct {
	Estado    string `json:"estado"` // open, connecting, close, no_gateway, simulacion
	Conectado bool   `json:"conectado"`
	QRCode    string `json:"qrcode,omitempty"` // data:image/png;base64,...
	Numero    string `json:"numero,omitempty"`
	Instancia string `json:"instancia"`
	Mensaje   string `json:"mensaje,omitempty"`
}

// ObtenerEstadoConexion consulta a Evolution API el estado de la sesión o solicita el código QR.
func (s *WhatsAppService) ObtenerEstadoConexion(ctx context.Context) EstadoConexionWhatsApp {
	gwURL := s.GatewayURL()
	apiKey := s.APIKey()

	res := EstadoConexionWhatsApp{
		Instancia: s.instanceName,
	}

	if !s.enabled {
		res.Estado = "simulacion"
		res.Conectado = true
		res.Mensaje = "WhatsApp en modo simulación (notificaciones registradas en base de datos)."
		return res
	}

	// 1. Probar consultar el estado de la instancia en Evolution API
	stateURL := fmt.Sprintf("%s/instance/connectionState/%s", gwURL, s.instanceName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, stateURL, nil)
	if err != nil {
		res.Estado = "no_gateway"
		res.Mensaje = "Error construyendo petición al Gateway."
		return res
	}
	req.Header.Set("apikey", apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		res.Estado = "no_gateway"
		res.Mensaje = "El contenedor de WhatsApp no está iniciado en " + gwURL + " (ejecutar: docker compose up -d whatsapp-gateway)"
		return res
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		var stateData struct {
			Instance struct {
				State string `json:"state"`
			} `json:"instance"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&stateData)
		res.Estado = stateData.Instance.State
		if res.Estado == "open" {
			res.Conectado = true
			res.Mensaje = "WhatsApp del lavadero conectado y listo para enviar notificaciones."
			return res
		}
	} else if resp.StatusCode == http.StatusNotFound {
		// Crear la instancia si todavía no existe en Evolution API
		createURL := fmt.Sprintf("%s/instance/create", gwURL)
		createPayload := map[string]any{
			"instanceName": s.instanceName,
			"token":        s.instanceName,
			"qrcode":       true,
			"integration":  "WHATSAPP-BAILEYS",
		}
		b, _ := json.Marshal(createPayload)
		cReq, _ := http.NewRequestWithContext(ctx, http.MethodPost, createURL, bytes.NewReader(b))
		cReq.Header.Set("Content-Type", "application/json")
		cReq.Header.Set("apikey", apiKey)
		cResp, cErr := s.client.Do(cReq)
		if cErr == nil {
			defer cResp.Body.Close()
			var cData map[string]any
			_ = json.NewDecoder(cResp.Body).Decode(&cData)
			if qr, ok := cData["base64"].(string); ok && qr != "" {
				res.QRCode = qr
				res.Estado = "connecting"
				res.Mensaje = "Escaneá el código QR con el WhatsApp de TRITÓN en Dispositivos Vinculados."
				return res
			}
			if qro, ok := cData["qrcode"].(map[string]any); ok {
				if qr, ok := qro["base64"].(string); ok && qr != "" {
					res.QRCode = qr
					res.Estado = "connecting"
					res.Mensaje = "Escaneá el código QR con el WhatsApp de TRITÓN en Dispositivos Vinculados."
					return res
				}
			}
		}
	}

	// Si la instancia ya existía pero no está 'open', pedir el QR fresco para conectar
	connectURL := fmt.Sprintf("%s/instance/connect/%s", gwURL, s.instanceName)
	connReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, connectURL, nil)
	connReq.Header.Set("apikey", apiKey)
	connResp, connErr := s.client.Do(connReq)
	if connErr == nil {
		defer connResp.Body.Close()
		var connData map[string]any
		_ = json.NewDecoder(connResp.Body).Decode(&connData)
		if b64, ok := connData["base64"].(string); ok && b64 != "" {
			res.QRCode = b64
			res.Estado = "connecting"
			res.Mensaje = "Escaneá el código QR con WhatsApp en Dispositivos Vinculados."
			return res
		}
		if qro, ok := connData["qrcode"].(map[string]any); ok {
			if b64, ok := qro["base64"].(string); ok && b64 != "" {
				res.QRCode = b64
				res.Estado = "connecting"
				res.Mensaje = "Escaneá el código QR con WhatsApp en Dispositivos Vinculados."
				return res
			}
		}
		if pairing, ok := connData["pairingCode"].(string); ok && pairing != "" {
			res.Estado = "connecting"
			res.Mensaje = fmt.Sprintf("Código de emparejamiento: %s (ingresalo en WhatsApp > Dispositivos vinculados)", pairing)
			return res
		}
	}

	res.Estado = "close"
	res.Mensaje = "Instancia de WhatsApp lista, esperando código QR."
	return res
}

// NormalizarTelefono limpia caracteres no numéricos y asegura formato E.164 básico (por defecto Argentina 549).
func NormalizarTelefono(raw string) string {
	reg := regexp.MustCompile(`[^0-9]`)
	clean := reg.ReplaceAllString(raw, "")
	if clean == "" {
		return ""
	}
	// Si empieza con 0 (ej. 0351...), quitar el 0
	if strings.HasPrefix(clean, "0") {
		clean = clean[1:]
	}
	// Si tiene el '15' local argentino (ej. 351154567890 -> 12 dígitos con 15 intermedio)
	if len(clean) == 12 && strings.Contains(clean, "15") {
		clean = strings.Replace(clean, "15", "", 1)
	}
	// Si son 10 dígitos (ej. 3514567890 en Argentina), anteponer código país + prefijo móvil 549
	if len(clean) == 10 {
		clean = "549" + clean
	}
	// Si ya tiene 54 pero le falta el 9 móvil (ej. 543514567890)
	if len(clean) == 12 && strings.HasPrefix(clean, "54") && !strings.HasPrefix(clean, "549") {
		clean = "549" + clean[2:]
	}
	return clean
}

// EnviarTexto envía un mensaje de texto por WhatsApp y lo registra en la base de datos.
func (s *WhatsAppService) EnviarTexto(ctx context.Context, telefono string, mensaje string, tipoEvento string, hotelID *int, usuarioID *int) error {
	telNormalizado := NormalizarTelefono(telefono)
	if telNormalizado == "" {
		return fmt.Errorf("teléfono inválido o vacío: %q", telefono)
	}

	estado := "enviado"
	var errorDetalle *string

	if !s.enabled {
		// Modo simulación: registrar y continuar
		log.Printf("[WhatsApp][SIMULADO] Para: %s | Evento: %s | Mensaje:\n%s", telNormalizado, tipoEvento, mensaje)
		estado = "simulado"
	} else {
		gwURL := s.GatewayURL()
		apiKey := s.APIKey()
		endpoint := fmt.Sprintf("%s/message/sendText/%s", gwURL, s.instanceName)
		payload := map[string]any{
			"number": telNormalizado,
			"text":   mensaje,
			"delay":  1200,
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			errStr := fmt.Sprintf("error serializando payload: %v", err)
			errorDetalle = &errStr
			estado = "fallido"
		} else {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(bodyBytes))
			if err != nil {
				errStr := fmt.Sprintf("error creando request HTTP: %v", err)
				errorDetalle = &errStr
				estado = "fallido"
			} else {
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("apikey", apiKey)

				resp, err := s.client.Do(req)
				if err != nil {
					errStr := fmt.Sprintf("error de conexión con Gateway WhatsApp: %v", err)
					errorDetalle = &errStr
					estado = "fallido"
					log.Printf("[WhatsApp][ERROR] %s", errStr)
				} else {
					defer resp.Body.Close()
					respBody, _ := io.ReadAll(resp.Body)
					if resp.StatusCode >= 400 {
						errStr := fmt.Sprintf("Gateway HTTP %d: %s", resp.StatusCode, string(respBody))
						errorDetalle = &errStr
						estado = "fallido"
						log.Printf("[WhatsApp][ERROR] %s", errStr)
					} else {
						log.Printf("[WhatsApp][OK] Mensaje enviado a %s (Evento: %s)", telNormalizado, tipoEvento)
					}
				}
			}
		}
	}

	// Registrar en auditoría SQL
	if s.db != nil {
		_, logErr := s.db.Exec(context.Background(), `
			INSERT INTO whatsapp_mensajes_log (
				direccion, telefono, hotel_id, usuario_id, tipo_evento, mensaje, estado, error_detalle
			) VALUES ('saliente', $1, $2, $3, $4, $5, $6, $7)
		`, telNormalizado, hotelID, usuarioID, tipoEvento, mensaje, estado, errorDetalle)
		if logErr != nil {
			log.Printf("[WhatsApp] Advertencia: no se pudo guardar log de auditoría: %v", logErr)
		}
	}

	if estado == "fallido" && errorDetalle != nil {
		return fmt.Errorf("%s", *errorDetalle)
	}
	return nil
}

// EnviarAsincrono despacha el mensaje en segundo plano para no demorar la respuesta de la API.
func (s *WhatsAppService) EnviarAsincrono(telefono string, mensaje string, tipoEvento string, hotelID *int, usuarioID *int) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := s.EnviarTexto(ctx, telefono, mensaje, tipoEvento, hotelID, usuarioID); err != nil {
			log.Printf("[WhatsApp][Async Error] Envío fallido a %s (%s): %v", telefono, tipoEvento, err)
		}
	}()
}

// ── Notificaciones de Eventos del Circuito ────────────────────────────────────

// NotificarRemitoEmitido avisa a choferes/repartidores que un hotel emitió un nuevo remito para retirar.
func (s *WhatsAppService) NotificarRemitoEmitido(ctx context.Context, hotelID int, hotelNombre string, codigoQR string, totalPrendas int, fecha string, numeroRemito string) {
	if s.db == nil {
		return
	}

	// Obtener choferes o administradores con WhatsApp configurado
	rows, err := s.db.Query(ctx, `
		SELECT id, username, telefono_whatsapp
		FROM usuarios
		WHERE rol IN ('repartidor', 'admin')
		  AND activo = true
		  AND telefono_whatsapp IS NOT NULL
		  AND TRIM(telefono_whatsapp) != ''
	`)
	if err != nil {
		log.Printf("[WhatsApp] Error buscando teléfonos de repartidores: %v", err)
		return
	}
	defer rows.Close()

	remitoTexto := ""
	if strings.TrimSpace(numeroRemito) != "" {
		remitoTexto = fmt.Sprintf(" | N° Remito: *%s*", numeroRemito)
	}

	msg := fmt.Sprintf(
		"🚚 *TRITÓN Lavadero - Nuevo Retiro Disponible*\n\n"+
			"🏨 *Hotel:* %s\n"+
			"📅 *Fecha:* %s\n"+
			"🏷️ *Código QR:* `%s`%s\n"+
			"🧺 *Prendas declaradas:* %d unidades\n\n"+
			"El remito está listo para retiro en recepción/lencería.",
		hotelNombre, fecha, codigoQR, remitoTexto, totalPrendas,
	)

	type dest struct {
		id  int
		tel string
	}
	var destinatarios []dest
	for rows.Next() {
		var d dest
		var u string
		if err := rows.Scan(&d.id, &u, &d.tel); err == nil {
			destinatarios = append(destinatarios, d)
		}
	}

	for _, d := range destinatarios {
		userID := d.id
		s.EnviarAsincrono(d.tel, msg, "remito_emitido_chofer", &hotelID, &userID)
	}
}

// NotificarRetiroConfirmado avisa al hotel que el chofer ya retiró las prendas y van a planta.
func (s *WhatsAppService) NotificarRetiroConfirmado(ctx context.Context, hotelID int, codigoQR string, choferNombre string, observacion string) {
	var hotelNombre string
	var telefono *string
	var whatsappActivo bool

	err := s.db.QueryRow(ctx, `
		SELECT nombre, telefono_whatsapp, COALESCE(whatsapp_activo, true)
		FROM hoteles
		WHERE id = $1
	`, hotelID).Scan(&hotelNombre, &telefono, &whatsappActivo)
	if err != nil || telefono == nil || !whatsappActivo || strings.TrimSpace(*telefono) == "" {
		return
	}

	obsTexto := ""
	if strings.TrimSpace(observacion) != "" {
		obsTexto = fmt.Sprintf("\n📝 *Nota:* %s", observacion)
	}

	msg := fmt.Sprintf(
		"🧺 *TRITÓN Lavadero - Ropa en Tránsito a Planta*\n\n"+
			"Estimado equipo de *%s*:\n"+
			"El chofer *%s* acaba de retirar las bolsas del remito `%s`.\n"+
			"La carga ya se encuentra en viaje hacia nuestra planta industrial para clasificación y lavado.%s\n\n"+
			"Podés seguir el estado del lote en el Portal B2B.",
		hotelNombre, choferNombre, codigoQR, obsTexto,
	)

	s.EnviarAsincrono(*telefono, msg, "retiro_confirmado_hotel", &hotelID, nil)
}

// NotificarConciliacion avisa al hotel el resultado del conteo en planta (OK o con Diferencias).
func (s *WhatsAppService) NotificarConciliacion(ctx context.Context, hotelID int, hotelNombre string, fecha string, estado string, totalRemito int, totalProcesado int, kilos float64, diferencia int, muestra []models.MuestraItemConciliacion) {
	var telefono *string
	var whatsappActivo bool

	err := s.db.QueryRow(ctx, `
		SELECT telefono_whatsapp, COALESCE(whatsapp_activo, true)
		FROM hoteles
		WHERE id = $1
	`, hotelID).Scan(&telefono, &whatsappActivo)
	if err != nil || telefono == nil || !whatsappActivo || strings.TrimSpace(*telefono) == "" {
		return
	}

	var msg string
	var tipoEvento string

	if estado == "validado_con_diferencia" || diferencia != 0 {
		tipoEvento = "conciliacion_diferencia"
		detallesDiferencias := []string{}
		for _, it := range muestra {
			if it.Diferencia != 0 {
				detallesDiferencias = append(detallesDiferencias, fmt.Sprintf("• %s: declaradas %d vs. contadas %d (%+d)", it.ItemNombre, it.CantRemito, it.CantProcesadaPrendas, it.Diferencia))
			}
		}

		msg = fmt.Sprintf(
			"⚠️ *TRITÓN Lavadero - Notificación de Auditoría / Diferencia*\n\n"+
				"Establecimiento: *%s*\n"+
				"Fecha: %s\n"+
				"• Declarado en remito: *%d prendas*\n"+
				"• Procesado en planta: *%d prendas* (%.2f kg)\n"+
				"• Diferencia: *%+d prendas*\n\n"+
				"🔍 *Desglose de diferencias:*\n%s\n\n"+
				"El detalle completo ya está disponible en su Portal B2B para su verificación.",
			hotelNombre, fecha, totalRemito, totalProcesado, kilos, diferencia, strings.Join(detallesDiferencias, "\n"),
		)
	} else {
		tipoEvento = "conciliacion_ok"
		msg = fmt.Sprintf(
			"✅ *TRITÓN Lavadero - Conteo Conforme en Planta*\n\n"+
				"Establecimiento: *%s*\n"+
				"Fecha: %s\n"+
				"Se verificaron y procesaron *%d prendas* (%.2f kg).\n"+
				"Coincidencia exacta con el remito. Su ropa limpia está en proceso de doblado y empaquetado para despacho.",
			hotelNombre, fecha, totalProcesado, kilos,
		)
	}

	s.EnviarAsincrono(*telefono, msg, tipoEvento, &hotelID, nil)
}

// NotificarDespachoEntregado avisa al hotel que la ropa limpia fue entregada en su establecimiento.
func (s *WhatsAppService) NotificarDespachoEntregado(ctx context.Context, hotelID int, hotelNombre string, fecha string, choferNombre string, observacion string) {
	var telefono *string
	var whatsappActivo bool

	err := s.db.QueryRow(ctx, `
		SELECT telefono_whatsapp, COALESCE(whatsapp_activo, true)
		FROM hoteles
		WHERE id = $1
	`, hotelID).Scan(&telefono, &whatsappActivo)
	if err != nil || telefono == nil || !whatsappActivo || strings.TrimSpace(*telefono) == "" {
		return
	}

	obs := ""
	if strings.TrimSpace(observacion) != "" {
		obs = fmt.Sprintf("\n📝 *Constancia:* %s", observacion)
	}

	msg := fmt.Sprintf(
		"✨ *TRITÓN Lavadero - Entrega de Ropa Limpia Completada*\n\n"+
			"Establecimiento: *%s*\n"+
			"Fecha: %s\n"+
			"Chofer / Móvil: *%s*\n"+
			"La ropa limpia correspondiente a la fecha ha sido entregada conforme en su lencería.%s\n\n"+
			"¡Muchas gracias por su confianza!\n*Poseidón Servicio de Lavandería SRL*",
		hotelNombre, fecha, choferNombre, obs,
	)

	s.EnviarAsincrono(*telefono, msg, "entrega_completada_hotel", &hotelID, nil)
}

// ── Mensajes Entrantes & Asistente IA ─────────────────────────────────────────

// MensajeEntranteWebhook estructura el payload entrante estándar de Evolution API.
type MensajeEntranteWebhook struct {
	Event    string `json:"event"`
	Instance string `json:"instance"`
	Data     struct {
		Key struct {
			RemoteJID string `json:"remoteJid"`
			FromMe    bool   `json:"fromMe"`
			ID        string `json:"id"`
		} `json:"key"`
		PushName    string `json:"pushName"`
		Message     map[string]any `json:"message"`
		MessageText string `json:"messageText,omitempty"`
	} `json:"data"`
}

// ExtraerTextoMensaje obtiene el texto de un payload de Evolution API.
func (m *MensajeEntranteWebhook) ExtraerTextoMensaje() (string, string) {
	// Extraer teléfono
	tel := m.Data.Key.RemoteJID
	if atIdx := strings.Index(tel, "@"); atIdx != -1 {
		tel = tel[:atIdx]
	}

	if m.Data.MessageText != "" {
		return tel, strings.TrimSpace(m.Data.MessageText)
	}

	// Buscar en subtipos comunes de mensaje
	if conv, ok := m.Data.Message["conversation"].(string); ok && conv != "" {
		return tel, strings.TrimSpace(conv)
	}
	if ext, ok := m.Data.Message["extendedTextMessage"].(map[string]any); ok {
		if text, ok := ext["text"].(string); ok {
			return tel, strings.TrimSpace(text)
		}
	}
	return tel, ""
}

// ProcesarMensajeEntrante identifica al remitente y le responde utilizando Gemini con MCP.
func (s *WhatsAppService) ProcesarMensajeEntrante(ctx context.Context, telRemitente string, texto string, ia *IAService) (string, error) {
	telNormalizado := NormalizarTelefono(telRemitente)
	if telNormalizado == "" || strings.TrimSpace(texto) == "" {
		return "", fmt.Errorf("mensaje o teléfono remitente vacío")
	}

	// Registrar mensaje entrante en base de datos
	var hotelID *int
	var hotelNombre string
	var usuarioID *int
	var usuarioNombre string
	var rolUsuario string

	last8 := telNormalizado
	if len(telNormalizado) >= 8 {
		last8 = telNormalizado[len(telNormalizado)-8:]
	}

	// Buscar si el teléfono pertenece a un hotel
	_ = s.db.QueryRow(ctx, `
		SELECT id, nombre FROM hoteles
		WHERE telefono_whatsapp IS NOT NULL
		  AND (telefono_whatsapp = $1 OR telefono_whatsapp = $2 OR REPLACE(REPLACE(telefono_whatsapp, ' ', ''), '-', '') LIKE '%' || $3)
		LIMIT 1
	`, telRemitente, telNormalizado, last8).Scan(&hotelID, &hotelNombre)

	// Buscar si pertenece a un usuario (chofer/admin)
	_ = s.db.QueryRow(ctx, `
		SELECT id, username, rol FROM usuarios
		WHERE telefono_whatsapp IS NOT NULL
		  AND (telefono_whatsapp = $1 OR telefono_whatsapp = $2 OR REPLACE(REPLACE(telefono_whatsapp, ' ', ''), '-', '') LIKE '%' || $3)
		LIMIT 1
	`, telRemitente, telNormalizado, last8).Scan(&usuarioID, &usuarioNombre, &rolUsuario)

	// Guardar log entrante
	_, _ = s.db.Exec(ctx, `
		INSERT INTO whatsapp_mensajes_log (
			direccion, telefono, hotel_id, usuario_id, tipo_evento, mensaje, estado
		) VALUES ('entrante', $1, $2, $3, 'consulta_entrante', $4, 'recibido')
	`, telNormalizado, hotelID, usuarioID, texto)

	if ia == nil {
		resp := "¡Hola! Gracias por comunicarte con TRITÓN Lavadero Industrial. En este momento el asistente inteligente no está disponible, un operador te responderá a la brevedad."
		s.EnviarAsincrono(telNormalizado, resp, "respuesta_automatica", hotelID, usuarioID)
		return resp, nil
	}

	// Construir prompt enriquecido con el contexto del remitente
	contextoRemitente := "El remitente es un contacto no registrado."
	if hotelID != nil {
		contextoRemitente = fmt.Sprintf("El remitente es el cliente Hotel: '%s' (Hotel ID: %d). Podés consultar sus remitos, estado de ropa y entregas con las herramientas MCP.", hotelNombre, *hotelID)
	} else if usuarioID != nil {
		contextoRemitente = fmt.Sprintf("El remitente es el usuario interno '%s' con rol '%s' (Usuario ID: %d). Si es chofer o repartidor, podés consultar sus hojas de ruta y retiros pendientes.", usuarioNombre, rolUsuario, *usuarioID)
	}

	promptIA := fmt.Sprintf(
		"Estás interactuando por WhatsApp con un usuario de TRITÓN Lavadero Industrial.\n"+
			"Contexto del usuario: %s\n"+
			"Mensaje recibido por WhatsApp: %q\n\n"+
			"Instrucciones:\n"+
			"- Respondé de forma amable, clara y concisa (ideal para leer en la pantalla de un celular).\n"+
			"- Usá negritas con asteriscos (*ejemplo*) y emojis adecuados.\n"+
			"- Usá las herramientas MCP para consultar la base de datos si te preguntan por remitos, entregas, estado de lavado o métricas.\n"+
			"- Si te piden un reporte o estado, dale la información puntual.",
		contextoRemitente, texto,
	)

	iaRes, err := ia.AskWithMCP(ctx, promptIA, nil, nil, nil)
	if err != nil {
		log.Printf("[WhatsApp][IA Error] Error procesando consulta con Gemini: %v", err)
		fallback := "Hola! Recibimos tu consulta. En este momento estamos procesando tus remitos en planta. Podés consultar el detalle en vivo en tu Portal B2B o te responderemos a la brevedad."
		s.EnviarAsincrono(telNormalizado, fallback, "respuesta_fallback", hotelID, usuarioID)
		return fallback, err
	}

	textoRespuesta := strings.TrimSpace(iaRes.Respuesta)
	if textoRespuesta == "" {
		textoRespuesta = "Hola! Recibimos tu consulta. En este momento estamos procesando tus remitos en planta. Podés consultar el detalle en vivo en tu Portal B2B o te responderemos a la brevedad."
	}

	// Responder de vuelta por WhatsApp
	s.EnviarAsincrono(telNormalizado, textoRespuesta, "respuesta_ia_whatsapp", hotelID, usuarioID)
	return textoRespuesta, nil
}
