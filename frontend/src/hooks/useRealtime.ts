import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { soundPlayer, mostrarNotificacionNativa } from '../utils/sound';

export interface EventoRealtime {
  tipo: string;
  hotel_id: number;
  titulo: string;
  mensaje: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export function useRealtime(onEvent?: (evt: EventoRealtime) => void) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('lavadero_bi_token') || localStorage.getItem('token');
    const apiBase =
      import.meta.env.VITE_API_URL ||
      (typeof window !== 'undefined' && window.location.hostname
        ? `http://${window.location.hostname}:8000`
        : '');

    // Conectar a SSE
    const url = `${apiBase}/api/realtime/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (event) => {
      try {
        const parsed: EventoRealtime = JSON.parse(event.data);

        // Despachar evento para componentes escuchando
        if (onEvent) {
          onEvent(parsed);
        }

        // Si es repartidor o admin y el evento es un remito listo para retiro:
        if (parsed.tipo === 'REMITO_LISTO_RETIRO') {
          if (user.rol === 'repartidor' || user.rol === 'admin') {
            soundPlayer.playListoRetiro();
            mostrarNotificacionNativa(parsed.titulo, parsed.mensaje, `retiro-${parsed.hotel_id}`);
          }
        }

        // Si es repartidor o admin y el evento es retiro confirmado:
        if (parsed.tipo === 'REMITO_RETIRADO') {
          if (user.rol === 'admin' || user.rol === 'operario') {
            soundPlayer.playListoRetiro();
            mostrarNotificacionNativa(parsed.titulo, parsed.mensaje, `retirado-${parsed.hotel_id}`);
          }
        }

        // Emitir un evento global en window para que cualquier vista se actualice
        window.dispatchEvent(new CustomEvent('triton:realtime', { detail: parsed }));
      } catch (err) {
        console.error('Error parseando evento realtime:', err);
      }
    };

    eventSource.onerror = () => {
      // EventSource reconecta automáticamente si la conexión se interrumpe
    };

    return () => {
      eventSource.close();
    };
  }, [user, onEvent]);
}

