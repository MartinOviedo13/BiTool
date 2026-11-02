-- +goose Up
-- 1. Tabla principal de borradores de remitos analizados por IA
CREATE TABLE IF NOT EXISTS remito_borrador (
    id SERIAL PRIMARY KEY,
    lote_id VARCHAR(64),
    hotel_id INT REFERENCES hoteles(id) ON DELETE SET NULL,
    hotel_nombre_detectado VARCHAR(255),
    fecha DATE,
    numero_remito VARCHAR(100),
    observaciones TEXT,
    estado VARCHAR(50) NOT NULL DEFAULT 'pendiente_revision' CHECK (estado IN ('procesando', 'pendiente_revision', 'confirmado', 'descartado', 'error')),
    confianza_promedio NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    imagen_path VARCHAR(512),
    imagen_mime VARCHAR(100),
    gemini_raw_json JSONB,
    error_mensaje TEXT,
    envio_id INT REFERENCES envios(id) ON DELETE SET NULL,
    creado_por_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de items detectados en el remito borrador
CREATE TABLE IF NOT EXISTS remito_borrador_item (
    id SERIAL PRIMARY KEY,
    borrador_id INT NOT NULL REFERENCES remito_borrador(id) ON DELETE CASCADE,
    item_id INT REFERENCES items(id) ON DELETE SET NULL,
    item_nombre_detectado VARCHAR(255) NOT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    cantidad_relavado INT NOT NULL DEFAULT 0,
    cantidad_rota INT NOT NULL DEFAULT 0,
    confianza NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    dudoso BOOLEAN NOT NULL DEFAULT FALSE,
    nota VARCHAR(255)
);

-- 3. Índices para búsqueda rápida y listado de lotes/borradores
CREATE INDEX IF NOT EXISTS idx_remito_borrador_lote ON remito_borrador(lote_id);
CREATE INDEX IF NOT EXISTS idx_remito_borrador_estado ON remito_borrador(estado);
CREATE INDEX IF NOT EXISTS idx_remito_borrador_hotel_fecha ON remito_borrador(hotel_id, fecha);
CREATE INDEX IF NOT EXISTS idx_remito_borrador_creado_en ON remito_borrador(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_remito_borrador_item_borrador ON remito_borrador_item(borrador_id);

-- +goose Down
DROP TABLE IF EXISTS remito_borrador_item;
DROP TABLE IF EXISTS remito_borrador;
