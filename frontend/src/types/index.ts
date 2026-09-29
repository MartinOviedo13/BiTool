export interface Hotel {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface Item {
  id: number;
  nombre: string;
  precio_unitario: number | null;
  se_factura: boolean;
}

export interface Registro {
  id: number;
  fecha: string;
  hotel_id: number;
  item_id: number;
  cantidad: number;
  hotel: Hotel;
  item: Item;
}

export interface BatchRegistroItem {
  fecha: string;
  hotel_id: number;
  item_id: number;
  cantidad: number;
}

export interface ResumenGeneral {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  cantidad_total: number;
  cantidad_facturable: number;
  cantidad_relavado: number;
  facturacion_estimada: number;
}

export interface RankingHotel {
  hotel_id: number;
  hotel: string;
  cantidad_total: number;
  facturacion: number;
}

export interface ComparacionPeriodo {
  actual_desde: string | null;
  actual_hasta: string | null;
  anterior_desde: string | null;
  anterior_hasta: string | null;
  cantidad_total_actual: number;
  cantidad_facturable_actual: number;
  cantidad_relavado_actual: number;
  facturacion_actual: number;
  cantidad_total_anterior: number;
  cantidad_facturable_anterior: number;
  cantidad_relavado_anterior: number;
  facturacion_anterior: number;
}

export interface TendenciaRegistro {
  fecha: string;
  cantidad_total: number;
  cantidad_facturable: number;
  facturacion: number;
}

export type PeriodOption = 'today' | 'last7' | 'month' | 'all' | 'custom';

export interface ImportRecordPreview {
  fecha: string;
  hotel_nombre_leido: string;
  hotel_id: number | null;
  item_nombre_leido: string;
  item_id: number | null;
  cantidad: number;
  mapeado: boolean;
}

export interface ImportPreviewResponse {
  registros: ImportRecordPreview[];
  resumen: {
    total_filas: number;
    mapeados_ok: number;
    pendientes_reconciliar: number;
  };
}

export interface Alerta {
  id: string;
  nivel: 'info' | 'warning' | 'danger';
  categoria: string;
  titulo: string;
  detalle: string;
  accion?: string;
}

export type UserRole = 'admin' | 'operario' | 'cliente';

export interface User {
  id: number;
  username: string;
  rol: UserRole;
  hotel_id?: number | null;
  hotel_nombre?: string | null;
}

export interface EnvioDetalle {
  id: number;
  envio_id: number;
  item_id: number;
  item?: Item;
  cantidad_declarada: number;
}

export interface Envio {
  id: number;
  hotel_id: number;
  hotel?: Hotel;
  fecha: string;
  codigo_qr: string;
  creado_en: string;
  detalles?: EnvioDetalle[];
}

export interface CreateEnvioItem {
  item_id: number;
  cantidad_declarada: number;
}

export interface CreateEnvioRequest {
  fecha: string;
  detalles: CreateEnvioItem[];
}

export interface AuditoriaItem {
  fecha: string;
  hotel_id: number;
  hotel_nombre: string;
  item_id: number;
  item_nombre: string;
  cantidad_declarada: number;
  cantidad_limpia: number;
  cantidad_relavado: number;
  cantidad_rota: number;
  total_contado: number;
  diferencia: number;
  estado: 'OK' | 'FALTANTE' | 'SOBRANTE' | 'PENDIENTE_LAVADERO' | 'SIN_REMITO';
}

export interface ConteoRequest {
  fecha: string;
  hotel_id: number;
  item_id: number;
  cantidad_limpia: number;
  cantidad_relavado: number;
  cantidad_rota: number;
}

export interface PrendaEstadoHotel {
  item_id: number;
  item_nombre: string;
  en_relavado: number;
  dadas_de_baja: number;
  limpias_devueltas: number;
}

export interface PrendaConsumoHotel {
  item_id: number;
  item_nombre: string;
  cantidad: number;
  subtotal: number;
}

export interface PortalHotelDashboard {
  hotel_nombre: string;
  total_prendas_mes: number;
  prendas_facturables: number;
  prendas_relavadas: number;
  prendas_rotas: number;
  tasa_relavado: number;
  tasa_rotura: number;
  gasto_estimado_mes: number;
  ropa_en_lavadero: PrendaEstadoHotel[];
  envios_recientes: Envio[];
  consumo_por_prenda: PrendaConsumoHotel[];
}
