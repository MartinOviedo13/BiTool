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
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Building2,
  Shirt,
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

  // Estados mobile-first para navegación y carga táctil por hotel e ítem
  const [expandedMobileHotels, setExpandedMobileHotels] = useState<Record<number, boolean>>({});
  const [activeMobileHotelId, setActiveMobileHotelId] = useState<number | 'all'>('all');
  const [itemSearchMobile, setItemSearchMobile] = useState<string>('');
  const [onlyLoadedItemsMobile, setOnlyLoadedItemsMobile] = useState<boolean>(false);

  // Estados para separación por sector de planta (Opción 3)
  const [selectedSector, setSelectedSector] = useState<'all' | 'planchado' | 'secadora'>('all');
  const [hotelActiveSector, setHotelActiveSector] = useState<Record<number, 'planchado' | 'secadora'>>({});

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

      // En mobile: abrir el primer hotel por defecto (y aquellos con carga) para mostrar los ítems de inmediato
      if (activeHotels.length > 0) {
        setExpandedMobileHotels((prev) => {
          if (Object.keys(prev).length > 0) return prev;
          const initialExpanded: Record<number, boolean> = { [activeHotels[0].id]: true };
          registrosData.forEach((r) => {
            if (r.cantidad > 0) initialExpanded[r.hotel_id] = true;
          });
          return initialExpanded;
        });
      }

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

  // Ajuste rápido por botones táctiles (+/-) en vista mobile
  const handleIncrementCell = (hotelId: number, itemId: number, delta: number) => {
    const current = gridRef.current[hotelId]?.[itemId] ?? grid[hotelId]?.[itemId] ?? 0;
    const nextQty = Math.max(0, current + delta);
    handleCellChange(hotelId, itemId, String(nextQty));
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

  // Filtros y totales por sector físico de planta
  const planchadoItems = useMemo(() => items.filter((i) => i.sector === 'planchado'), [items]);
  const secadoraItems = useMemo(() => items.filter((i) => i.sector === 'secadora'), [items]);

  const desktopVisibleItems = useMemo(() => {
    if (selectedSector === 'planchado') return planchadoItems;
    if (selectedSector === 'secadora') return secadoraItems;
    return items;
  }, [items, selectedSector, planchadoItems, secadoraItems]);

  const getSectorTotal = (hotelId: number, sector: 'planchado' | 'secadora') => {
    const row = grid[hotelId];
    if (!row) return 0;
    const itemList = sector === 'planchado' ? planchadoItems : secadoraItems;
    return itemList.reduce((sum, it) => sum + (row[it.id] || 0), 0);
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

  const mobileVisibleHoteles = useMemo(() => {
    if (activeMobileHotelId === 'all') return filteredHoteles;
    return filteredHoteles.filter((h) => h.id === activeMobileHotelId);
  }, [filteredHoteles, activeMobileHotelId]);

  const toggleMobileHotel = (hotelId: number) => {
    setExpandedMobileHotels((prev) => ({
      ...prev,
      [hotelId]: !prev[hotelId],
    }));
  };

  const expandAllMobileHotels = () => {
    const next: Record<number, boolean> = {};
    filteredHoteles.forEach((h) => {
      next[h.id] = true;
    });
    setExpandedMobileHotels(next);
  };

  const collapseAllMobileHotels = () => {
    setExpandedMobileHotels({});
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in pb-20 md:pb-0">
      {/* Top Header & Controles de Operación */}
      <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50 shadow-xl shadow-black/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2.5">
              <Layers className="h-5 w-5 sm:h-6 sm:w-6 text-triton-aqua shrink-0" />
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Carga Diaria de Planilla</h2>
            </div>
            {/* Estado de Auto-Save en Mobile visible arriba a la derecha */}
            <div className="sm:hidden">
              {autoSaveStatus === 'saving' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-950 text-triton-aqua-light border border-brand-700/60 text-[10px] font-semibold animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin text-triton-aqua" />
                  <span>Guardando</span>
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Guardado</span>
                </span>
              )}
              {autoSaveStatus === 'error' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-950/80 text-rose-300 border border-rose-700/60 text-[10px] font-bold">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span>Error</span>
                </span>
              )}
              {autoSaveStatus === 'idle' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-triton-deep text-slate-400 border border-triton-slate/50 text-[10px] font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>En vivo</span>
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Matriz operativa digital: Hoteles $\times$ Prendas &bull; Conciliación directa con Repartidor
          </p>

          {/* Selector de Puesto de Trabajo / Sector de Planta */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <span className="text-[11px] font-bold text-slate-400 hidden sm:inline mr-1">Sector:</span>
            <div className="inline-flex items-center bg-triton-deep p-1 rounded-xl border border-triton-slate/50">
              <button
                type="button"
                onClick={() => setSelectedSector('all')}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedSector === 'all'
                    ? 'bg-triton-aqua text-triton-navy font-black shadow-md shadow-triton-aqua/25'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Toda la Planta ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedSector('planchado')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedSector === 'planchado'
                    ? 'bg-indigo-600 text-white font-black shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🥌 Planchado</span>
                <span className="text-[10px] opacity-80 font-mono">({planchadoItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSector('secadora')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedSector === 'secadora'
                    ? 'bg-teal-600 text-white font-black shadow-md shadow-teal-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>🌀 Secadoras</span>
                <span className="text-[10px] opacity-80 font-mono">({secadoraItems.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Indicador de Auto-Save & Selector de Fecha */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
          {/* Indicador de Estado del Guardado Automático (Desktop/Tablet) */}
          <div className="hidden sm:block mr-1">
            {autoSaveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-brand-950 text-triton-aqua-light border border-brand-700/60 text-xs font-semibold animate-pulse shadow-sm">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-triton-aqua" />
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-triton-deep text-slate-400 border border-triton-slate/50 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Sincronizado en vivo</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {/* Selector de Fecha */}
            <div className="flex items-center gap-2 bg-triton-deep px-3 py-2 sm:py-1.5 rounded-xl border border-triton-slate/50">
              <Calendar className="h-4 w-4 text-triton-aqua shrink-0" />
              <span className="text-xs font-bold text-slate-300 hidden xs:inline">Fecha:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none font-bold cursor-pointer w-full"
              />
            </div>

            {/* Buscador de Hotel */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar hotel..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setActiveMobileHotelId('all');
                }}
                className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-9 pr-3 py-2 sm:py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-44"
              />
            </div>
          </div>

          {/* Botón manual de Sincronización Total (Fallback) */}
          <button
            onClick={handleSaveBulk}
            disabled={savingBulk || loading}
            className="flex items-center justify-center gap-2 px-3.5 py-2 sm:py-1.5 bg-triton-deep hover:bg-triton-slate/60 border border-triton-slate/50 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
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

      {/* ===================================================================== */}
      {/* VISTA MOBILE FIRST (< md): TARJETAS INTERACTIVAS POR HOTEL E ÍTEM     */}
      {/* ===================================================================== */}
      <div className="md:hidden space-y-3.5">
        {/* Barra de Filtros Rápidos de Prendas y Hoteles para Mobile */}
        <div className="bg-triton-navy/90 p-3.5 rounded-2xl border border-triton-slate/50 shadow-lg space-y-3">
          {/* Buscador de Prenda + Filtro Solo Cargadas */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Shirt className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar ítem / prenda (ej: Sábana, Toalla)..."
                value={itemSearchMobile}
                onChange={(e) => setItemSearchMobile(e.target.value)}
                className="w-full bg-triton-deep border border-triton-slate/50 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua"
              />
              {itemSearchMobile && (
                <button
                  type="button"
                  onClick={() => setItemSearchMobile('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOnlyLoadedItemsMobile((v) => !v)}
              className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border shrink-0 transition-all ${
                onlyLoadedItemsMobile
                  ? 'bg-brand-600 text-white border-brand-500'
                  : 'bg-triton-deep text-slate-300 border-triton-slate/50'
              }`}
            >
              {onlyLoadedItemsMobile ? 'Cargados' : `Todos (${items.length})`}
            </button>
          </div>

          {/* Selector horizontal táctil de Hoteles */}
          {filteredHoteles.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              <button
                type="button"
                onClick={() => setActiveMobileHotelId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all ${
                  activeMobileHotelId === 'all'
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                    : 'bg-triton-deep text-slate-300 border-triton-slate/50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Todos ({filteredHoteles.length})</span>
              </button>

              {filteredHoteles.map((h) => {
                const hTotal = getRowTotal(h.id);
                const isSelected = activeMobileHotelId === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setActiveMobileHotelId(h.id);
                      setExpandedMobileHotels((prev) => ({ ...prev, [h.id]: true }));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all ${
                      isSelected
                        ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                        : hTotal > 0
                        ? 'bg-brand-950/60 text-cyan-300 border-brand-700/60'
                        : 'bg-triton-deep text-slate-300 border-triton-slate/50'
                    }`}
                  >
                    <span className="truncate max-w-[130px]">{h.nombre}</span>
                    {hTotal > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-black">
                        {hTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Controles rápidos Expandir / Colapsar hoteles */}
          <div className="flex items-center justify-between pt-1 border-t border-triton-slate/40 text-[11px]">
            <span className="text-slate-400 font-medium">
              Tocá un hotel para cargar sus <strong className="text-white">{items.length} ítems</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAllMobileHotels}
                className="text-triton-aqua font-bold hover:underline"
              >
                Abrir todos
              </button>
              <span className="text-slate-600">&bull;</span>
              <button
                type="button"
                onClick={collapseAllMobileHotels}
                className="text-slate-400 font-semibold hover:text-white"
              >
                Cerrar todos
              </button>
            </div>
          </div>
        </div>

        {/* Listado de Tarjetas de Hoteles con sus Ítems para Cargar */}
        {loading ? (
          <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
            <p className="text-xs font-semibold">Cargando ítems y hoteles en tiempo real...</p>
          </div>
        ) : mobileVisibleHoteles.length === 0 ? (
          <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-8 text-center text-slate-400 text-xs">
            No se encontraron hoteles con ese filtro.
          </div>
        ) : (
          mobileVisibleHoteles.map((hotel) => {
            const rowTotal = getRowTotal(hotel.id);
            const despacho = despachosByHotel[hotel.id];
            const isEntregado = despacho?.estado === 'entregado';
            const isLocked = isEntregado && !reopenedHotels.has(hotel.id);
            const isValidatingThis = validatingHotelId === hotel.id;
            const isExpanded =
              activeMobileHotelId === hotel.id || !!expandedMobileHotels[hotel.id];

            // Sector activo en la tarjeta del hotel (respeta el filtro global si está activo)
            const activeSectorForHotel =
              selectedSector !== 'all' ? selectedSector : (hotelActiveSector[hotel.id] ?? 'planchado');
            const hotelPlanchadoTotal = getSectorTotal(hotel.id, 'planchado');
            const hotelSecadoraTotal = getSectorTotal(hotel.id, 'secadora');

            const visibleItemsForHotel = items.filter((item) => {
              // Si no hay búsqueda manual por texto, mostrar solo las prendas del sector seleccionado en la tarjeta
              if (!itemSearchMobile && selectedSector === 'all' && item.sector !== activeSectorForHotel) {
                return false;
              }
              if (selectedSector !== 'all' && item.sector !== selectedSector) {
                return false;
              }
              const matchesSearch = itemSearchMobile
                ? item.nombre.toLowerCase().includes(itemSearchMobile.toLowerCase())
                : true;
              if (!matchesSearch) return false;
              if (onlyLoadedItemsMobile) {
                const q = grid[hotel.id]?.[item.id] ?? 0;
                return q > 0;
              }
              return true;
            });

            return (
              <div
                key={hotel.id}
                className={`rounded-2xl border transition-all overflow-hidden shadow-xl ${
                  isExpanded
                    ? 'bg-triton-navy border-brand-500/60'
                    : 'bg-triton-navy/90 border-triton-slate/50'
                }`}
              >
                {/* Cabecera del Hotel en Mobile */}
                <div
                  onClick={() => toggleMobileHotel(hotel.id)}
                  className="p-3.5 bg-triton-deep/80 flex items-center justify-between gap-2 cursor-pointer select-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-white truncate">{hotel.nombre}</h3>
                      {isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 rounded font-bold">
                          <Lock className="w-2.5 h-2.5" /> Entregado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-extrabold text-cyan-300">
                        Total: {formatNumber(rowTotal)} u.
                      </span>
                      <span className="text-slate-600">&bull;</span>
                      {!despacho || despacho.estado === 'pendiente' ? (
                        <span className="text-[10px] font-bold text-slate-400">
                          Sin validar
                        </span>
                      ) : despacho.estado === 'validado_ok' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Validado OK
                        </span>
                      ) : despacho.estado === 'validado_con_diferencia' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> Dif. ({despacho.diferencia_prendas > 0 ? `+${despacho.diferencia_prendas}` : despacho.diferencia_prendas})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400">
                          <Truck className="w-3 h-3" /> Entregado
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1.5 rounded-xl bg-triton-deep border border-triton-slate/50 text-[11px] font-bold text-triton-aqua-light flex items-center gap-1">
                      <span>{isExpanded ? 'Ocultar' : 'Cargar ítems'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </div>

                {/* Cuerpo Desplegado: Separado por Sector de Planta (Opción 3) */}
                {isExpanded && (
                  <div className="p-3 space-y-3 border-t border-triton-slate/50">
                    {/* Sub-Pestañas Táctiles por Sector dentro del Hotel */}
                    {selectedSector === 'all' && (
                      <div className="grid grid-cols-2 gap-2 p-1 bg-triton-deep rounded-xl border border-triton-slate/50">
                        <button
                          type="button"
                          onClick={() => setHotelActiveSector((prev) => ({ ...prev, [hotel.id]: 'planchado' }))}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                            activeSectorForHotel === 'planchado'
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200 bg-triton-navy/50'
                          }`}
                        >
                          <span>🥌 Planchado</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 font-black">
                            {hotelPlanchadoTotal} u.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setHotelActiveSector((prev) => ({ ...prev, [hotel.id]: 'secadora' }))}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                            activeSectorForHotel === 'secadora'
                              ? 'bg-teal-600 text-white shadow-md'
                              : 'text-slate-400 hover:text-slate-200 bg-triton-navy/50'
                          }`}
                        >
                          <span>🌀 Secadoras</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30 font-black">
                            {hotelSecadoraTotal} u.
                          </span>
                        </button>
                      </div>
                    )}
                    {visibleItemsForHotel.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No hay ítems que coincidan con el filtro actual.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {visibleItemsForHotel.map((item) => {
                          const cellKey = `${hotel.id}-${item.id}`;
                          const qty = grid[hotel.id]?.[item.id] ?? 0;
                          const isSavingThis = savingCells.has(cellKey);
                          const isSavedThis = savedCells.has(cellKey);

                          return (
                            <div
                              key={item.id}
                              className={`p-3 rounded-xl border transition-all ${
                                isSavedThis
                                  ? 'bg-emerald-950/40 border-emerald-500/70'
                                  : isSavingThis
                                  ? 'bg-brand-950/60 border-brand-400 animate-pulse'
                                  : qty > 0
                                  ? 'bg-brand-950/40 border-brand-600/60'
                                  : 'bg-triton-deep/90 border-triton-slate/50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`font-bold text-xs sm:text-sm truncate ${
                                      !item.se_factura ? 'text-amber-300' : 'text-white'
                                    }`}
                                  >
                                    {item.nombre}
                                  </span>
                                  {!item.se_factura && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800/60 shrink-0">
                                      relavado
                                    </span>
                                  )}
                                </div>

                                {isSavingThis ? (
                                  <span className="text-[10px] text-triton-aqua-light font-semibold">
                                    Guardando...
                                  </span>
                                ) : isSavedThis ? (
                                  <span className="text-[10px] text-emerald-400 font-bold">
                                    ✓ Guardado
                                  </span>
                                ) : qty > 0 ? (
                                  <span className="text-[11px] font-black text-cyan-300 bg-cyan-950/80 border border-cyan-800/50 px-2 py-0.5 rounded-full">
                                    {qty} u.
                                  </span>
                                ) : null}
                              </div>

                              {/* Controles de carga táctil: [-], Input numérico, [+] */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isLocked || qty <= 0}
                                  onClick={() => handleIncrementCell(hotel.id, item.id, -1)}
                                  className="w-11 h-10 rounded-xl bg-triton-deep active:bg-triton-slate/80 disabled:opacity-30 border border-triton-slate/50 text-white flex items-center justify-center touch-manipulation shrink-0"
                                  aria-label={`Restar ${item.nombre}`}
                                >
                                  <Minus className="w-4 h-4" />
                                </button>

                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  disabled={isLocked}
                                  value={qty === 0 ? '' : qty}
                                  placeholder="0"
                                  onChange={(e) =>
                                    handleCellChange(hotel.id, item.id, e.target.value)
                                  }
                                  onBlur={() => void handleCellBlur(hotel.id, item.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLElement).blur();
                                    }
                                  }}
                                  className={`flex-1 h-10 text-center rounded-xl border text-sm font-black transition-all focus:outline-none disabled:opacity-50 ${
                                    qty > 0
                                      ? 'bg-brand-950 border-brand-500 text-white'
                                      : 'bg-triton-navy border-triton-slate/50 text-slate-200 focus:border-triton-aqua'
                                  }`}
                                />

                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() => handleIncrementCell(hotel.id, item.id, 1)}
                                  className="w-11 h-10 rounded-xl bg-triton-teal hover:bg-triton-teal-light active:bg-[#108080] disabled:opacity-30 text-white flex items-center justify-center shadow-sm touch-manipulation shrink-0"
                                  aria-label={`Sumar ${item.nombre}`}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Botones rápidos de incremento industrial (+5, +10, +25) */}
                              {!isLocked && (
                                <div className="grid grid-cols-3 gap-1.5 mt-2">
                                  {[5, 10, 25].map((step) => (
                                    <button
                                      key={step}
                                      type="button"
                                      onClick={() =>
                                        handleIncrementCell(hotel.id, item.id, step)
                                      }
                                      className="py-1 rounded-lg bg-triton-deep/80 active:bg-triton-slate/80 border border-triton-slate/50 text-[11px] font-bold text-slate-300 touch-manipulation"
                                    >
                                      +{step}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Pie de Tarjeta del Hotel: Resumen y Conciliación con Remito */}
                    <div className="pt-3 mt-2 border-t border-triton-slate/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-300">
                            Total cargado en {hotel.nombre}:
                          </span>
                          <span className="text-sm font-black text-cyan-300">
                            {formatNumber(rowTotal)} prendas
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                            Planchado: <strong className="text-indigo-300">{formatNumber(hotelPlanchadoTotal)}</strong>
                          </span>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>
                            Secadoras: <strong className="text-teal-300">{formatNumber(hotelSecadoraTotal)}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {despacho && despacho.estado !== 'pendiente' && (
                          <button
                            type="button"
                            onClick={() => setModalDespacho(despacho)}
                            className="flex-1 py-2 px-3 rounded-xl bg-triton-deep border border-triton-slate/50 text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5"
                          >
                            <ShieldCheck className="w-4 h-4 text-cyan-400" />
                            <span>Ver Conciliación</span>
                          </button>
                        )}

                        {isLocked ? (
                          user?.rol === 'admin' ? (
                            <button
                              type="button"
                              onClick={() => handleReopenHotel(hotel)}
                              className="flex-1 py-2.5 px-3 rounded-xl bg-triton-deep text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700"
                            >
                              <Unlock className="w-4 h-4" />
                              <span>Reabrir Edición (Admin)</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 font-semibold">
                              Entrega cerrada por repartidor
                            </span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleValidarHotel(hotel)}
                            disabled={isValidatingThis}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-triton-teal hover:bg-triton-teal-light active:bg-[#108080] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-triton-teal/30"
                          >
                            <ClipboardCheck
                              className={`w-4 h-4 ${isValidatingThis ? 'animate-spin' : ''}`}
                            />
                            <span>
                              {isValidatingThis
                                ? 'Conciliando...'
                                : despacho
                                ? 'Re-validar contra Remito'
                                : 'Validar y Conciliar Remito'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Barra Inferior Fija en Mobile con Total General del Día */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-triton-navy/95 backdrop-blur-md border-t border-triton-slate/50 px-4 py-3 shadow-2xl">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total General del Día
              </span>
              <span className="text-lg font-black text-emerald-400">
                {formatNumber(grandTotal)}{' '}
                <span className="text-xs font-normal text-slate-400">prendas</span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleSaveBulk}
              disabled={savingBulk || loading}
              className="px-4 py-2.5 rounded-xl bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] disabled:opacity-50 text-triton-navy text-xs font-black flex items-center gap-1.5 shadow-lg shadow-triton-aqua/30"
            >
              <Save className={`w-4 h-4 ${savingBulk ? 'animate-spin' : ''}`} />
              <span>{savingBulk ? 'Sincronizando...' : 'Sincronizar Todo'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VISTA WEB / DESKTOP (md:block): TABLA MATRIZ ORIGINAL INTACTA         */}
      {/* ===================================================================== */}
      <div className="hidden md:block bg-triton-navy/90 rounded-2xl border border-triton-slate/50 overflow-hidden shadow-2xl">
        <div
          tabIndex={0}
          role="region"
          aria-label="Matriz de carga diaria de planilla"
          className="overflow-x-auto max-h-[620px] relative"
        >
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-triton-deep sticky top-0 z-20 shadow-md">
              {/* Nivel 1: Agrupador Visual de Sectores (cuando se visualiza toda la planta) */}
              {selectedSector === 'all' && (
                <tr className="border-b border-triton-slate/60 text-center font-black uppercase text-[11px] tracking-wider">
                  <th className="px-4 py-2 sticky left-0 z-30 bg-triton-deep border-r border-triton-slate/50"></th>
                  {planchadoItems.length > 0 && (
                    <th
                      colSpan={planchadoItems.length}
                      className="py-1.5 px-3 bg-indigo-950/80 text-indigo-300 border-r border-indigo-800/60 font-black text-center"
                    >
                      🥌 SECTOR PLANCHADO / CALANDRA ({planchadoItems.length} prendas)
                    </th>
                  )}
                  {secadoraItems.length > 0 && (
                    <th
                      colSpan={secadoraItems.length}
                      className="py-1.5 px-3 bg-teal-950/80 text-teal-300 border-r border-teal-800/60 font-black text-center"
                    >
                      🌀 SECTOR SECADORAS / FELPA ({secadoraItems.length} prendas)
                    </th>
                  )}
                  <th className="px-3 py-2 bg-triton-deep border-l border-triton-slate/50"></th>
                  <th className="px-4 py-2 xl:sticky xl:right-0 z-30 bg-triton-deep border-l border-triton-slate/50"></th>
                </tr>
              )}
              {/* Nivel 2: Prendas Individuales */}
              <tr className="border-b border-triton-slate/50 text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 sticky left-0 z-30 bg-triton-deep min-w-[200px] font-bold text-white border-r border-triton-slate/50">
                  Hotel / Cliente
                </th>
                {desktopVisibleItems.map((item) => (
                  <th
                    key={item.id}
                    className={`px-3 py-2 text-center min-w-[85px] font-bold ${
                      item.sector === 'planchado'
                        ? 'text-indigo-200 bg-indigo-950/30 border-r border-indigo-900/30'
                        : 'text-teal-200 bg-teal-950/30 border-r border-teal-900/30'
                    }`}
                  >
                    <div>{item.nombre}</div>
                    <span className="text-[9px] font-normal opacity-70 block capitalize">
                      {item.sector === 'planchado' ? 'Planchado' : 'Secadora'}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 text-right min-w-[90px] font-bold text-cyan-400 border-l border-triton-slate/50 bg-triton-deep">
                  Total Fila
                </th>
                <th className="px-4 py-3 text-center xl:sticky xl:right-0 z-30 bg-triton-deep min-w-[215px] font-bold text-white border-l border-triton-slate/50">
                  Check / Conciliar Remito
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-triton-slate/40 bg-triton-navy/40">
              {loading ? (
                <tr>
                  <td colSpan={desktopVisibleItems.length + 3} className="px-4 py-16 text-center text-slate-400">
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
                      className={`hover:bg-triton-deep/40 transition-colors ${
                        isLocked
                          ? 'bg-emerald-950/10 opacity-90'
                          : rowTotal > 0
                          ? 'bg-brand-950/15'
                          : ''
                      }`}
                    >
                      {/* Nombre del Hotel (Sticky izquierda) */}
                      <td className="px-4 py-2 sticky left-0 z-10 bg-triton-navy font-bold text-slate-200 border-r border-triton-slate/50">
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

                      {/* Inputs de Cantidad con Auto-Save on Blur (desktopVisibleItems) */}
                      {desktopVisibleItems.map((item) => {
                        const cellKey = `${hotel.id}-${item.id}`;
                        const qty = grid[hotel.id]?.[item.id] ?? 0;
                        const isSavingThis = savingCells.has(cellKey);
                        const isSavedThis = savedCells.has(cellKey);

                        return (
                          <td key={item.id} className="p-1 text-center border-r border-triton-slate/50/40">
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
                                  : 'bg-triton-deep border-triton-slate/50 text-slate-400 hover:border-slate-500 focus:border-triton-aqua focus:text-white'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Total de Fila */}
                      <td className="px-3 py-2 text-right bg-triton-navy font-black text-cyan-300 border-l border-triton-slate/50">
                        {formatNumber(rowTotal)}
                      </td>

                      {/* Check de Validación / Conciliar con Remito (Sticky derecha en pantallas amplias) */}
                      <td className="px-3 py-2 xl:sticky xl:right-0 z-10 bg-triton-navy border-l border-triton-slate/50">
                        <div className="flex items-center justify-between gap-1.5">
                          {/* Estado actual */}
                          <div className="flex-1 min-w-0">
                            {!despacho || despacho.estado === 'pendiente' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-triton-deep border border-triton-slate/50 px-2 py-0.5 rounded-full">
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
                                className="px-2 py-1 rounded-lg bg-triton-deep hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 border border-slate-700 shrink-0"
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
                              className="px-2.5 py-1 rounded-lg bg-triton-teal hover:bg-triton-teal-light disabled:opacity-50 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all shrink-0"
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
              <tfoot className="bg-triton-deep sticky bottom-0 z-20 border-t-2 border-triton-slate/50 font-bold">
                <tr>
                  <td className="px-4 py-3 sticky left-0 z-30 bg-triton-deep text-white border-r border-triton-slate/50 uppercase tracking-wider text-xs">
                    TOTAL GENERAL DEL DÍA
                  </td>
                  {desktopVisibleItems.map((item) => {
                    const colTotal = getColumnTotal(item.id);
                    return (
                      <td key={item.id} className="px-3 py-3 text-center text-slate-200 border-r border-triton-slate/50/40 font-extrabold">
                        {formatNumber(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right bg-triton-deep text-emerald-400 border-l border-triton-slate/50 text-sm font-black">
                    {formatNumber(grandTotal)}
                  </td>
                  <td className="px-4 py-3 text-center xl:sticky xl:right-0 z-30 bg-triton-deep text-slate-400 border-l border-triton-slate/50 text-[10px]">
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-triton-navy border border-triton-slate/50 rounded-2xl max-w-2xl w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="p-4 sm:p-5 bg-triton-deep border-b border-triton-slate/50 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
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
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-lg font-black text-white truncate">
                    Conciliación: {modalDespacho.hotel_nombre}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                    Fecha: <span className="text-slate-200 font-semibold">{formatDateDisplay(modalDespacho.fecha)}</span>
                    {modalDespacho.codigo_qr && (
                      <>
                        {' '}
                        &bull; Remito QR: <span className="font-mono text-triton-aqua-light">{modalDespacho.codigo_qr}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalDespacho(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-triton-deep shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Banner de Alerta Visual y Aviso enviado al Repartidor */}
              {modalDespacho.estado === 'validado_con_diferencia' ? (
                <div className="p-3.5 sm:p-4 rounded-xl bg-amber-950/60 border border-amber-700/80 text-amber-200 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-amber-300 text-xs sm:text-sm">
                      ¡Diferencia detectada contra el Remito del Hotel!
                    </p>
                    <p>
                      Se emitió una <strong>alerta automática al Repartidor</strong> adjuntando la muestra detallada de lo procesado para su control antes de retirar y entregar el pedido.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-950/60 border border-emerald-700/80 text-emerald-200 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black text-emerald-300 text-xs sm:text-sm">
                      ¡Carga Validada sin Diferencias (OK)!
                    </p>
                    <p>
                      La cantidad procesada coincide exactamente con el remito. Se notificó al <strong>Repartidor</strong> que la carga y su muestra están listas para despacho.
                    </p>
                  </div>
                </div>
              )}

              {/* Tarjetas Comparativas: Remito vs. Procesado */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-triton-deep border border-triton-slate/50 rounded-xl p-2.5 sm:p-3.5 text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Cant. Remito
                  </span>
                  <p className="text-base sm:text-xl font-black text-white mt-1">
                    {formatNumber(modalDespacho.total_remito_prendas)} <span className="text-[10px] sm:text-xs font-normal text-slate-400">u.</span>
                  </p>
                </div>

                <div className="bg-triton-deep border border-triton-slate/50 rounded-xl p-2.5 sm:p-3.5 text-center">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                    Procesada
                  </span>
                  <p className="text-base sm:text-xl font-black text-cyan-300 mt-1">
                    {formatNumber(modalDespacho.total_procesado_prendas)} <span className="text-[10px] sm:text-xs font-normal text-slate-400">u.</span>
                  </p>
                  {modalDespacho.total_procesado_kilos > 0 && (
                    <p className="text-[10px] text-slate-400">
                      ({modalDespacho.total_procesado_kilos.toFixed(2)} kg)
                    </p>
                  )}
                </div>

                <div
                  className={`rounded-xl p-2.5 sm:p-3.5 text-center border ${
                    modalDespacho.diferencia_prendas === 0
                      ? 'bg-emerald-950/30 border-emerald-800/60'
                      : 'bg-amber-950/30 border-amber-800/60'
                  }`}
                >
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 block">
                    Diferencia
                  </span>
                  <p
                    className={`text-base sm:text-xl font-black mt-1 ${
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
                    <span className="text-[10px] sm:text-xs font-normal">u.</span>
                  </p>
                </div>
              </div>

              {/* Muestra Procesada Ítem por Ítem */}
              <div className="rounded-xl border border-triton-slate/50 overflow-hidden">
                <div className="bg-triton-deep px-3.5 sm:px-4 py-2.5 border-b border-triton-slate/50 flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-wider">
                    Muestra enviada al Repartidor
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {modalDespacho.muestra_procesado.length} ítems
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-triton-deep/70 text-slate-400 uppercase text-[10px] border-b border-triton-slate/50">
                      <tr>
                        <th className="px-3 sm:px-4 py-2.5">Ítem / Prenda</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right">Remito</th>
                        <th className="px-2 sm:px-3 py-2.5 text-right text-cyan-400">Procesado</th>
                        <th className="px-3 sm:px-4 py-2.5 text-right">Dif.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-triton-slate/40">
                      {modalDespacho.muestra_procesado.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                            No hay prendas registradas ni en remito ni en carga para este hotel en la fecha.
                          </td>
                        </tr>
                      ) : (
                        modalDespacho.muestra_procesado.map((m) => (
                          <tr key={m.item_id} className="hover:bg-triton-deep/30">
                            <td className="px-3 sm:px-4 py-2 font-bold text-white">{m.item_nombre}</td>
                            <td className="px-2 sm:px-3 py-2 text-right text-slate-300 font-semibold">
                              {formatNumber(m.cant_remito)}
                            </td>
                            <td className="px-2 sm:px-3 py-2 text-right font-black text-cyan-300">
                              {formatNumber(m.cant_procesada_prendas)} u.
                              {m.cant_procesada_kilos > 0 && (
                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                  ({m.cant_procesada_kilos.toFixed(1)} kg)
                                </span>
                              )}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-right font-bold">
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
            </div>

            <div className="p-3.5 sm:p-4 bg-triton-deep border-t border-triton-slate/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-slate-400 text-center sm:text-left">
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
                className="px-4 py-2.5 sm:py-2 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] text-triton-navy text-xs font-black rounded-xl shadow-md shadow-triton-aqua/20"
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
