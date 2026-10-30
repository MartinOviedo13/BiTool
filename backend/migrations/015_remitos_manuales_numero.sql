-- +goose Up
-- 1. Agregar numero_remito y observaciones a la tabla envios para remitos en papel / manuales
ALTER TABLE envios ADD COLUMN IF NOT EXISTS numero_remito VARCHAR(100);
ALTER TABLE envios ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 2. Relajar constraint UNIQUE(hotel_id, fecha) para permitir varios remitos con distinto número el mismo día
ALTER TABLE envios DROP CONSTRAINT IF EXISTS envios_hotel_id_fecha_key;
ALTER TABLE envios DROP CONSTRAINT IF EXISTS uq_envios_hotel_fecha;

-- 3. Índices de búsqueda rápida por número de remito y fecha
CREATE INDEX IF NOT EXISTS idx_envios_numero_remito ON envios(numero_remito);
CREATE INDEX IF NOT EXISTS idx_envios_hotel_fecha ON envios(hotel_id, fecha);

-- 4. Índice único para evitar cargar dos veces el mismo número de remito para el mismo hotel
CREATE UNIQUE INDEX IF NOT EXISTS uq_envios_hotel_numero_remito
    ON envios(hotel_id, numero_remito)
    WHERE numero_remito IS NOT NULL AND numero_remito <> '';

-- +goose Down
DROP INDEX IF EXISTS uq_envios_hotel_numero_remito;
DROP INDEX IF EXISTS idx_envios_hotel_fecha;
DROP INDEX IF EXISTS idx_envios_numero_remito;
ALTER TABLE envios DROP COLUMN IF EXISTS observaciones;
ALTER TABLE envios DROP COLUMN IF EXISTS numero_remito;
