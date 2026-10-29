-- +goose Up
-- 1. Agregar columna sector y activo en items
ALTER TABLE items ADD COLUMN IF NOT EXISTS sector VARCHAR(20) NOT NULL DEFAULT 'planchado' CHECK (sector IN ('planchado', 'secadora'));
ALTER TABLE items ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- 2. Clasificar prendas existentes por sector físico de planta
UPDATE items SET sector = 'planchado' WHERE nombre IN ('1 PZ', '2 PZ', 'Fundas', 'Fundon', 'Cubrecamas', 'Mant.', 'Cb Mant.', 'Serv.');
UPDATE items SET sector = 'secadora' WHERE nombre IN ('Toallones', 'Toallas', 'Alfombras', 'Toallon Pileta', 'Batas');

-- 3. Incorporar nuevas prendas de relleno y secadora
INSERT INTO items (nombre, se_factura, sector, activo) VALUES
    ('Acolchados', true, 'secadora', true),
    ('Pillow', true, 'secadora', true),
    ('Almohada', true, 'secadora', true)
ON CONFLICT (nombre) DO UPDATE SET sector = 'secadora', activo = true;

-- 4. Dar de baja relavado y otras prendas del catálogo comercial activo
UPDATE items SET activo = false WHERE nombre IN ('Relav.', 'Otras prendas');

-- +goose Down
UPDATE items SET activo = true WHERE nombre IN ('Relav.', 'Otras prendas');
DELETE FROM items WHERE nombre IN ('Acolchados', 'Pillow', 'Almohada');
ALTER TABLE items DROP COLUMN IF EXISTS activo;
ALTER TABLE items DROP COLUMN IF EXISTS sector;
