import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { AuditoriaRemitoResponse, Envio } from '../../types';
import {
  X,
  ClipboardCheck,
  Calendar,
  Building2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Save,
  Check,
  RefreshCw,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';

interface ModalAuditarRemitoProps {
  remitoId: number;
  remito?: Envio | null;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ItemEdicionState {
  itemId: number;
  itemNombre: string;
  declarada: number;
  limpias: number;
  relavado: number;
  rotas: number;
}

export const ModalAuditarRemito: React.FC<ModalAuditarRemitoProps> = ({
  remitoId,
  remito,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [fechaConteo, setFechaConteo] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dataRemito, setDataRemito] = useState<AuditoriaRemitoResponse | null>(null);
  const [itemsEdicion, setItemsEdicion] = useState<ItemEdicionState[]>([]);

  useEffect(() => {
    cargarAuditoria(fechaConteo);
  }, [remitoId]);

  const cargarAuditoria = async (fConteo: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.getAuditoriaRemito(remitoId, fConteo);
      setDataRemito(resp);
      if (resp.fecha_conteo) {
        setFechaConteo(resp.fecha_conteo);
      }

      // Inicializar el estado de edición con lo traído o con 0
      const itemsMapeados: ItemEdicionState[] = (resp.items || []).map((it) => ({
        itemId: it.item_id,
        itemNombre: it.item_nombre,
        declarada: it.cantidad_declarada,
        limpias: it.cantidad_limpia,
        relavado: it.cantidad_relavado,
        rotas: it.cantidad_rota,
      }));
      setItemsEdicion(itemsMapeados);
    } catch (err: unknown) {
      console.error('Error cargando auditoría de remito:', err);
      setError(err instanceof Error ? err.message : 'Error cargando datos de auditoría');
    } finally {
      setLoading(false);
    }
  };

  const handleCambioFecha = (nuevaFecha: string) => {
    setFechaConteo(nuevaFecha);
    cargarAuditoria(nuevaFecha);
  };

  const updateItemValue = (
    index: number,
    field: 'limpias' | 'relavado' | 'rotas',
    val: number
  ) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    setItemsEdicion((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: safeVal };
      return next;
    });
  };

  const adjustItemValue = (
    index: number,
    field: 'limpias' | 'relavado' | 'rotas',
    delta: number
  ) => {
    setItemsEdicion((prev) => {
      const next = [...prev];
      const actual = next[index][field] || 0;
      next[index] = { ...next[index], [field]: Math.max(0, actual + delta) };
      return next;
    });
  };

  // Botón rápido para marcar todas las prendas contadas limpias iguales a las declaradas
  const marcarTodasCoincidentes = () => {
    setItemsEdicion((prev) =>
      prev.map((it) => ({
        ...it,
        limpias: it.declarada,
        relavado: 0,
        rotas: 0,
      }))
    );
  };

  // Cálculos en vivo
  const totalDeclaradas = itemsEdicion.reduce((acc, it) => acc + it.declarada, 0);
  const totalLimpias = itemsEdicion.reduce((acc, it) => acc + it.limpias, 0);
  const totalRelavado = itemsEdicion.reduce((acc, it) => acc + it.relavado, 0);
  const totalRotas = itemsEdicion.reduce((acc, it) => acc + it.rotas, 0);
  const totalContado = totalLimpias + totalRelavado + totalRotas;
  const diferenciaTotal = totalContado - totalDeclaradas;

  const handleGuardar = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.guardarAuditoriaRemito(remitoId, {
        fecha_conteo: fechaConteo,
        conteo: itemsEdicion.map((it) => ({
          item_id: it.itemId,
          cantidad_limpia: it.limpias,
          cantidad_relavado: it.relavado,
          cantidad_rota: it.rotas,
        })),
      });

      setSuccessMsg('¡Auditoría y conteo guardados exitosamente!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      console.error('Error guardando auditoría:', err);
      setError(err instanceof Error ? err.message : 'Error al guardar la auditoría');
    } finally {
      setSaving(false);
    }
  };

  const hotelNombre = dataRemito?.hotel_nombre || remito?.hotel?.nombre || 'Hotel';
  const numeroRemito = dataRemito?.numero_remito || remito?.numero_remito || `#${remitoId}`;
  const fechaRemito = dataRemito?.fecha_remito || (remito?.fecha ? String(remito.fecha).split('T')[0] : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-triton-dark border border-triton-slate/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-triton-slate/70 bg-gradient-to-r from-triton-navy via-triton-dark to-triton-navy">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Auditoría de Remito {numeroRemito}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {hotelNombre}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Compara las prendas declaradas en el remito contra el conteo procesado en lavadero.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-triton-slate/40 transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra superior de contextualización y fechas */}
        <div className="px-4 py-3 sm:px-6 bg-triton-navy/40 border-b border-triton-slate/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Building2 className="w-4 h-4 text-brand-400" />
              <span className="font-semibold">Hotel:</span>
              <span className="text-white font-bold">{hotelNombre}</span>
            </div>
            {fechaRemito && (
              <div className="flex items-center gap-1.5 text-slate-300">
                <Calendar className="w-4 h-4 text-sky-400" />
                <span className="font-semibold">Fecha Remito:</span>
                <span className="text-white font-bold">{fechaRemito}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <Calendar className="w-4 h-4 text-brand-400" />
              Fecha Conteo Lavadero:
            </span>
            <input
              type="date"
              value={fechaConteo}
              onChange={(e) => handleCambioFecha(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-triton-dark border border-triton-slate text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Mensajes de Alerta / Éxito */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Cuerpo / Tabla de Auditoría */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
              <p className="text-sm font-medium">Cruzando remito con registros de lavadero...</p>
            </div>
          ) : itemsEdicion.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <p className="text-sm">Este remito no tiene prendas registradas.</p>
            </div>
          ) : (
            <>
              {/* Barra de acción rápida */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Prendas Declaradas vs Conteo de Lavadero ({itemsEdicion.length} tipos)
                </span>
                <button
                  type="button"
                  onClick={marcarTodasCoincidentes}
                  className="px-3 py-1.5 rounded-xl bg-brand-500/15 hover:bg-brand-500/30 text-brand-300 border border-brand-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Marcar todas iguales al remito</span>
                </button>
              </div>

              {/* Lista / Tabla de prendas */}
              <div className="border border-triton-slate/70 rounded-xl overflow-hidden bg-triton-navy/30">
                <div className="hidden sm:grid grid-cols-12 gap-2 p-3 bg-triton-navy/80 text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-triton-slate/70">
                  <div className="col-span-4">Prenda</div>
                  <div className="col-span-2 text-center">Remito (Decl.)</div>
                  <div className="col-span-3 text-center">Conteo Lavadero</div>
                  <div className="col-span-3 text-center">Diferencia</div>
                </div>

                <div className="divide-y divide-triton-slate/40">
                  {itemsEdicion.map((item, idx) => {
                    const contado = item.limpias + item.relavado + item.rotas;
                    const diff = contado - item.declarada;
                    const esOk = contado > 0 && diff === 0;
                    const esFaltante = contado < item.declarada;
                    const esSobrante = contado > item.declarada;
                    const esPendiente = contado === 0 && item.declarada > 0;

                    return (
                      <div
                        key={item.itemId}
                        className={`p-3 sm:py-2.5 transition-colors ${
                          esPendiente
                            ? 'bg-amber-500/5'
                            : esFaltante
                            ? 'bg-rose-500/5'
                            : esSobrante
                            ? 'bg-sky-500/5'
                            : 'hover:bg-triton-slate/20'
                        }`}
                      >
                        {/* Vista Desktop / Tablet */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-2 items-center">
                          {/* Nombre de la prenda */}
                          <div className="sm:col-span-4 flex items-center justify-between sm:justify-start gap-2">
                            <span className="text-sm font-bold text-white">
                              {item.itemNombre}
                            </span>
                            {/* Badge en móvil de cantidad declarada */}
                            <span className="sm:hidden px-2 py-0.5 rounded-md bg-triton-dark border border-triton-slate text-xs font-extrabold text-slate-200">
                              Decl: {item.declarada}
                            </span>
                          </div>

                          {/* Cantidad Declarada en Remito */}
                          <div className="hidden sm:flex sm:col-span-2 justify-center">
                            <span className="px-3 py-1 rounded-lg bg-triton-dark/80 border border-triton-slate/80 text-sm font-black text-white font-mono">
                              {item.declarada}
                            </span>
                          </div>

                          {/* Controles de Conteo (Limpias, Relavado, Rotas) */}
                          <div className="sm:col-span-3 flex items-center justify-center gap-1.5">
                            {/* Input Limpias con +/- */}
                            <div className="flex items-center border border-triton-slate/80 rounded-lg bg-triton-dark overflow-hidden">
                              <button
                                type="button"
                                onClick={() => adjustItemValue(idx, 'limpias', -1)}
                                className="px-1.5 py-1 text-slate-400 hover:text-white hover:bg-triton-slate/40 transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={item.limpias}
                                onChange={(e) =>
                                  updateItemValue(idx, 'limpias', parseInt(e.target.value, 10))
                                }
                                className="w-14 text-center py-1 bg-transparent text-sm font-bold text-white font-mono focus:outline-none"
                                title="Prendas limpias contadas"
                              />
                              <button
                                type="button"
                                onClick={() => adjustItemValue(idx, 'limpias', 1)}
                                className="px-1.5 py-1 text-slate-400 hover:text-white hover:bg-triton-slate/40 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Desglose menor relavado/rotas si aplica */}
                            {(item.relavado > 0 || item.rotas > 0) && (
                              <div className="text-[10px] font-mono text-slate-400 space-y-0.5">
                                {item.relavado > 0 && (
                                  <div className="text-amber-400">+{item.relavado} rel</div>
                                )}
                                {item.rotas > 0 && (
                                  <div className="text-rose-400">+{item.rotas} rot</div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Estado y Diferencia */}
                          <div className="sm:col-span-3 flex items-center justify-between sm:justify-center gap-2">
                            <span className="sm:hidden text-xs text-slate-400 font-semibold">
                              Diferencia:
                            </span>

                            {esOk && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Coincide ({contado})</span>
                              </span>
                            )}

                            {esFaltante && !esPendiente && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Falta {Math.abs(diff)} ({contado}/{item.declarada})</span>
                              </span>
                            )}

                            {esSobrante && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Sobra +{diff} ({contado}/{item.declarada})</span>
                              </span>
                            )}

                            {esPendiente && (
                              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <AlertOctagon className="w-3.5 h-3.5" />
                                <span>Sin conteo (0/{item.declarada})</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Resumen al pie y Botones */}
        <div className="p-4 sm:p-5 border-t border-triton-slate/70 bg-triton-navy/90 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-semibold">
            <div>
              <span className="text-slate-400">Total Remito: </span>
              <span className="font-extrabold text-white text-base">{totalDeclaradas}</span>
            </div>
            <div>
              <span className="text-slate-400">Total Lavadero: </span>
              <span className="font-extrabold text-white text-base">{totalContado}</span>
            </div>
            <div>
              <span className="text-slate-400">Diferencia: </span>
              <span
                className={`font-black text-base ${
                  diferenciaTotal === 0 && totalContado > 0
                    ? 'text-emerald-400'
                    : diferenciaTotal < 0
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {diferenciaTotal > 0 ? `+${diferenciaTotal}` : diferenciaTotal}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-triton-slate/40 hover:bg-triton-slate/70 text-slate-300 text-xs font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={saving || loading || itemsEdicion.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-500 hover:to-emerald-500 text-white text-xs font-black shadow-lg shadow-brand-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Auditoría</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
