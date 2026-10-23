-- +goose Up
CREATE TABLE IF NOT EXISTS despachos_conciliacion (
    id SERIAL PRIMARY KEY,
    hotel_id INT NOT NULL REFERENCES hoteles(id) ON DELETE CASCADE,
    remito_id INT REFERENCES envios(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'validado_ok', 'validado_con_diferencia', 'entregado')),
    total_remito_prendas INT NOT NULL DEFAULT 0,
    total_procesado_prendas INT NOT NULL DEFAULT 0,
    total_procesado_kilos NUMERIC(10,2) NOT NULL DEFAULT 0,
    diferencia_prendas INT NOT NULL DEFAULT 0,
    muestra_procesado JSONB NOT NULL DEFAULT '[]'::jsonb,
    validado_por_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    validado_en TIMESTAMPTZ,
    entregado_por_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    entregado_en TIMESTAMPTZ,
    observacion_entrega TEXT,
    CONSTRAINT uq_despachos_conciliacion_hotel_fecha UNIQUE (hotel_id, fecha)
);

CREATE TABLE IF NOT EXISTS notificaciones_operativas (
    id SERIAL PRIMARY KEY,
    rol_destino VARCHAR(20) NOT NULL,
    hotel_id INT NOT NULL REFERENCES hoteles(id) ON DELETE CASCADE,
    despacho_id INT NOT NULL REFERENCES despachos_conciliacion(id) ON DELETE CASCADE,
    tipo VARCHAR(40) NOT NULL,
    severidad VARCHAR(15) NOT NULL DEFAULT 'info',
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    muestra_datos JSONB NOT NULL DEFAULT '[]'::jsonb,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    leida_en TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despachos_conciliacion_fecha_estado ON despachos_conciliacion(fecha, estado);
CREATE INDEX IF NOT EXISTS idx_notificaciones_operativas_rol_leida_created ON notificaciones_operativas(rol_destino, leida, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_notificaciones_operativas_rol_leida_created;
DROP INDEX IF EXISTS idx_despachos_conciliacion_fecha_estado;
DROP TABLE IF EXISTS notificaciones_operativas;
DROP TABLE IF EXISTS despachos_conciliacion;

