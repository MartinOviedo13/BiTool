-- +goose Up
ALTER TABLE imports ADD COLUMN IF NOT EXISTS errores JSONB DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE imports DROP COLUMN IF NOT EXISTS errores;
