-- +goose Up
-- Agrega soporte de notificaciones por WhatsApp en hoteles y usuarios

ALTER TABLE hoteles
    ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(30),
    ADD COLUMN IF NOT EXISTS whatsapp_activo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(30);

-- Tabla de auditoría y trazabilidad de mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_mensajes_log (
    id SERIAL PRIMARY KEY,
    direccion VARCHAR(10) NOT NULL CHECK (direccion IN ('saliente', 'entrante')),
    telefono VARCHAR(30) NOT NULL,
    hotel_id INT REFERENCES hoteles(id) ON DELETE SET NULL,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo_evento VARCHAR(50) NOT NULL,
    mensaje TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'enviado' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'recibido', 'simulado')),
    error_detalle TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_telefono_created ON whatsapp_mensajes_log(telefono, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_hotel_created ON whatsapp_mensajes_log(hotel_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_whatsapp_log_hotel_created;
DROP INDEX IF EXISTS idx_whatsapp_log_telefono_created;
DROP TABLE IF EXISTS whatsapp_mensajes_log;

ALTER TABLE usuarios
    DROP COLUMN IF EXISTS telefono_whatsapp;

ALTER TABLE hoteles
    DROP COLUMN IF EXISTS whatsapp_activo,
    DROP COLUMN IF EXISTS telefono_whatsapp;
