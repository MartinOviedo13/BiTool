-- +goose Up
-- 1. Vincular usuarios a hoteles (nullable, porque los admin/operarios no tienen hotel)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hoteles(id) ON DELETE SET NULL;

-- 2. Cabecera del envío (El Remito Digital)
CREATE TABLE IF NOT EXISTS envios (
    id SERIAL PRIMARY KEY,
    hotel_id INTEGER NOT NULL REFERENCES hoteles(id),
    fecha DATE NOT NULL,
    codigo_qr VARCHAR(100) UNIQUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(hotel_id, fecha)
);

-- 3. Detalle del envío (Lo que dice el hotel que mandó)
CREATE TABLE IF NOT EXISTS envio_detalles (
    id SERIAL PRIMARY KEY,
    envio_id INTEGER NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    cantidad_declarada INTEGER NOT NULL CHECK (cantidad_declarada > 0),
    UNIQUE(envio_id, item_id)
);

-- +goose Down
DROP TABLE IF EXISTS envio_detalles;
DROP TABLE IF EXISTS envios;
ALTER TABLE usuarios DROP COLUMN IF NOT EXISTS hotel_id;
