package database

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	config.MaxConns = 10
	config.MinConns = 1
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}

	if err := ensureConciliacionSchema(ctx, db); err != nil {
		db.Close()
		return nil, err
	}

	if err := ensureSectoresSchema(ctx, db); err != nil {
		db.Close()
		return nil, err
	}

	if err := ensureCostosSchema(ctx, db); err != nil {
		db.Close()
		return nil, err
	}

	if err := ensureRemitosManualesSchema(ctx, db); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func ensureConciliacionSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
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

		ALTER TABLE envios ADD COLUMN IF NOT EXISTS estado VARCHAR(30) NOT NULL DEFAULT 'listo_para_retiro';
		ALTER TABLE envios ADD COLUMN IF NOT EXISTS retirado_por_id INT REFERENCES usuarios(id) ON DELETE SET NULL;
		ALTER TABLE envios ADD COLUMN IF NOT EXISTS retirado_en TIMESTAMPTZ;
		ALTER TABLE envios ADD COLUMN IF NOT EXISTS observacion_retiro TEXT;
		ALTER TABLE notificaciones_operativas ALTER COLUMN despacho_id DROP NOT NULL;
		CREATE INDEX IF NOT EXISTS idx_envios_fecha_estado ON envios(fecha, estado);
	`)
	return err
}

func ensureSectoresSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		ALTER TABLE items ADD COLUMN IF NOT EXISTS sector VARCHAR(20) NOT NULL DEFAULT 'planchado' CHECK (sector IN ('planchado', 'secadora'));
		ALTER TABLE items ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

		UPDATE items SET sector = 'planchado' WHERE nombre IN ('1 PZ', '2 PZ', 'Fundas', 'Fundon', 'Cubrecamas', 'Mant.', 'Cb Mant.', 'Serv.');
		UPDATE items SET sector = 'secadora' WHERE nombre IN ('Toallones', 'Toallas', 'Alfombras', 'Toallon Pileta', 'Batas');

		INSERT INTO items (nombre, se_factura, sector, activo) VALUES
			('Acolchados', true, 'secadora', true),
			('Pillow', true, 'secadora', true),
			('Almohada', true, 'secadora', true)
		ON CONFLICT (nombre) DO UPDATE SET sector = 'secadora', activo = true;

		UPDATE items SET activo = false WHERE nombre IN ('Relav.', 'Otras prendas');
	`)
	return err
}

func ensureCostosSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_quimico NUMERIC(10, 2) NOT NULL DEFAULT 0;
		ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_energia NUMERIC(10, 2) NOT NULL DEFAULT 0;
		ALTER TABLE items ADD COLUMN IF NOT EXISTS costo_mano_obra NUMERIC(10, 2) NOT NULL DEFAULT 0;

		-- Si los costos unitarios no están configurados, aplicar ratios industriales de referencia
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
	`)
	return err
}

func ensureRemitosManualesSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		ALTER TABLE envios ADD COLUMN IF NOT EXISTS numero_remito VARCHAR(100);
		ALTER TABLE envios ADD COLUMN IF NOT EXISTS observaciones TEXT;
		ALTER TABLE envios DROP CONSTRAINT IF EXISTS envios_hotel_id_fecha_key;
		ALTER TABLE envios DROP CONSTRAINT IF EXISTS uq_envios_hotel_fecha;
		CREATE INDEX IF NOT EXISTS idx_envios_numero_remito ON envios(numero_remito);
		CREATE INDEX IF NOT EXISTS idx_envios_hotel_fecha ON envios(hotel_id, fecha);
		CREATE UNIQUE INDEX IF NOT EXISTS uq_envios_hotel_numero_remito
			ON envios(hotel_id, numero_remito)
			WHERE numero_remito IS NOT NULL AND numero_remito <> '';
	`)
	return err
}
