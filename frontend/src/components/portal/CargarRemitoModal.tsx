import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Building2,
  Calendar,
  Hash,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api/client';
import { Hotel, Item, Envio } from '../../types';

interface CargarRemitoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (envio: Envio) => void;
  initialHotelId?: number;
  initialFecha?: string;
  remitoParaEditar?: Envio | null;
}

export const CargarRemitoModal: React.FC<CargarRemitoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialHotelId,
  initialFecha,
  remitoParaEditar,
}) => {
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(false);

  const [hotelId, setHotelId] = useState<number>(initialHotelId || 0);
  const [fecha, setFecha] = useState<string>(
    initialFecha || new Date().toISOString().split('T')[0]
  );
  const [numeroRemito, setNumeroRemito] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [filtroPrenda, setFiltroPrenda] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar lista de hoteles e ítems
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoadingCatalogos(true);
    setErrorMsg(null);

    Promise.all([api.getHoteles(), api.getItems()])
      .then(([hotelesData, itemsData]) => {
        if (!mounted) return;
        const activos = (Array.isArray(hotelesData) ? hotelesData : []).filter(
          (h) => h.activo !== false
        );
        setHoteles(activos);

        const itemsValidos = (Array.isArray(itemsData) ? itemsData : []).filter(
          (it) => it.activo !== false
        );
        setItems(itemsValidos);

        // Preselección de hotel
        if (remitoParaEditar) {
          setHotelId(remitoParaEditar.hotel_id);
          setFecha(
            typeof remitoParaEditar.fecha === 'string'
              ? remitoParaEditar.fecha.split('T')[0]
              : new Date(remitoParaEditar.fecha).toISOString().split('T')[0]
          );
          setNumeroRemito(remitoParaEditar.numero_remito || '');
          setObservaciones(remitoParaEditar.observaciones || '');

          const prefilled: Record<number, number> = {};
          if (remitoParaEditar.detalles) {
            remitoParaEditar.detalles.forEach((d) => {
              if (d.cantidad_declarada > 0) {
                prefilled[d.item_id] = d.cantidad_declarada;
              }
            });
          }
          setCantidades(prefilled);
        } else {
          if (initialHotelId && activos.some((h) => h.id === initialHotelId)) {
            setHotelId(initialHotelId);
          } else if (activos.length > 0 && !hotelId) {
            setHotelId(activos[0].id);
          }
          if (initialFecha) {
            setFecha(initialFecha);
          }
        }
      })
      .catch((err) => {
        console.error('Error cargando catálogos para remito manual:', err);
        setErrorMsg('Error al conectar con el servidor.');
      })
      .finally(() => {
        if (mounted) setLoadingCatalogos(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, remitoParaEditar, initialHotelId, initialFecha]);

  const handleCantidadChange = (itemId: number, valor: number) => {
    const val = Math.max(0, valor);
    setCantidades((prev) => ({
      ...prev,
      [itemId]: val,
    }));
  };

  const ajustarCantidad = (itemId: number, delta: number) => {
    setCantidades((prev) => {
      const actual = prev[itemId] || 0;
      const nuevo = Math.max(0, actual + delta);
      return {
        ...prev,
        [itemId]: nuevo,
      };
    });
  };

  const limpiarCantidades = () => {
    setCantidades({});
  };

  const totalPrendas = useMemo(() => {
    return Object.values(cantidades).reduce((acc, curr) => acc + (curr || 0), 0);
  }, [cantidades]);

  const itemsFiltrados = useMemo(() => {
    if (!filtroPrenda.trim()) return items;
    const q = filtroPrenda.toLowerCase();
    return items.filter((it) => it.nombre.toLowerCase().includes(q));
  }, [items, filtroPrenda]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hotelId) {
      setErrorMsg('Debes seleccionar un hotel.');
      return;
    }

    if (!fecha) {
      setErrorMsg('Debes indicar la fecha del remito.');
      return;
    }

    const numRemitoTrimmed = numeroRemito.trim();
    if (!numRemitoTrimmed) {
      setErrorMsg('Ingresa el número de remito en papel (ej: 0001-00045231).');
      return;
    }

    const detalles = Object.entries(cantidades)
      .map(([itemIdStr, cant]) => ({
        item_id: parseInt(itemIdStr, 10),
        cantidad_declarada: cant,
      }))
      .filter((d) => d.cantidad_declarada > 0);

    if (detalles.length === 0) {
      setErrorMsg('Debes ingresar al menos una prenda con cantidad mayor a cero.');
      return;
    }

    setSubmitting(true);
    try {
      const savedEnvio = await api.createEnvio(
        {
          hotel_id: hotelId,
          fecha,
          numero_remito: numRemitoTrimmed,
          observaciones: observaciones.trim() || undefined,
          detalles,
        },
        hotelId
      );

      onSuccess(savedEnvio);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error al guardar el remito manual.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-triton-navy border border-triton-slate/50 rounded-2xl max-w-4xl w-full max-h-[94dvh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Cabecera del Modal */}
        <div className="p-4 sm:p-5 border-b border-triton-slate/50 bg-triton-deep/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-triton-aqua/10 border border-triton-aqua/30 text-triton-aqua flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {remitoParaEditar
                  ? 'Modificar Remito en Papel'
                  : 'Cargar Remito en Papel del Hotel'}
              </h2>
              <p className="text-xs text-slate-400">
                Alimentará automáticamente la auditoría y control de diferencias contra el conteo de lavadero.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-triton-deep transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mensaje de Error */}
        {errorMsg && (
          <div className="bg-rose-950/80 border-b border-rose-800 text-rose-300 text-xs px-4 py-3 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Fila 1: Selección de Hotel, Fecha y Número de Remito */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Hotel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-triton-aqua" />
                <span>Hotel / Cliente *</span>
              </label>
              <select
                value={hotelId}
                onChange={(e) => setHotelId(parseInt(e.target.value, 10))}
                disabled={loadingCatalogos || !!remitoParaEditar}
                className="w-full px-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-triton-aqua disabled:opacity-60"
              >
                {hoteles.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-triton-aqua" />
                <span>Fecha del Remito *</span>
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-triton-aqua cursor-pointer"
                required
              />
            </div>

            {/* Número de Remito Papel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-triton-aqua flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                <span>N° Remito Papel *</span>
              </label>
              <input
                type="text"
                placeholder="Ej: 0001-00045231"
                value={numeroRemito}
                onChange={(e) => setNumeroRemito(e.target.value)}
                className="w-full px-3 py-2 bg-triton-deep border-2 border-triton-teal/60 focus:border-triton-aqua rounded-xl text-xs sm:text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Observaciones opcionales */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Observaciones del Remito Físico (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Remito en papel recibido con 4 bolsas precintadas por chofer turno mañana"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full px-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua"
            />
          </div>

          {/* Barra de Búsqueda y Limpieza de Prendas */}
          <div className="pt-2 border-t border-triton-slate/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Prendas Declaradas en el Remito
              </h3>
              <p className="text-[11px] text-slate-400">
                Ingresa las cantidades de cada prenda indicadas en el papel.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filtrar prenda..."
                  value={filtroPrenda}
                  onChange={(e) => setFiltroPrenda(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua"
                />
              </div>
              {totalPrendas > 0 && (
                <button
                  type="button"
                  onClick={limpiarCantidades}
                  className="px-2.5 py-1.5 bg-triton-deep hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 border border-triton-slate/50 shrink-0"
                  title="Poner todas las cantidades en cero"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
          </div>

          {/* Lista de Prendas para Carga Rápida */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {itemsFiltrados.map((it) => {
              const cant = cantidades[it.id] || 0;
              const hasVal = cant > 0;

              return (
                <div
                  key={it.id}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    hasVal
                      ? 'bg-triton-deep/90 border-triton-teal/70 shadow-sm'
                      : 'bg-triton-deep/40 border-triton-slate/40 hover:border-triton-slate/70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs sm:text-sm text-white block truncate">
                      {it.nombre}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-medium">
                      Sector: {it.sector || 'planchado'}
                    </span>
                  </div>

                  {/* Controles de Cantidad */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => ajustarCantidad(it.id, -10)}
                      className="w-7 h-7 rounded-lg bg-triton-navy hover:bg-triton-slate/80 text-slate-400 hover:text-white text-[10px] font-black border border-triton-slate/50 flex items-center justify-center"
                      title="-10"
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      onClick={() => ajustarCantidad(it.id, -1)}
                      className="w-7 h-7 rounded-lg bg-triton-navy hover:bg-triton-slate/80 text-slate-300 hover:text-white text-xs font-bold border border-triton-slate/50 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={cant === 0 ? '' : cant}
                      placeholder="0"
                      onChange={(e) =>
                        handleCantidadChange(
                          it.id,
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className={`w-14 h-7 text-center rounded-lg border text-xs font-bold focus:outline-none ${
                        hasVal
                          ? 'bg-triton-deep border-triton-aqua text-triton-aqua font-black'
                          : 'bg-triton-navy border-triton-slate/50 text-slate-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => ajustarCantidad(it.id, 1)}
                      className="w-7 h-7 rounded-lg bg-triton-teal/30 hover:bg-triton-teal text-triton-aqua hover:text-triton-navy text-xs font-bold border border-triton-teal/50 flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => ajustarCantidad(it.id, 10)}
                      className="w-7 h-7 rounded-lg bg-triton-teal/20 hover:bg-triton-teal/40 text-triton-aqua text-[10px] font-black border border-triton-teal/40 flex items-center justify-center"
                      title="+10"
                    >
                      +10
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </form>

        {/* Barra de Totales y Botón Guardar (Footer Fijo) */}
        <div className="p-3.5 sm:p-4 border-t border-triton-slate/50 bg-triton-deep/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-extrabold text-slate-400">
                Total Declarado:
              </span>
              <span className="text-lg font-black text-triton-aqua px-3 py-0.5 rounded-xl bg-triton-navy border border-triton-slate/50">
                {totalPrendas.toLocaleString()} u.
              </span>
            </div>
            {numeroRemito.trim() && (
              <span className="text-xs font-mono text-slate-300 bg-triton-navy px-2.5 py-1 rounded-lg border border-triton-slate/60">
                Remito: <strong className="text-white">{numeroRemito.trim()}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-triton-deep hover:bg-triton-slate/60 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-triton-slate/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || totalPrendas === 0 || !numeroRemito.trim()}
              className="px-5 py-2 bg-gradient-to-r from-triton-teal to-triton-aqua hover:from-triton-teal-light hover:to-triton-aqua-hover text-triton-navy disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black rounded-xl shadow-lg shadow-triton-aqua/20 flex items-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Guardando...' : 'Guardar Remito'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
