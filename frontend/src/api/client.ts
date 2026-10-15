import {
  Hotel,
  Item,
  Registro,
  BatchRegistroItem,
  ResumenGeneral,
  RankingHotel,
  ImportPreviewResponse,
  ComparacionPeriodo,
  TendenciaRegistro,
  Alerta,
  Envio,
  CreateEnvioRequest,
  AuditoriaItem,
  PortalHotelDashboard,
  ConteoRequest,
  FichaHotel360,
  MetricasResumenResponse,
} from '../types';

const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
};
const API_BASE = getApiBase();
const TOKEN_KEY = 'lavadero_bi_token';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Inyectar JWT si existe
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> || {}),
    },
  });

  // Si el servidor rechaza el token, limpiar sesion local
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error('Sesion expirada. Por favor ingresa nuevamente.');
  }

  if (!res.ok) {
    let errorMsg = 'Error en la solicitud';
    try {
      const json = await res.json();
      errorMsg = json.error || errorMsg;
    } catch {
      errorMsg = res.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  checkHealth: () => request<{ status: string }>('/health'),

  // Hoteles
  getHoteles: () => request<Hotel[]>('/hoteles'),
  createHotel: (nombre: string) =>
    request<Hotel>('/hoteles', {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    }),
  updateHotel: (id: number, data: { nombre?: string; activo?: boolean }) =>
    request<Hotel>(`/hoteles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Items / Prendas
  getItems: () => request<Item[]>('/items'),
  createItem: (data: { nombre: string; precio_unitario?: number | null; se_factura?: boolean }) =>
    request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateItem: (id: number, data: { nombre?: string; precio_unitario?: number | null; se_factura?: boolean }) =>
    request<Item>(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Registros
  getRegistros: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number; item_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    const qs = searchParams.toString();
    return request<Registro[]>(`/registros${qs ? `?${qs}` : ''}`);
  },
  createRegistro: (data: { fecha: string; hotel_id: number; item_id: number; cantidad: number }) =>
    request<Registro>('/registros', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createRegistrosBatch: (items: BatchRegistroItem[]) =>
    request<{ success: boolean; count: number }>('/registros/batch', {
      method: 'POST',
      body: JSON.stringify(items),
    }),
importPreview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ImportPreviewResponse>('/registros/import/preview', {
      method: 'POST',
      body: formData,
    });
  },
  importExtractIA: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<ImportPreviewResponse>('/registros/import/ia-extract', {
      method: 'POST',
      body: formData,
    });
  },
  deleteRegistro: (id: number) =>
    request<void>(`/registros/${id}`, {
      method: 'DELETE',
    }),

  // Analisis / BI
  getResumen: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number; item_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    const qs = searchParams.toString();
    return request<ResumenGeneral>(`/analisis/resumen${qs ? `?${qs}` : ''}`);
  },
  obtenerMetricasResumen: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    const qs = searchParams.toString();
    return request<MetricasResumenResponse>(`/analisis/metricas-resumen${qs ? `?${qs}` : ''}`);
  },
  getRankingHoteles: (params?: { fecha_desde?: string; fecha_hasta?: string; limit?: number; item_id?: number; orden?: 'cantidad' | 'facturacion' }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    if (params?.orden) searchParams.set('orden', params.orden);
    const qs = searchParams.toString();
    return request<RankingHotel[]>(`/analisis/ranking-hoteles${qs ? `?${qs}` : ''}`);
  },
  getComparacion: (params?: { fecha_desde?: string; fecha_hasta?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    const qs = searchParams.toString();
    return request<ComparacionPeriodo>(`/analisis/comparar${qs ? `?${qs}` : ''}`);
  },
  getTendencia: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number; item_id?: number; periodo?: 'diario' | 'semanal' | 'mensual' }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    if (params?.periodo) searchParams.set('periodo', params.periodo);
    const qs = searchParams.toString();
    return request<TendenciaRegistro[]>(`/analisis/tendencia${qs ? `?${qs}` : ''}`);
  },

  // Alertas automÃ¡ticas
  getAlertas: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number; item_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    const qs = searchParams.toString();
    return request<Alerta[]>(`/alertas${qs ? `?${qs}` : ''}`);
  },

  // IA
  askIA: (mensaje: string, rango?: { fecha_desde?: string; fecha_hasta?: string }) =>
    request<{ respuesta: string }>('/ia/ask', {
      method: 'POST',
      body: JSON.stringify({ mensaje, ...rango }),
    }),

  // ExportaciÃ³n
  exportarCSV: async (params?: { fecha_desde?: string; fecha_hasta?: string; item_id?: number; orden?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.item_id) searchParams.set('item_id', params.item_id.toString());
    if (params?.orden) searchParams.set('orden', params.orden);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const qs = searchParams.toString();
    const res = await fetch(`${API_BASE}/analisis/exportar.csv${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('No se pudo generar el reporte');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Portal B2B (Envios / Remitos)
  createEnvio: (data: CreateEnvioRequest, hotelId?: number) => {
    const qs = hotelId ? `?hotel_id=${hotelId}` : '';
    return request<Envio>(`/api/envios${qs}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getEnvios: (params?: { fecha?: string; hotel_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha) searchParams.set('fecha', params.fecha);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    const qs = searchParams.toString();
    return request<Envio[]>(`/api/envios${qs ? `?${qs}` : ''}`);
  },
  getEnvioByQR: (codigoQR: string) =>
    request<Envio>(`/api/envios/qr/${encodeURIComponent(codigoQR)}`),
  getPortalDashboard: (hotelId?: number) => {
    const qs = hotelId ? `?hotel_id=${hotelId}` : '';
    return request<PortalHotelDashboard>(`/api/portal/dashboard${qs}`);
  },
  getAuditoria: (params?: { fecha?: string; hotel_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha) searchParams.set('fecha', params.fecha);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
    const qs = searchParams.toString();
    return request<AuditoriaItem[]>(`/api/auditoria${qs ? `?${qs}` : ''}`);
  },
  registrarConteo: (data: ConteoRequest) =>
    request<{ success: boolean }>('/api/auditoria/conteo', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getFichaHotel360: (hotelId: number, params?: { fecha_desde?: string; fecha_hasta?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    const qs = searchParams.toString();
    return request<FichaHotel360>(`/api/hoteles/${hotelId}/ficha360${qs ? `?${qs}` : ''}`);
  },
  exportarLiquidacionCSV: async (hotelId: number, params?: { fecha_desde?: string; fecha_hasta?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    const qs = searchParams.toString();
    const token = localStorage.getItem(TOKEN_KEY);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/api/hoteles/${hotelId}/liquidacion/exportar.csv${qs ? `?${qs}` : ''}`, {
      headers,
    });
    if (!res.ok) throw new Error('No se pudo generar la liquidación');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquidacion_hotel_${hotelId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};