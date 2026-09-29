-- +goose Up
CREATE TABLE IF NOT EXISTS imports (
    id              SERIAL PRIMARY KEY,
    nombre_archivo  VARCHAR(255) NOT NULL,
    estado          VARCHAR(50) NOT NULL DEFAULT 'procesando',
    filas_totales   INTEGER NOT NULL DEFAULT 0,
    filas_con_error INTEGER NOT NULL DEFAULT 0,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agregar import_id a la tabla existente registros (ventas)
ALTER TABLE registros ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS staging_registros (
    id          SERIAL PRIMARY KEY,
    import_id   INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    fecha       DATE NOT NULL,
    hotel_id    INTEGER NOT NULL REFERENCES hoteles(id),
    item_id     INTEGER NOT NULL REFERENCES items(id),
    cantidad    INTEGER NOT NULL CHECK (cantidad >= 0)
);

-- Indices pedidos para staging y registros
CREATE INDEX IF NOT EXISTS idx_staging_hotel_fecha ON staging_registros(hotel_id, fecha);
CREATE INDEX IF NOT EXISTS idx_staging_item_id ON staging_registros(item_id);
-- idx_registros_fecha e idx_registros_item_id ya existen en la tabla registros.

-- +goose Down
DROP TABLE IF EXISTS staging_registros;
ALTER TABLE registros DROP COLUMN IF NOT EXISTS import_id;
DROP TABLE IF EXISTS imports;
