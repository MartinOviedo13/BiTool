package services

import "context"

// Message es un turno de conversacion enviado al modelo.
type Message struct {
	Role    string // "system", "user" o "assistant"
	Content string
}

// LLMProvider desacopla el codigo de IA del proveedor concreto (Gemini, OpenAI,
// etc.). Permite cambiar de proveedor mediante configuracion sin reescribir la
// logica de negocio.
type LLMProvider interface {
	// Complete envia un conjunto de mensajes y devuelve la respuesta textual del
	// modelo. El primer mensaje con Role == "system" se usa como instruccion de
	// sistema cuando el proveedor lo soporta.
	Complete(ctx context.Context, system string, userMessages []Message) (string, error)
}
