-- +goose Up
CREATE TABLE IF NOT EXISTS hoteles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    precio_unitario NUMERIC(10, 2),
    se_factura BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registros (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    hotel_id INTEGER NOT NULL REFERENCES hoteles(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    cantidad INTEGER NOT NULL CHECK (cantidad >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_registro_fecha_hotel_item UNIQUE (fecha, hotel_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_hoteles_nombre ON hoteles(nombre);
CREATE INDEX IF NOT EXISTS idx_items_nombre ON items(nombre);
CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros(fecha);
CREATE INDEX IF NOT EXISTS idx_registros_hotel_id ON registros(hotel_id);
CREATE INDEX IF NOT EXISTS idx_registros_item_id ON registros(item_id);

-- +goose Down
DROP TABLE IF EXISTS registros;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS hoteles;
