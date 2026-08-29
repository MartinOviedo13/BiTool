import { Hotel, Item, Registro, BatchRegistroItem, ResumenGeneral, RankingHotel, ImportPreviewResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> || {}),
    },
  });

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
  getRegistros: (params?: { fecha_desde?: string; fecha_hasta?: string; hotel_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.hotel_id) searchParams.set('hotel_id', params.hotel_id.toString());
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
  deleteRegistro: (id: number) =>
    request<void>(`/registros/${id}`, {
      method: 'DELETE',
    }),

  // Analisis / BI
  getResumen: (params?: { fecha_desde?: string; fecha_hasta?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    const qs = searchParams.toString();
    return request<ResumenGeneral>(`/analisis/resumen${qs ? `?${qs}` : ''}`);
  },
  getRankingHoteles: (params?: { fecha_desde?: string; fecha_hasta?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.fecha_desde) searchParams.set('fecha_desde', params.fecha_desde);
    if (params?.fecha_hasta) searchParams.set('fecha_hasta', params.fecha_hasta);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const qs = searchParams.toString();
    return request<RankingHotel[]>(`/analisis/ranking-hoteles${qs ? `?${qs}` : ''}`);
  },
};
