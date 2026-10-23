-- +goose Up
DELETE FROM registros r1
USING registros r2
WHERE r1.hotel_id = r2.hotel_id
  AND r1.item_id = r2.item_id
  AND r1.fecha = r2.fecha
  AND r1.id < r2.id;

ALTER TABLE registros DROP CONSTRAINT IF EXISTS uq_registros_hotel_item_fecha;
ALTER TABLE registros ADD CONSTRAINT uq_registros_hotel_item_fecha UNIQUE (hotel_id, item_id, fecha);

-- +goose Down
ALTER TABLE registros DROP CONSTRAINT IF EXISTS uq_registros_hotel_item_fecha;

