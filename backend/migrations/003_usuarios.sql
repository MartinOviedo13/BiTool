-- +goose Up
CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(60) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol           VARCHAR(20) NOT NULL CHECK (rol IN ('admin','operario')),
    activo        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);

-- Usuarios iniciales con contrasenas hasheadas con bcrypt costo 12.
-- admin: admin1234
-- operario: operario1234
-- Para cambiar contrasenas: UPDATE usuarios SET password_hash = '<nuevo_hash>' WHERE username = '...';
INSERT INTO usuarios (username, password_hash, rol) VALUES
    ('admin',    '$2a$12$A3PxJ3PylCi3/tikk21QeOAb3h4BhbF.077qXCytcUDvPv15VrHBG', 'admin'),
    ('operario', '$2a$12$1SWNgxXb96Q5NUq886Ldm.EEON/MLisxAzYfgr18Tx.VIfHANNoX2', 'operario')
ON CONFLICT (username) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS usuarios;
