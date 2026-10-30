-- +goose Up
ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_quimico NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_energia NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_mano_obra NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- Aplicar benchmarks iniciales de costos operativos si están en cero
UPDATE items SET
    costo_quimico = CASE
        WHEN costo_quimico > 0 THEN costo_quimico
        WHEN sector = 'secadora' THEN ROUND(COALESCE(precio_unitario, 1200) * 0.12, 2)
        ELSE ROUND(COALESCE(precio_unitario, 950) * 0.09, 2)
    END,
    costo_energia = CASE
        WHEN costo_energia > 0 THEN costo_energia
        WHEN sector = 'secadora' THEN ROUND(COALESCE(precio_unitario, 1200) * 0.16, 2)
        ELSE ROUND(COALESCE(precio_unitario, 950) * 0.11, 2)
    END,
    costo_mano_obra = CASE
        WHEN costo_mano_obra > 0 THEN costo_mano_obra
        WHEN sector = 'secadora' THEN ROUND(COALESCE(precio_unitario, 1200) * 0.14, 2)
        ELSE ROUND(COALESCE(precio_unitario, 950) * 0.18, 2)
    END
WHERE precio_unitario IS NOT NULL AND precio_unitario > 0
  AND (costo_quimico = 0 OR costo_energia = 0 OR costo_mano_obra = 0);

-- +goose Down
ALTER TABLE items DROP COLUMN IF EXISTS costo_mano_obra;
ALTER TABLE items DROP COLUMN IF EXISTS costo_energia;
ALTER TABLE items DROP COLUMN IF EXISTS costo_quimico;
