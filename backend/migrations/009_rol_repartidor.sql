-- +goose Up
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'operario', 'cliente', 'repartidor'));

-- Usuario por defecto para chofer/repartidor
-- Contrasena: repartidor1234
INSERT INTO usuarios (username, password_hash, rol) VALUES
    ('repartidor', '$2a$12$/Nz7rMA8DJckobKVx/AaMOjc7QqljdePjscRhOf9wdjOJyXpRUh1e', 'repartidor')
ON CONFLICT (username) DO UPDATE SET rol = 'repartidor';

-- +goose Down
DELETE FROM usuarios WHERE username = 'repartidor';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'operario', 'cliente'));
