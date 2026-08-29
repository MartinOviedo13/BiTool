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
