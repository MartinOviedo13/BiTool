import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Truck,
  Lock,
  Unlock,
  X,
  ClipboardCheck,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  Hotel,
  Item,
  Registro,
  BatchRegistroItem,
  MatrixDraftGrid,
  DespachoConciliacion,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayDateString, formatDateDisplay } from '../../utils/date';
import { formatNumber } from '../../utils/formatters';

export const MatrixEntryView: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [despachosByHotel, setDespachosByHotel] = useState<Record<number, DespachoConciliacion>>({});
  const [validatingHotelId, setValidatingHotelId] = useState<number | null>(null);
  const [modalDespacho, setModalDespacho] = useState<DespachoConciliacion | null>(null);
  const [reopenedHotels, setReopenedHotels] = useState<Set<number>>(new Set());

  // Matrix data structure: grid[hotelId][itemId] = quantity
  const [grid, setGrid] = useState<Record<number, Record<number, number>>>({});
  // Registros preexistentes de la fecha en base de datos
  const [existingRegistros, setExistingRegistros] = useState<Registro[]>([]);
  const savedGridRef = useRef<Record<number, Record<number, number>>>({});
  const gridRef = useRef<Record<number, Record<number, number>>>({});

  // Estados de carga y guardado
  const [loading, setLoading] = useState<boolean>(true);
  const [savingBulk, setSavingBulk] = useState<boolean>(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cellAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const getDraftKey = (date: string) => `triton_matrix_draft_${date}`;

  // Cargar catálogos y datos de la fecha
  const loadMatrix = async (date: string) => {
    setLoading(true);
    setStatusMessage(null);
    setReopenedHotels(new Set());
    try {
      const [hotelesData, itemsData, registrosData, despachosData] = await Promise.all([
        api.getHoteles(),
        api.getItems(),
        api.getRegistros({ fecha_desde: date, fecha_hasta: date }),
        api.getDespachosConciliacion({ fecha: date }).catch(() => [] as DespachoConciliacion[]),
      ]);

      const activeHotels = hotelesData.filter((h) => h.activo);
      setHoteles(activeHotels);
      setItems(itemsData);

      const dMap: Record<number, DespachoConciliacion> = {};
      despachosData.forEach((d) => {
        dMap[d.hotel_id] = d;
      });
      setDespachosByHotel(dMap);

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
          const draftGrid = JSON.parse(rawDraft) as MatrixDraftGrid;
          Object.entries(draftGrid).forEach(([hId, row]) => {
            const hNum = parseInt(hId, 10);
            if (baseGrid[hNum] && row && typeof row === 'object') {
              Object.entries(row).forEach(([iId, qty]) => {
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

      gridRef.current = baseGrid;
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
    const timersMap = cellTimersRef.current;
    const controllersMap = cellAbortControllersRef.current;

    loadMatrix(selectedDate);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
      controllersMap.forEach((controller) => controller.abort());
      controllersMap.clear();
    };
  }, [selectedDate]);

  // Persistir una celda individual de forma idempotente cancelando requests en vuelo previas
  const persistCell = async (hotelId: number, itemId: number, dateStr: string, qtyToSave: number) => {
    const savedQty = savedGridRef.current[hotelId]?.[itemId] ?? 0;
    if (qtyToSave === savedQty) {
      return;
    }

    const requestKey = `${hotelId}-${itemId}-${dateStr}`;
    const cellKey = `${hotelId}-${itemId}`;

    const prevController = cellAbortControllersRef.current.get(requestKey);
    if (prevController) {
      prevController.abort();
    }
    const controller = new AbortController();
    cellAbortControllersRef.current.set(requestKey, controller);

    setSavingCells((prev) => new Set(prev).add(cellKey));
    setAutoSaveStatus('saving');

    try {
      await api.createRegistrosBatch(
        [
          {
            fecha: dateStr,
            hotel_id: hotelId,
            item_id: itemId,
            cantidad: qtyToSave,
          },
        ],
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (!savedGridRef.current[hotelId]) {
        savedGridRef.current[hotelId] = {};
      }
      savedGridRef.current[hotelId][itemId] = qtyToSave;

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
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (controller.signal.aborted) {
        return;
      }
      console.error('Error en guardado automático:', err);
      setAutoSaveStatus('error');
    } finally {
      if (cellAbortControllersRef.current.get(requestKey) === controller) {
        cellAbortControllersRef.current.delete(requestKey);
        setSavingCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }
    }
  };

  // Edición inmediata en memoria, persistencia en borrador local y debounce por celda (500ms) con cancelación
  const handleCellChange = (hotelId: number, itemId: number, valStr: string) => {
    const parsed = parseInt(valStr, 10);
    const qty = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    const requestKey = `${hotelId}-${itemId}-${selectedDate}`;

    // Si hay timer o request previa para esta celda, cancelar inmediatamente
    const prevTimer = cellTimersRef.current.get(requestKey);
    if (prevTimer) {
      clearTimeout(prevTimer);
      cellTimersRef.current.delete(requestKey);
    }
    const prevController = cellAbortControllersRef.current.get(requestKey);
    if (prevController) {
      prevController.abort();
      cellAbortControllersRef.current.delete(requestKey);
    }

    setGrid((prev) => {
      const next = {
        ...prev,
        [hotelId]: {
          ...(prev[hotelId] || {}),
          [itemId]: qty,
        },
      };
      gridRef.current = next;
      localStorage.setItem(getDraftKey(selectedDate), JSON.stringify(next));
      return next;
    });

    const timer = setTimeout(() => {
      cellTimersRef.current.delete(requestKey);
      const latestQty = gridRef.current[hotelId]?.[itemId] ?? qty;
      void persistCell(hotelId, itemId, selectedDate, latestQty);
    }, 500);
    cellTimersRef.current.set(requestKey, timer);
  };

  // Guardado automático inmediato por celda al desenfocar o pulsar Enter/Tab
  const handleCellBlur = async (hotelId: number, itemId: number) => {
    const requestKey = `${hotelId}-${itemId}-${selectedDate}`;
    const pendingTimer = cellTimersRef.current.get(requestKey);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      cellTimersRef.current.delete(requestKey);
    }
    const currentQty = gridRef.current[hotelId]?.[itemId] ?? grid[hotelId]?.[itemId] ?? 0;
    await persistCell(hotelId, itemId, selectedDate, currentQty);
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
    } catch (err: unknown) {
      console.error('Error guardando planilla:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la planilla.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setSavingBulk(false);
    }
  };

  // Validar y conciliar la fila de un hotel contra su remito digital y notificar al repartidor
  const handleValidarHotel = async (hotel: Hotel) => {
    setValidatingHotelId(hotel.id);
    setStatusMessage(null);
    try {
      // 1. Consolidar en BD cualquier celda de este hotel que tenga edición pendiente en grilla
      const row = gridRef.current[hotel.id] || grid[hotel.id] || {};
      const pendingBatch: BatchRegistroItem[] = [];
      items.forEach((it) => {
        const currentQty = row[it.id] ?? 0;
        const savedQty = savedGridRef.current[hotel.id]?.[it.id] ?? 0;
        if (currentQty !== savedQty) {
          const requestKey = `${hotel.id}-${it.id}-${selectedDate}`;
          const pendingTimer = cellTimersRef.current.get(requestKey);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            cellTimersRef.current.delete(requestKey);
          }
          pendingBatch.push({
            fecha: selectedDate,
            hotel_id: hotel.id,
            item_id: it.id,
            cantidad: currentQty,
          });
        }
      });

      if (pendingBatch.length > 0) {
        await api.createRegistrosBatch(pendingBatch);
        if (!savedGridRef.current[hotel.id]) {
          savedGridRef.current[hotel.id] = {};
        }
        pendingBatch.forEach((b) => {
          savedGridRef.current[hotel.id][b.item_id] = b.cantidad;
        });
      }

      // 2. Ejecutar conciliación contra remito y emitir alerta + muestra al repartidor
      const despacho = await api.validarConciliacion({
        hotel_id: hotel.id,
        fecha: selectedDate,
      });

      setDespachosByHotel((prev) => ({
        ...prev,
        [hotel.id]: despacho,
      }));
      setModalDespacho(despacho);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al validar y conciliar el hotel.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setValidatingHotelId(null);
    }
  };

  const handleReopenHotel = (hotel: Hotel) => {
    if (user?.rol !== 'admin') return;
    const confirmed = window.confirm(
      `El pedido de ${hotel.nombre} ya figura como ENTREGADO por el repartidor en la fecha ${formatDateDisplay(
        selectedDate
      )}. ¿Deseás reabrir la edición de sus celdas bajo responsabilidad de Administrador?`
    );
    if (confirmed) {
      setReopenedHotels((prev) => new Set(prev).add(hotel.id));
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
            Matriz operativa digital: Hoteles en filas $\times$ Prendas en columnas &bull; Conciliación directa con Repartidor
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
                <th className="px-4 py-3 sticky left-0 z-30 bg-[#071326] min-w-[200px] font-bold text-white border-r border-[#1e3659]">
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
                <th className="px-3 py-3 text-right min-w-[90px] font-bold text-cyan-400 border-l border-[#1e3659] bg-[#071326]">
                  Total Fila
                </th>
                <th className="px-4 py-3 text-center sticky right-0 z-30 bg-[#071326] min-w-[215px] font-bold text-white border-l border-[#1e3659]">
                  Check / Conciliar Remito
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1e3659]/60 bg-[#0b1a33]/40">
              {loading ? (
                <tr>
                  <td colSpan={items.length + 3} className="px-4 py-16 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
                    <p className="text-xs font-semibold">Cargando matriz operativa en tiempo real...</p>
                  </td>
                </tr>
              ) : (
                filteredHoteles.map((hotel) => {
                  const rowTotal = getRowTotal(hotel.id);
                  const despacho = despachosByHotel[hotel.id];
                  const isEntregado = despacho?.estado === 'entregado';
                  const isLocked = isEntregado && !reopenedHotels.has(hotel.id);
                  const isValidatingThis = validatingHotelId === hotel.id;

                  return (
                    <tr
                      key={hotel.id}
                      className={`hover:bg-[#132747]/40 transition-colors ${
                        isLocked
                          ? 'bg-emerald-950/10 opacity-90'
                          : rowTotal > 0
                          ? 'bg-brand-950/15'
                          : ''
                      }`}
                    >
                      {/* Nombre del Hotel (Sticky izquierda) */}
                      <td className="px-4 py-2 sticky left-0 z-10 bg-[#0b1a33] font-bold text-slate-200 border-r border-[#1e3659]">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="truncate">{hotel.nombre}</span>
                          {isLocked && (
                            <span
                              title="Pedido entregado por el repartidor (Edición bloqueada)"
                              className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 rounded"
                            >
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
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
                              disabled={isLocked}
                              value={qty === 0 ? '' : qty}
                              placeholder="0"
                              onChange={(e) => handleCellChange(hotel.id, item.id, e.target.value)}
                              onBlur={() => handleCellBlur(hotel.id, item.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLElement).blur();
                                }
                              }}
                              className={`w-full py-1.5 px-2 text-center rounded-lg border text-xs font-bold transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
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

                      {/* Total de Fila */}
                      <td className="px-3 py-2 text-right bg-[#0b1a33] font-black text-cyan-300 border-l border-[#1e3659]">
                        {formatNumber(rowTotal)}
                      </td>

                      {/* Check de Validación / Conciliar con Remito (Sticky derecha) */}
                      <td className="px-3 py-2 sticky right-0 z-10 bg-[#0b1a33] border-l border-[#1e3659]">
                        <div className="flex items-center justify-between gap-1.5">
                          {/* Estado actual */}
                          <div className="flex-1 min-w-0">
                            {!despacho || despacho.estado === 'pendiente' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-[#071326] border border-[#1e3659] px-2 py-0.5 rounded-full">
                                Pendiente
                              </span>
                            ) : despacho.estado === 'validado_ok' ? (
                              <button
                                type="button"
                                onClick={() => setModalDespacho(despacho)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 rounded-full hover:bg-emerald-900/80 transition-colors"
                                title="Ver detalle conciliado"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="truncate">Validado OK</span>
                              </button>
                            ) : despacho.estado === 'validado_con_diferencia' ? (
                              <button
                                type="button"
                                onClick={() => setModalDespacho(despacho)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-700/60 px-2 py-0.5 rounded-full hover:bg-amber-900/80 transition-colors"
                                title="Ver diferencias detectadas contra el remito"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="truncate">
                                  Alerta Dif. ({despacho.diferencia_prendas > 0 ? `+${despacho.diferencia_prendas}` : despacho.diferencia_prendas})
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setModalDespacho(despacho)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-700/60 px-2 py-0.5 rounded-full hover:bg-cyan-900/80 transition-colors"
                                title="Pedido entregado por el repartidor"
                              >
                                <Truck className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span className="truncate">Entregado</span>
                              </button>
                            )}
                          </div>

                          {/* Botón de acción */}
                          {isLocked ? (
                            user?.rol === 'admin' ? (
                              <button
                                type="button"
                                onClick={() => handleReopenHotel(hotel)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 border border-slate-700 shrink-0"
                                title="Reabrir edición (Solo Admin)"
                              >
                                <Unlock className="w-3 h-3" />
                                <span>Reabrir</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-semibold px-1">Cerrado</span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleValidarHotel(hotel)}
                              disabled={isValidatingThis}
                              className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all shrink-0"
                              title="Comparar carga con el Remito del Hotel y enviar alerta/muestra al Repartidor"
                            >
                              <ClipboardCheck className={`w-3 h-3 ${isValidatingThis ? 'animate-spin' : ''}`} />
                              <span>{isValidatingThis ? '...' : despacho ? 'Re-validar' : 'Validar'}</span>
                            </button>
                          )}
                        </div>
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
                  <td className="px-3 py-3 text-right bg-[#071326] text-emerald-400 border-l border-[#1e3659] text-sm font-black">
                    {formatNumber(grandTotal)}
                  </td>
                  <td className="px-4 py-3 text-center sticky right-0 z-30 bg-[#071326] text-slate-400 border-l border-[#1e3659] text-[10px]">
                    {Object.values(despachosByHotel).filter((d) => d.estado !== 'pendiente').length} conciliados
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal de Confirmación y Comparativo Remito vs. Procesado */}
      {modalDespacho && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0b1a33] border border-[#1e3659] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="p-5 bg-[#071326] border-b border-[#1e3659] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    modalDespacho.estado === 'validado_con_diferencia'
                      ? 'bg-amber-950/80 border-amber-700 text-amber-400'
                      : 'bg-emerald-950/80 border-emerald-700 text-emerald-400'
                  }`}
                >
                  {modalDespacho.estado === 'validado_con_diferencia' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Conciliación: {modalDespacho.hotel_nombre}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fecha: <span className="text-slate-200 font-semibold">{formatDateDisplay(modalDespacho.fecha)}</span>
                    {modalDespacho.codigo_qr && (
                      <>
                        {' '}
                        &bull; Remito QR: <span className="font-mono text-brand-300">{modalDespacho.codigo_qr}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalDespacho(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#132747]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Banner de Alerta Visual y Aviso enviado al Repartidor */}
              {modalDespacho.estado === 'validado_con_diferencia' ? (
                <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-700/80 text-amber-200 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-amber-300 text-sm">
                      ¡Diferencia detectada contra el Remito del Hotel!
                    </p>
                    <p>
                      Se emitió una <strong>alerta automática al Repartidor</strong> adjuntando la muestra detallada de lo procesado para su control antes de retirar y entregar el pedido.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-700/80 text-emerald-200 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-emerald-300 text-sm">
                      ¡Carga Validada sin Diferencias (OK)!
                    </p>
                    <p>
                      La cantidad procesada coincide exactamente con el remito. Se notificó al <strong>Repartidor</strong> que la carga y su muestra están listas para despacho.
                    </p>
                  </div>
                </div>
              )}

              {/* Tarjetas Comparativas: Remito vs. Procesado */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#071326] border border-[#1e3659] rounded-xl p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cant. en Remito
                  </span>
                  <p className="text-xl font-black text-white mt-1">
                    {formatNumber(modalDespacho.total_remito_prendas)} <span className="text-xs font-normal text-slate-400">u.</span>
                  </p>
                </div>

                <div className="bg-[#071326] border border-[#1e3659] rounded-xl p-3.5 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Cant. Procesada
                  </span>
                  <p className="text-xl font-black text-cyan-300 mt-1">
                    {formatNumber(modalDespacho.total_procesado_prendas)} <span className="text-xs font-normal text-slate-400">u.</span>
                  </p>
                  {modalDespacho.total_procesado_kilos > 0 && (
                    <p className="text-[10px] text-slate-400">
                      ({modalDespacho.total_procesado_kilos.toFixed(2)} kg)
                    </p>
                  )}
                </div>

                <div
                  className={`rounded-xl p-3.5 text-center border ${
                    modalDespacho.diferencia_prendas === 0
                      ? 'bg-emerald-950/30 border-emerald-800/60'
                      : 'bg-amber-950/30 border-amber-800/60'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    Diferencia Neta
                  </span>
                  <p
                    className={`text-xl font-black mt-1 ${
                      modalDespacho.diferencia_prendas === 0
                        ? 'text-emerald-400'
                        : modalDespacho.diferencia_prendas > 0
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {modalDespacho.diferencia_prendas > 0
                      ? `+${modalDespacho.diferencia_prendas}`
                      : modalDespacho.diferencia_prendas}{' '}
                    <span className="text-xs font-normal">u.</span>
                  </p>
                </div>
              </div>

              {/* Muestra Procesada Ítem por Ítem */}
              <div className="rounded-xl border border-[#1e3659] overflow-hidden">
                <div className="bg-[#071326] px-4 py-2.5 border-b border-[#1e3659] flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Muestra de lo Procesado enviada al Repartidor
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {modalDespacho.muestra_procesado.length} ítems
                  </span>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#071326]/70 text-slate-400 uppercase text-[10px] border-b border-[#1e3659]">
                    <tr>
                      <th className="px-4 py-2.5">Ítem / Prenda</th>
                      <th className="px-3 py-2.5 text-right">Cant. Remito</th>
                      <th className="px-3 py-2.5 text-right text-cyan-400">Procesado (Prendas / Kg)</th>
                      <th className="px-4 py-2.5 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3659]/50">
                    {modalDespacho.muestra_procesado.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                          No hay prendas registradas ni en remito ni en carga para este hotel en la fecha.
                        </td>
                      </tr>
                    ) : (
                      modalDespacho.muestra_procesado.map((m) => (
                        <tr key={m.item_id} className="hover:bg-[#132747]/30">
                          <td className="px-4 py-2 font-bold text-white">{m.item_nombre}</td>
                          <td className="px-3 py-2 text-right text-slate-300 font-semibold">
                            {formatNumber(m.cant_remito)}
                          </td>
                          <td className="px-3 py-2 text-right font-black text-cyan-300">
                            {formatNumber(m.cant_procesada_prendas)} u.
                            {m.cant_procesada_kilos > 0 && (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">
                                ({m.cant_procesada_kilos.toFixed(1)} kg)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-bold">
                            {m.diferencia === 0 ? (
                              <span className="text-emerald-400">0 (OK)</span>
                            ) : m.diferencia > 0 ? (
                              <span className="text-amber-400">+{m.diferencia}</span>
                            ) : (
                              <span className="text-rose-400">{m.diferencia}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-[#071326] border-t border-[#1e3659] flex items-center justify-between">
              <div className="text-[11px] text-slate-400">
                {modalDespacho.entregado_en ? (
                  <span className="text-emerald-400 font-semibold">
                    ✓ Entregado por {modalDespacho.entregado_por_username || 'Repartidor'} (
                    {new Date(modalDespacho.entregado_en).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    hs)
                  </span>
                ) : (
                  <span>Notificación activa en la bandeja del Repartidor</span>
                )}
              </div>
              <button
                onClick={() => setModalDespacho(null)}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

