package models

import (
	"time"
)

type Hotel struct {
	ID     int    `json:"id"`
	Nombre string `json:"nombre"`
	Activo bool   `json:"activo"`
}

type Item struct {
	ID             int      `json:"id"`
	Nombre         string   `json:"nombre"`
	PrecioUnitario *float64 `json:"precio_unitario"`
	SeFactura      bool     `json:"se_factura"`
}

type Registro struct {
	ID       int       `json:"id"`
	Fecha    time.Time `json:"fecha"`
	HotelID  int       `json:"hotel_id"`
	ItemID   int       `json:"item_id"`
	Cantidad int       `json:"cantidad"`
	Hotel    Hotel     `json:"hotel"`
	Item     Item      `json:"item"`
}

type ResumenGeneral struct {
	FechaDesde          *time.Time `json:"fecha_desde"`
	FechaHasta          *time.Time `json:"fecha_hasta"`
	CantidadTotal       int        `json:"cantidad_total"`
	CantidadFacturable  int        `json:"cantidad_facturable"`
	CantidadRelavado    int        `json:"cantidad_relavado"`
	FacturacionEstimada float64    `json:"facturacion_estimada"`
}

type RankingHotel struct {
	HotelID       int    `json:"hotel_id"`
	Hotel         string `json:"hotel"`
	CantidadTotal int    `json:"cantidad_total"`
}
