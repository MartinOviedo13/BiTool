-- +goose Up
-- 1. Ampliar estados y trazabilidad de retiro en envios (remitos)
ALTER TABLE envios ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'listo_para_retiro';
ALTER TABLE envios ADD COLUMN IF NOT EXISTS retirado_por_id INT REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS retirado_en TIMESTAMPTZ;
ALTER TABLE envios ADD COLUMN IF NOT EXISTS observacion_retiro TEXT;

-- 2. Permitir despacho_id NULL en notificaciones_operativas para eventos de retiro/emision de remito
ALTER TABLE notificaciones_operativas ALTER COLUMN despacho_id DROP NOT NULL;

-- 3. Indice para agilizar consulta de remitos por fecha y estado de retiro
CREATE INDEX IF NOT EXISTS idx_envios_fecha_estado ON envios(fecha, estado);

-- +goose Down
DROP INDEX IF EXISTS idx_envios_fecha_estado;
ALTER TABLE notificaciones_operativas ALTER COLUMN despacho_id SET NOT NULL;
ALTER TABLE envios DROP COLUMN IF EXISTS observacion_retiro;
ALTER TABLE envios DROP COLUMN IF EXISTS retirado_en;
ALTER TABLE envios DROP COLUMN IF EXISTS retirado_por_id;
ALTER TABLE envios DROP COLUMN IF EXISTS estado;

