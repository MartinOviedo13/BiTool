import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import { Hotel, Item, Registro, BatchRegistroItem } from '../../types';
import { getTodayDateString, formatDateDisplay } from '../../utils/date';
import { formatNumber } from '../../utils/formatters';

export const MatrixEntryView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // Matrix data structure: grid[hotelId][itemId] = quantity
  const [grid, setGrid] = useState<Record<number, Record<number, number>>>({});
  // Registros preexistentes de la fecha en base de datos
  const [existingRegistros, setExistingRegistros] = useState<Registro[]>([]);
  const savedGridRef = useRef<Record<number, Record<number, number>>>({});

  // Estados de carga y guardado
  const [loading, setLoading] = useState<boolean>(true);
  const [savingBulk, setSavingBulk] = useState<boolean>(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  const autoSaveTimerRef = useRef<any>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const getDraftKey = (date: string) => `triton_matrix_draft_${date}`;

  // Cargar catálogos y datos de la fecha
  const loadMatrix = async (date: string) => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [hotelesData, itemsData, registrosData] = await Promise.all([
        api.getHoteles(),
        api.getItems(),
        api.getRegistros({ fecha_desde: date, fecha_hasta: date }),
      ]);

      const activeHotels = hotelesData.filter((h) => h.activo);
      setHoteles(activeHotels);
      setItems(itemsData);

      // 1. Construir grilla base vacía
      const baseGrid: Record<number, Record<number, number>> = {};
      const savedGrid: Record<number, Record<number, number>> = {};

      activeHotels.forEach((h) => {
        baseGrid[h.id] = {};
        savedGrid[h.id] = {};
        itemsData.forEach((i) => {
          baseGrid[h.id][i.id] = 0;
          savedGrid[h.id][i.id] = 0;
        });
      });

      // 2. Poblar con registros guardados en PostgreSQL
      registrosData.forEach((r) => {
        if (baseGrid[r.hotel_id]) {
          baseGrid[r.hotel_id][r.item_id] = r.cantidad;
          savedGrid[r.hotel_id][r.item_id] = r.cantidad;
        }
      });

      savedGridRef.current = savedGrid;

      // 3. Revisar si hay un borrador local no guardado para no perder cambios al cambiar de pestaña
      const rawDraft = localStorage.getItem(getDraftKey(date));
      if (rawDraft) {
        try {
          const draftGrid = JSON.parse(rawDraft);
          // Mezclar el borrador preservando los valores
          Object.entries(draftGrid).forEach(([hId, row]: [string, any]) => {
            const hNum = parseInt(hId, 10);
            if (baseGrid[hNum]) {
              Object.entries(row).forEach(([iId, qty]: [string, any]) => {
                const iNum = parseInt(iId, 10);
                if (typeof qty === 'number') {
                  baseGrid[hNum][iNum] = qty;
                }
              });
            }
          });
        } catch {
          /* ignore error */
        }
      }

      setGrid(baseGrid);
      setExistingRegistros(registrosData);
    } catch (err) {
      console.error('Error cargando matriz:', err);
      setStatusMessage({ type: 'error', text: 'No se pudieron cargar los datos de la fecha.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatrix(selectedDate);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [selectedDate]);

  // Edición inmediata en memoria y persistencia en borrador local
  const handleCellChange = (hotelId: number, itemId: number, valStr: string) => {
    const parsed = parseInt(valStr, 10);
    const qty = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    setGrid((prev) => {
      const next = {
        ...prev,
        [hotelId]: {
          ...(prev[hotelId] || {}),
          [itemId]: qty,
        },
      };
      // Respaldo en memoria local para que jamás se reinicie al cambiar de pestaña
      localStorage.setItem(getDraftKey(selectedDate), JSON.stringify(next));
      return next;
    });
  };

  // Guardado automático por celda al desenfocar o pulsar Enter/Tab
  const handleCellBlur = async (hotelId: number, itemId: number) => {
    const currentQty = grid[hotelId]?.[itemId] ?? 0;
    const savedQty = savedGridRef.current[hotelId]?.[itemId] ?? 0;

    // Si el valor no cambió respecto a lo que ya está en la base de datos, evitar petición
    if (currentQty === savedQty) {
      return;
    }

    const cellKey = `${hotelId}-${itemId}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));
    setAutoSaveStatus('saving');

    try {
      // 1 petición individual súper liviana (UPSERT en PostgreSQL en 1-2 ms)
      await api.createRegistrosBatch([
        {
          fecha: selectedDate,
          hotel_id: hotelId,
          item_id: itemId,
          cantidad: currentQty,
        },
      ]);

      // Actualizar valor guardado
      if (!savedGridRef.current[hotelId]) {
        savedGridRef.current[hotelId] = {};
      }
      savedGridRef.current[hotelId][itemId] = currentQty;

      // Destello sutil en verde confirmando persistencia
      setSavedCells((prev) => new Set(prev).add(cellKey));
      setTimeout(() => {
        setSavedCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }, 1200);

      setAutoSaveStatus('saved');
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        setAutoSaveStatus('idle');
      }, 2500);
    } catch (err: any) {
      console.error('Error en guardado automático:', err);
      setAutoSaveStatus('error');
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  // Guardado masivo manual (fallback / confirmación total)
  const handleSaveBulk = async () => {
    setSavingBulk(true);
    setStatusMessage(null);
    try {
      const batchItems: BatchRegistroItem[] = [];

      Object.entries(grid).forEach(([hotelIdStr, row]) => {
        const hotelId = parseInt(hotelIdStr, 10);
        Object.entries(row).forEach(([itemIdStr, qty]) => {
          const itemId = parseInt(itemIdStr, 10);
          if (qty > 0) {
            batchItems.push({
              fecha: selectedDate,
              hotel_id: hotelId,
              item_id: itemId,
              cantidad: qty,
            });
          }
        });
      });

      // Incluir eliminaciones para celdas que quedaron en 0
      existingRegistros.forEach((r) => {
        const qty = grid[r.hotel_id]?.[r.item_id] ?? 0;
        if (qty === 0) {
          batchItems.push({
            fecha: selectedDate,
            hotel_id: r.hotel_id,
            item_id: r.item_id,
            cantidad: 0,
          });
        }
      });

      if (batchItems.length === 0) {
        setStatusMessage({ type: 'error', text: 'No hay cantidades ingresadas para guardar.' });
        setSavingBulk(false);
        return;
      }

      const res = await api.createRegistrosBatch(batchItems);
      // Limpiar borrador local ya sincronizado
      localStorage.removeItem(getDraftKey(selectedDate));
      await loadMatrix(selectedDate);

      setStatusMessage({
        type: 'success',
        text: `¡Planilla sincronizada con éxito! ${res.count} valores consolidados para el día ${formatDateDisplay(selectedDate)}.`,
      });
    } catch (err: any) {
      console.error('Error guardando planilla:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Error al guardar la planilla.' });
    } finally {
      setSavingBulk(false);
    }
  };

  // Totales de fila (por hotel)
  const getRowTotal = (hotelId: number) => {
    const row = grid[hotelId];
    if (!row) return 0;
    return Object.values(row).reduce((sum, val) => sum + (val || 0), 0);
  };

  // Totales de columna (por prenda)
  const getColumnTotal = (itemId: number) => {
    return Object.values(grid).reduce((sum, row) => sum + (row[itemId] || 0), 0);
  };

  // Total general
  const grandTotal = useMemo(() => {
    return Object.values(grid).reduce((total, row) => {
      return total + Object.values(row).reduce((rowSum, val) => rowSum + (val || 0), 0);
    }, 0);
  }, [grid]);

  const filteredHoteles = useMemo(() => {
    if (!searchTerm) return hoteles;
    return hoteles.filter((h) => h.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [hoteles, searchTerm]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top Header & Controles de Operación */}
      <div className="bg-[#0b1a33]/90 p-5 rounded-2xl border border-[#1e3659] shadow-xl shadow-black/20 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Layers className="h-6 w-6 text-brand-400" />
            <h2 className="text-xl font-black text-white tracking-tight">Carga Diaria de Planilla</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Matriz operativa digital: Hoteles en filas $\times$ Prendas en columnas
          </p>
        </div>

        {/* Indicador de Auto-Save & Selector de Fecha */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Indicador de Estado del Guardado Automático */}
          <div className="mr-1">
            {autoSaveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-950 text-brand-300 border border-brand-700/60 text-xs font-semibold animate-pulse shadow-sm">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-400" />
                <span>Guardando celda...</span>
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-xs font-bold shadow-sm transition-all">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>✓ Guardado automático</span>
              </span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-950/80 text-rose-300 border border-rose-700/60 text-xs font-bold shadow-sm">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Error de guardado</span>
              </span>
            )}
            {autoSaveStatus === 'idle' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#071326] text-slate-400 border border-[#1e3659] text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Sincronizado en vivo</span>
              </span>
            )}
          </div>

          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-[#071326] px-3 py-1.5 rounded-xl border border-[#1e3659]">
            <Calendar className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-bold text-slate-300">Fecha:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-bold cursor-pointer"
            />
          </div>

          {/* Buscador de Hotel */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar hotel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#071326] border border-[#1e3659] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 w-44"
            />
          </div>

          {/* Botón manual de Sincronización Total (Fallback) */}
          <button
            onClick={handleSaveBulk}
            disabled={savingBulk || loading}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#132747] hover:bg-[#1e3659] border border-[#1e3659] text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            title="Consolidar y verificar toda la planilla"
          >
            <Save className={`h-3.5 w-3.5 ${savingBulk ? 'animate-spin' : ''}`} />
            <span>{savingBulk ? 'Sincronizando...' : 'Sincronizar Todo'}</span>
          </button>
        </div>
      </div>

      {/* Mensaje de Alerta Manual */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-medium border flex items-center gap-2.5 animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Tabla Matriz */}
      <div className="bg-[#0b1a33]/90 rounded-2xl border border-[#1e3659] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto max-h-[620px] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#071326] sticky top-0 z-20 shadow-md">
              <tr className="border-b border-[#1e3659] text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 sticky left-0 z-30 bg-[#071326] min-w-[180px] font-bold text-white border-r border-[#1e3659]">
                  Hotel / Cliente
                </th>
                {items.map((item) => (
                  <th
                    key={item.id}
                    className={`px-3 py-3 text-center min-w-[85px] font-bold ${
                      !item.se_factura ? 'text-amber-400 bg-amber-950/30' : 'text-slate-300'
                    }`}
                  >
                    <div>{item.nombre}</div>
                    {!item.se_factura && <span className="text-[9px] lowercase font-normal">(relav)</span>}
                  </th>
                ))}
                <th className="px-4 py-3 text-right sticky right-0 z-30 bg-[#071326] min-w-[95px] font-bold text-cyan-400 border-l border-[#1e3659]">
                  Total Fila
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1e3659]/60 bg-[#0b1a33]/40">
              {loading ? (
                <tr>
                  <td colSpan={items.length + 2} className="px-4 py-16 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
                    <p className="text-xs font-semibold">Cargando matriz operativa en tiempo real...</p>
                  </td>
                </tr>
              ) : (
                filteredHoteles.map((hotel) => {
                  const rowTotal = getRowTotal(hotel.id);
                  return (
                    <tr
                      key={hotel.id}
                      className={`hover:bg-[#132747]/40 transition-colors ${rowTotal > 0 ? 'bg-brand-950/15' : ''}`}
                    >
                      {/* Nombre del Hotel (Sticky izquierda) */}
                      <td className="px-4 py-2 sticky left-0 z-10 bg-[#0b1a33] font-bold text-slate-200 border-r border-[#1e3659] truncate">
                        {hotel.nombre}
                      </td>

                      {/* Inputs de Cantidad con Auto-Save on Blur */}
                      {items.map((item) => {
                        const cellKey = `${hotel.id}-${item.id}`;
                        const qty = grid[hotel.id]?.[item.id] ?? 0;
                        const isSavingThis = savingCells.has(cellKey);
                        const isSavedThis = savedCells.has(cellKey);

                        return (
                          <td key={item.id} className="p-1 text-center border-r border-[#1e3659]/40">
                            <input
                              type="number"
                              min="0"
                              value={qty === 0 ? '' : qty}
                              placeholder="0"
                              onChange={(e) => handleCellChange(hotel.id, item.id, e.target.value)}
                              onBlur={() => handleCellBlur(hotel.id, item.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLElement).blur();
                                }
                              }}
                              className={`w-full py-1.5 px-2 text-center rounded-lg border text-xs font-bold transition-all focus:outline-none ${
                                isSavedThis
                                  ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400/50'
                                  : isSavingThis
                                  ? 'bg-brand-950 border-brand-400 text-brand-200 ring-2 ring-brand-400/50 animate-pulse'
                                  : qty > 0
                                  ? 'bg-brand-950/80 border-brand-700 text-white focus:ring-2 focus:ring-brand-400'
                                  : 'bg-[#071326] border-[#1e3659] text-slate-400 hover:border-slate-500 focus:border-brand-400 focus:text-white'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Total de Fila (Sticky derecha) */}
                      <td className="px-4 py-2 text-right sticky right-0 z-10 bg-[#0b1a33] font-black text-cyan-300 border-l border-[#1e3659]">
                        {formatNumber(rowTotal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Fila Inferior con Totales Generales */}
            {!loading && (
              <tfoot className="bg-[#071326] sticky bottom-0 z-20 border-t-2 border-[#1e3659] font-bold">
                <tr>
                  <td className="px-4 py-3 sticky left-0 z-30 bg-[#071326] text-white border-r border-[#1e3659] uppercase tracking-wider text-xs">
                    TOTAL GENERAL DEL DÍA
                  </td>
                  {items.map((item) => {
                    const colTotal = getColumnTotal(item.id);
                    return (
                      <td key={item.id} className="px-3 py-3 text-center text-slate-200 border-r border-[#1e3659]/40 font-extrabold">
                        {formatNumber(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right sticky right-0 z-30 bg-[#071326] text-emerald-400 border-l border-[#1e3659] text-sm font-black">
                    {formatNumber(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
