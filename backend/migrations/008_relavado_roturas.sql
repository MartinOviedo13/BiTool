-- +goose Up
ALTER TABLE registros
    ADD COLUMN IF NOT EXISTS cantidad_relavado INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cantidad_rota INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE registros
    DROP COLUMN IF EXISTS cantidad_relavado,
    DROP COLUMN IF EXISTS cantidad_rota;
