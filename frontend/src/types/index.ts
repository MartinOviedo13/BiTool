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

export interface PrendaEstrella {
  item_id: number;
  nombre: string;
  cantidad: number;
  facturacion: number;
  porcentaje: number;
}

export interface MetricasResumenResponse {
  fecha_desde: string | null;
  fecha_hasta: string | null;
  facturacion_total: number;
  delta_facturacion: number | null;
  ticket_promedio: number;
  delta_ticket_promedio: number | null;
  total_remitos: number;
  remitos_activos: number;
  tiempo_medio_horas: number;
  prendas_totales: number;
  delta_prendas_totales: number | null;
  prendas_estrella: PrendaEstrella[];
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

export type UserRole = 'admin' | 'operario' | 'cliente' | 'repartidor';

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
  estado?: 'listo_para_retiro' | 'retirado' | 'en_planta' | 'entregado' | string;
  retirado_por_id?: number | null;
  retirado_por_username?: string | null;
  retirado_en?: string | null;
  observacion_retiro?: string | null;
  creado_en: string;
  detalles?: EnvioDetalle[];
}

export interface RetiroItemDTO {
  item_nombre: string;
  cantidad_declarada: number;
}

export interface RetiroPendienteDTO {
  envio_id: number;
  hotel_id: number;
  hotel_nombre: string;
  fecha: string;
  codigo_qr: string;
  estado: 'listo_para_retiro' | 'retirado' | string;
  total_prendas: number;
  creado_en: string;
  retirado_en?: string | null;
  retirado_por_username?: string | null;
  observacion_retiro?: string | null;
  detalles: RetiroItemDTO[];
}

export interface ConfirmarRetiroRequest {
  observacion?: string;
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

export interface ItemConsumoDetalle {
  item_id: number;
  item_nombre: string;
  precio_unitario: number | null;
  se_factura: boolean;
  cantidad_facturable: number;
  cantidad_relavado: number;
  cantidad_rota: number;
  subtotal: number;
}

export interface EvolucionMesHotel {
  mes: string;
  cantidad: number;
  facturacion: number;
  relavado: number;
}

export interface FichaHotel360 {
  hotel_id: number;
  hotel_nombre: string;
  activo: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  total_prendas: number;
  prendas_facturables: number;
  prendas_relavadas: number;
  prendas_rotas: number;
  facturacion_estimada: number;
  tasa_relavado: number;
  tasa_rotura: number;
  tasa_relavado_promedio_total: number;
  consumo_prendas: ItemConsumoDetalle[];
  total_envios: number;
  total_prendas_declaradas: number;
  total_prendas_auditadas: number;
  diferencia_total: number;
  evolucion_mensual: EvolucionMesHotel[];
  ropa_en_lavadero: PrendaEstadoHotel[];
  envios_recientes: Envio[];
}

export type Ficha360PresetPeriod = 'month' | 'last_month' | 'quarter' | 'year' | 'custom';

export type MatrixDraftGrid = Record<string, Record<string, number>>;

export interface ImportErrorItem {
  fila: number;
  columna?: string;
  mensaje: string;
}

export interface ImportJob {
  id: number;
  nombre_archivo: string;
  estado: 'procesando' | 'completado' | 'error';
  filas_totales: number;
  filas_con_error: number;
  errores?: ImportErrorItem[];
  creado_en: string;
}

export interface IAAskResponse {
  respuesta: string;
  tools_usadas?: string[];
}

export type EstadoConciliacion =
  | 'pendiente'
  | 'validado_ok'
  | 'validado_con_diferencia'
  | 'entregado';

export interface MuestraItemConciliacion {
  item_id: number;
  item_nombre: string;
  cant_remito: number;
  cant_procesada_prendas: number;
  cant_procesada_kilos: number;
  diferencia: number;
}

export interface DespachoConciliacion {
  id: number;
  hotel_id: number;
  hotel_nombre: string;
  remito_id: number | null;
  codigo_qr?: string | null;
  fecha: string;
  estado: EstadoConciliacion;
  total_remito_prendas: number;
  total_procesado_prendas: number;
  total_procesado_kilos: number;
  diferencia_prendas: number;
  muestra_procesado: MuestraItemConciliacion[];
  validado_por_id: number | null;
  validado_por_username?: string | null;
  validado_en: string | null;
  entregado_por_id: number | null;
  entregado_por_username?: string | null;
  entregado_en: string | null;
  observacion_entrega: string | null;
}

export interface ValidarConciliacionRequest {
  hotel_id: number;
  fecha: string;
}

export interface EntregarDespachoRequest {
  observacion_entrega?: string;
}

export interface NotificacionOperativa {
  id: number;
  rol_destino: 'repartidor' | 'admin' | string;
  hotel_id: number;
  hotel_nombre: string;
  despacho_id?: number | null;
  tipo: 'ALERTA_DIFERENCIA_REMITO' | 'CARGA_LISTA_REPARTO' | 'PEDIDO_ENTREGADO' | string;
  severidad: 'info' | 'warning' | 'success';
  titulo: string;
  mensaje: string;
  muestra_datos: MuestraItemConciliacion[];
  leida: boolean;
  leida_en: string | null;
  created_at: string;
}


