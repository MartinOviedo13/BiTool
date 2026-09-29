-- +goose Up
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'operario', 'cliente'));

INSERT INTO usuarios (username, password_hash, rol, hotel_id) VALUES
    ('kingdavid', '$2a$12$kp81RfpdysOiQrtlQtifcesp0Ev7aFt4JNKvc4hJW8y1r04spdjmS', 'cliente', 1)
ON CONFLICT (username) DO UPDATE SET hotel_id = 1, rol = 'cliente';

-- +goose Down
DELETE FROM usuarios WHERE username = 'kingdavid';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'operario'));
