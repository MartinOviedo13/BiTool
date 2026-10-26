import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { RetiroPendienteDTO, Hotel } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Volume2,
  Bell,
} from 'lucide-react';
import { soundPlayer, solicitarPermisoNotificaciones } from '../../utils/sound';
import { useRealtime } from '../../hooks/useRealtime';

interface RetirosViewProps {
  fechaFiltro: string;
  onFechaChange: (nuevaFecha: string) => void;
}

export const RetirosTab: React.FC<RetirosViewProps> = ({ fechaFiltro, onFechaChange }) => {
  const [retiros, setRetiros] = useState<RetiroPendienteDTO[]>([]);
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroHotel] = useState<number | 'all'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Modal para confirmar retiro
  const [modalRetiro, setModalRetiro] = useState<RetiroPendienteDTO | null>(null);
  const [observacion, setObservacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // Escuchar eventos SSE instantáneos: cuando un hotel remite, recargar lista sin tocar nada
  useRealtime((evt) => {
    if (evt.tipo === 'REMITO_LISTO_RETIRO' || evt.tipo === 'REMITO_RETIRADO') {
      void cargarRetiros();
    }
  });

  const activarSonidoYNotifs = async () => {
    soundPlayer.unlockAudio();
    soundPlayer.playListoRetiro();
    const perm = await solicitarPermisoNotificaciones();
    setNotifPerm(perm);
  };

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarRetiros();
  }, [fechaFiltro]);

  const cargarCatalogos = async () => {
    try {
      const data = await api.getHoteles();
      setHoteles(data);
    } catch (err) {
      console.error('Error cargando catalogo hoteles:', err);
    }
  };

  const cargarRetiros = async () => {
    setLoading(true);
    try {
      const data = await api.getRetirosPendientes({ fecha: fechaFiltro || undefined });
      setRetiros(data);
    } catch (err) {
      console.error('Error cargando retiros pendientes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar = async () => {
    if (!modalRetiro) return;
    setConfirmando(true);
    try {
      await api.confirmarRetiroEnvio(modalRetiro.envio_id, {
        observacion: observacion.trim() || undefined,
      });
      await cargarRetiros();
      setModalRetiro(null);
      setObservacion('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al confirmar retiro');
    } finally {
      setConfirmando(false);
    }
  };

  // Hoteles que cargaron remito vs los que aún no cargaron hoy
  const retirosFiltrados = retiros.filter((r) => {
    if (filtroHotel !== 'all' && r.hotel_id !== filtroHotel) return false;
    return true;
  });

  const listosParaRetiro = retirosFiltrados.filter((r) => r.estado === 'listo_para_retiro');
  const yaRetirados = retirosFiltrados.filter((r) => r.estado === 'retirado');

  // Hoteles sin remito aún para la fecha
  const hotelesConRemitoIds = new Set(retiros.map((r) => r.hotel_id));
  const hotelesSinRemito = hoteles.filter((h) => !hotelesConRemitoIds.has(h.id));

  const totalPrendasListas = listosParaRetiro.reduce((acc, r) => acc + r.total_prendas, 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner para activar sonido y notificaciones en celular si aún no dio permiso */}
      {notifPerm !== 'granted' && (
        <div className="bg-triton-deep/90 border border-triton-teal/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-600/30 text-brand-300 border border-brand-500/40 shrink-0">
              <Bell className="w-5 h-5 text-triton-aqua" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white">
                ¿Activar alertas sonoras y notificaciones en tu celular?
              </h4>
              <p className="text-[11px] text-slate-300">
                Tu teléfono sonará con un timbre y vibrará al instante en que un hotel confirme un remito listo para retirar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={activarSonidoYNotifs}
            className="w-full sm:w-auto px-4 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy text-xs font-black rounded-xl shadow-md shadow-triton-aqua/20 flex items-center justify-center gap-2 transition-all shrink-0"
          >
            <Volume2 className="w-4 h-4" />
            <span>Activar Alertas</span>
          </button>
        </div>
      )}

      {/* 1. KPIs del Circuito de Retiros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-triton-navy/90 p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Listos para Retirar
            </span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">{listosParaRetiro.length}</p>
          <p className="text-[10px] text-emerald-300 font-medium">
            {formatNumber(totalPrendasListas)} prendas declaradas
          </p>
        </div>

        <div className="bg-triton-navy/90 p-4 rounded-xl border border-blue-500/40 bg-blue-950/20 shadow-lg">
          <div className="flex items-center justify-between text-blue-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Ya Retirados
            </span>
            <Truck className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">{yaRetirados.length}</p>
          <p className="text-[10px] text-blue-300 font-medium">En viaje o en planta</p>
        </div>

        <div className="bg-triton-navy/90 p-4 rounded-xl border border-slate-700 bg-slate-900/40 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Sin Remito Aún
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-300">{hotelesSinRemito.length}</p>
          <p className="text-[10px] text-slate-400 font-medium">No pasar todavía</p>
        </div>

        <div className="bg-triton-navy/90 p-4 rounded-xl border border-triton-slate/50 shadow-lg flex flex-col justify-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Fecha de Recolección
          </span>
          <div className="flex items-center gap-1.5 bg-triton-deep px-2.5 py-1 rounded-lg border border-triton-slate/50">
            <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => onFechaChange(e.target.value)}
              className="bg-transparent text-xs text-white font-medium focus:outline-none w-full"
            />
          </div>
        </div>
      </div>

      {/* 2. Sección: Hoteles Listos para Retirar (Semaforo Verde) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
            <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
              🟢 Paradas Disponibles para Retiro ({listosParaRetiro.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            El hotel ya remitió y confirmó las bolsas
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-triton-navy/60 rounded-2xl border border-triton-slate/50">
            Cargando paradas de retiro...
          </div>
        ) : listosParaRetiro.length === 0 ? (
          <div className="p-8 text-center bg-triton-navy/40 rounded-2xl border border-triton-slate/50 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">
              No hay retiros pendientes con remito listo para esta fecha.
            </p>
            <p className="text-[11px] text-slate-500">
              Los hoteles aparecerán aquí automáticamente en cuanto confirmen su remito digital.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {listosParaRetiro.map((r) => {
              const isExpanded = expandedId === r.envio_id;
              const hora = new Date(r.creado_en).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={r.envio_id}
                  className="bg-triton-navy border-2 border-emerald-500/50 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3 hover:border-emerald-400 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-white">{r.hotel_nombre}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                            Listo
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Remito: <strong className="text-blue-300 font-mono">{r.codigo_qr}</strong> &bull; Avisó a las {hora} hs
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-lg font-black text-emerald-400">
                          {formatNumber(r.total_prendas)}
                        </span>
                        <p className="text-[10px] text-slate-400 font-medium">prendas declaradas</p>
                      </div>
                    </div>

                    {/* Desglose rápido de prendas */}
                    <div className="mt-3 pt-3 border-t border-triton-slate/50/80">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.envio_id)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        <span>{isExpanded ? 'Ocultar prendas' : 'Ver detalle de prendas'} ({r.detalles.length})</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-triton-deep p-2.5 rounded-xl border border-triton-slate/50 text-[11px]">
                          {r.detalles.map((d, idx) => (
                            <div key={idx} className="flex justify-between text-slate-300">
                              <span className="truncate pr-2">{d.item_nombre}</span>
                              <strong className="text-white shrink-0">{d.cantidad_declarada}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botón de Acción Principal para el Repartidor */}
                  <button
                    type="button"
                    onClick={() => {
                      setModalRetiro(r);
                      setObservacion('');
                    }}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>Marcar como Retirado (En Camino)</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Sección: Retirados Hoy */}
      {yaRetirados.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>Retirados en Tránsito a Planta ({yaRetirados.length})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {yaRetirados.map((r) => {
              const horaRetiro = r.retirado_en
                ? new Date(r.retirado_en).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '--:--';

              return (
                <div
                  key={r.envio_id}
                  className="bg-triton-navy/70 border border-triton-slate/50 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white">{r.hotel_nombre}</p>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                        Retirado a las {horaRetiro} hs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {r.codigo_qr} &bull; {formatNumber(r.total_prendas)} prendas
                      {r.retirado_por_username ? ` por ${r.retirado_por_username}` : ''}
                    </p>
                    {r.observacion_retiro && (
                      <p className="text-[10px] text-slate-300 italic mt-1 bg-triton-deep px-2 py-0.5 rounded border border-triton-slate/50">
                        &quot;{r.observacion_retiro}&quot;
                      </p>
                    )}
                  </div>
                  <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Sección: Hoteles Sin Remito (Informativo para no desviarse) */}
      <div className="bg-triton-navy/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-slate-400">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Hoteles sin remito generado hoy ({hotelesSinRemito.length})
          </h3>
        </div>
        <p className="text-[11px] text-slate-400">
          Estos hoteles aún están armando las bolsas o no remitieron. No pasar hasta que se pongan en verde para evitar demoras en la ruta:
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {hotelesSinRemito.map((h) => (
            <span
              key={h.id}
              className="px-2.5 py-1 rounded-lg bg-triton-deep text-slate-400 border border-triton-slate/50 text-[11px] font-medium"
            >
              {h.nombre}
            </span>
          ))}
        </div>
      </div>

      {/* Modal de Confirmación de Retiro */}
      {modalRetiro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-triton-navy border border-triton-slate/50 rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-triton-slate/50">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Confirmar Retiro en Hotel</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalRetiro(null)}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                &times;
              </button>
            </div>

            <div className="bg-triton-deep p-3.5 rounded-xl border border-triton-slate/50 space-y-1.5 text-xs">
              <p className="text-white font-bold text-sm">{modalRetiro.hotel_nombre}</p>
              <p className="text-slate-300">
                Remito: <strong className="text-blue-300 font-mono">{modalRetiro.codigo_qr}</strong>
              </p>
              <p className="text-slate-300">
                Total prendas declaradas: <strong className="text-emerald-400">{formatNumber(modalRetiro.total_prendas)}</strong>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase">
                Observación o Cantidad de Bolsas (Opcional)
              </label>
              <input
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Ej: 3 bolsas cerradas / Precinto #12"
                className="w-full px-3 py-2.5 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalRetiro(null)}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-triton-deep/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirmando}
                onClick={handleConfirmar}
                className="flex-1 sm:flex-initial justify-center px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] text-triton-navy font-black shadow-md shadow-triton-aqua/25 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{confirmando ? 'Registrando...' : 'Confirmar Retiro'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
