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
	ID               int       `json:"id"`
	Fecha            time.Time `json:"fecha"`
	HotelID          int       `json:"hotel_id"`
	ItemID           int       `json:"item_id"`
	Cantidad         int       `json:"cantidad"`
	CantidadRelavado int       `json:"cantidad_relavado"`
	CantidadRota     int       `json:"cantidad_rota"`
	ImportID         *int      `json:"import_id"`
	Hotel            Hotel     `json:"hotel"`
	Item             Item      `json:"item"`
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
	HotelID       int     `json:"hotel_id"`
	Hotel         string  `json:"hotel"`
	CantidadTotal int     `json:"cantidad_total"`
	Facturacion   float64 `json:"facturacion"`
}

// ComparacionPeriodo agrupa las metricas del periodo actual y el anterior para
// calcular variaciones en el frontend.
type ComparacionPeriodo struct {
	ActualAt              *time.Time `json:"actual_desde"`
	ActualHasta           *time.Time `json:"actual_hasta"`
	AnteriorDesde          *time.Time `json:"anterior_desde"`
	AnteriorHasta          *time.Time `json:"anterior_hasta"`
	// Actual
	CantidadTotalActual       int     `json:"cantidad_total_actual"`
	CantidadFacturableActual int     `json:"cantidad_facturable_actual"`
	CantidadRelavadoActual   int     `json:"cantidad_relavado_actual"`
	FacturacionActual        float64 `json:"facturacion_actual"`
	// Anterior
	CantidadTotalAnterior       int     `json:"cantidad_total_anterior"`
	CantidadFacturableAnterior int     `json:"cantidad_facturable_anterior"`
	CantidadRelavadoAnterior   int     `json:"cantidad_relavado_anterior"`
	FacturacionAnterior        float64 `json:"facturacion_anterior"`
}

// TendenciaRegistro es un punto de la serie temporal (por fecha).
type TendenciaRegistro struct {
	Fecha            string  `json:"fecha"`
	CantidadTotal    int     `json:"cantidad_total"`
	Facturacion      float64 `json:"facturacion"`
	CantidadFacturable int   `json:"cantidad_facturable"`
}

// Usuario representa un usuario del sistema con su rol.
type Usuario struct {
	ID          int     `json:"id"`
	Username    string  `json:"username"`
	Rol         string  `json:"rol"`
	HotelID     *int    `json:"hotel_id,omitempty"`
	HotelNombre *string `json:"hotel_nombre,omitempty"`
	Activo      bool    `json:"activo"`
}

// LoginRequest es el cuerpo del POST /auth/login.
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse es la respuesta exitosa del POST /auth/login.
type LoginResponse struct {
	Token       string  `json:"token"`
	Rol         string  `json:"rol"`
	Username    string  `json:"username"`
	HotelID     *int    `json:"hotel_id,omitempty"`
	HotelNombre *string `json:"hotel_nombre,omitempty"`
}

// Modelos para Portal B2B (Envios / Remitos)
type Envio struct {
	ID        int            `json:"id"`
	HotelID   int            `json:"hotel_id"`
	Hotel     *Hotel         `json:"hotel,omitempty"`
	Fecha     time.Time      `json:"fecha"`
	CodigoQR  string         `json:"codigo_qr"`
	CreadoEn  time.Time      `json:"creado_en"`
	Detalles  []EnvioDetalle `json:"detalles,omitempty"`
}

type EnvioDetalle struct {
	ID                int    `json:"id"`
	EnvioID           int    `json:"envio_id"`
	ItemID            int    `json:"item_id"`
	Item              *Item  `json:"item,omitempty"`
	CantidadDeclarada int    `json:"cantidad_declarada"`
}

type CreateEnvioRequest struct {
	Fecha    string            `json:"fecha"` // YYYY-MM-DD
	Detalles []CreateEnvioItem `json:"detalles"`
}

type CreateEnvioItem struct {
	ItemID            int `json:"item_id"`
	CantidadDeclarada int `json:"cantidad_declarada"`
}

type AuditoriaItem struct {
	Fecha             string `json:"fecha"`
	HotelID           int    `json:"hotel_id"`
	HotelNombre       string `json:"hotel_nombre"`
	ItemID            int    `json:"item_id"`
	ItemNombre        string `json:"item_nombre"`
	CantidadDeclarada int    `json:"cantidad_declarada"`
	CantidadLimpia    int    `json:"cantidad_limpia"`
	CantidadRelavado  int    `json:"cantidad_relavado"`
	CantidadRota      int    `json:"cantidad_rota"`
	TotalContado      int    `json:"total_contado"`
	Diferencia        int    `json:"diferencia"`
	Estado            string `json:"estado"` // OK, FALTANTE, SOBRANTE, PENDIENTE_LAVADERO, SIN_REMITO
}

type ConteoRequest struct {
	Fecha            string `json:"fecha"` // YYYY-MM-DD
	HotelID          int    `json:"hotel_id"`
	ItemID           int    `json:"item_id"`
	CantidadLimpia   int    `json:"cantidad_limpia"`
	CantidadRelavado int    `json:"cantidad_relavado"`
	CantidadRota     int    `json:"cantidad_rota"`
}

type PortalHotelDashboard struct {
	HotelNombre        string               `json:"hotel_nombre"`
	TotalPrendasMes    int                  `json:"total_prendas_mes"`
	PrendasFacturables int                  `json:"prendas_facturables"`
	PrendasRelavadas   int                  `json:"prendas_relavadas"`
	PrendasRotas       int                  `json:"prendas_rotas"`
	TasaRelavado       float64              `json:"tasa_relavado"`
	TasaRotura         float64              `json:"tasa_rotura"`
	GastoEstimadoMes   float64              `json:"gasto_estimado_mes"`
	RopaEnLavadero     []PrendaEstadoHotel  `json:"ropa_en_lavadero"`
	EnviosRecientes    []Envio              `json:"envios_recientes"`
	ConsumoPorPrenda   []PrendaConsumoHotel `json:"consumo_por_prenda"`
}

type PrendaEstadoHotel struct {
	ItemID           int    `json:"item_id"`
	ItemNombre       string `json:"item_nombre"`
	EnRelavado       int    `json:"en_relavado"`
	DadasDeBaja      int    `json:"dadas_de_baja"`
	LimpiasDevueltas int    `json:"limpias_devueltas"`
}

type PrendaConsumoHotel struct {
	ItemID     int     `json:"item_id"`
	ItemNombre string  `json:"item_nombre"`
	Cantidad   int     `json:"cantidad"`
	Subtotal   float64 `json:"subtotal"`
}


type Import struct {
	ID             int       `json:"id"`
	NombreArchivo  string    `json:"nombre_archivo"`
	Estado         string    `json:"estado"`
	FilasTotales   int       `json:"filas_totales"`
	FilasConError  int       `json:"filas_con_error"`
	Errores        any       `json:"errores"`
	CreadoEn       time.Time `json:"creado_en"`
}

type StagingRegistro struct {
	ID        int       `json:"id"`
	ImportID  int       `json:"import_id"`
	Fecha     time.Time `json:"fecha"`
	HotelID   int       `json:"hotel_id"`
	ItemID    int       `json:"item_id"`
	Cantidad  int       `json:"cantidad"`
}
