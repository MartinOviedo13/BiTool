package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// EventoRealtime representa el mensaje difundido a las pantallas conectadas.
type EventoRealtime struct {
	Tipo      string `json:"tipo"`       // REMITO_LISTO_RETIRO, REMITO_RETIRADO, DESPACHO_CONCILIADO, etc.
	HotelID   int    `json:"hotel_id"`
	Titulo    string `json:"titulo"`
	Mensaje   string `json:"mensaje"`
	Timestamp string `json:"timestamp"`
	Data      any    `json:"data,omitempty"`
}

// RealtimeBroker gestiona los clientes SSE conectados.
type RealtimeBroker struct {
	mu      sync.RWMutex
	clients map[chan []byte]bool
}

var brokerInstance = &RealtimeBroker{
	clients: make(map[chan []byte]bool),
}

// GetBroker retorna la instancia singleton del broker de eventos.
func GetBroker() *RealtimeBroker {
	return brokerInstance
}

// Broadcast serializa y envía un evento a todos los clientes conectados.
func (b *RealtimeBroker) Broadcast(tipo string, hotelID int, titulo, mensaje string, data any) {
	evt := EventoRealtime{
		Tipo:      tipo,
		HotelID:   hotelID,
		Titulo:    titulo,
		Mensaje:   mensaje,
		Timestamp: time.Now().Format(time.RFC3339),
		Data:      data,
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	for ch := range b.clients {
		select {
		case ch <- payload:
		default:
			// Si el cliente está lento o desconectado, evitamos bloquear el hilo
		}
	}
}

// handleSSE es el endpoint HTTP GET /api/realtime/stream
func (a *App) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "Streaming no soportado por el servidor.")
		return
	}

	// Cabeceras estándar Server-Sent Events
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Canal para recibir eventos
	msgChan := make(chan []byte, 32)

	broker := GetBroker()
	broker.mu.Lock()
	broker.clients[msgChan] = true
	broker.mu.Unlock()

	defer func() {
		broker.mu.Lock()
		delete(broker.clients, msgChan)
		close(msgChan)
		broker.mu.Unlock()
	}()

	// Mensaje inicial de handshake
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
	flusher.Flush()

	// Ticker para mantener la conexión viva (Heartbeat cada 25s)
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case msg, ok := <-msgChan:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}

