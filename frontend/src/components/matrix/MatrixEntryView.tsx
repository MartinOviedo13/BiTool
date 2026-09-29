import React, { useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
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
  // Registros preexistentes de la fecha, para detectar celdas que se vaciaron
  const [existingRegistros, setExistingRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Load catalogs and date records
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

      // Build initial grid
      const newGrid: Record<number, Record<number, number>> = {};
      activeHotels.forEach((h) => {
        newGrid[h.id] = {};
        itemsData.forEach((i) => {
          newGrid[h.id][i.id] = 0;
        });
      });

      // Populate existing records
      registrosData.forEach((r) => {
        if (newGrid[r.hotel_id]) {
          newGrid[r.hotel_id][r.item_id] = r.cantidad;
        }
      });

setGrid(newGrid);
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
  }, [selectedDate]);

  const handleCellChange = (hotelId: number, itemId: number, valStr: string) => {
    const parsed = parseInt(valStr, 10);
    const qty = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    setGrid((prev) => ({
      ...prev,
      [hotelId]: {
        ...(prev[hotelId] || {}),
        [itemId]: qty,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
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
        setStatusMessage({ type: 'error', text: 'No hay cantidades mayores a 0 para guardar.' });
        setSaving(false);
        return;
      }

      const res = await api.createRegistrosBatch(batchItems);
      await loadMatrix(selectedDate);
      setStatusMessage({
        type: 'success',
        text: `¡Planilla guardada con éxito! Se sincronizaron ${res.count} valores para el día ${formatDateDisplay(selectedDate)}.`,
      });
    } catch (err: any) {
      console.error('Error guardando registros:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Error al guardar la planilla.' });
    } finally {
      setSaving(false);
    }
  };

  // Row totals (hotel)
  const getRowTotal = (hotelId: number) => {
    const row = grid[hotelId];
    if (!row) return 0;
    return Object.values(row).reduce((sum, val) => sum + (val || 0), 0);
  };

  // Column totals (item)
  const getColumnTotal = (itemId: number) => {
    return Object.values(grid).reduce((sum, row) => sum + (row[itemId] || 0), 0);
  };

  // Grand total
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
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-brand-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Carga Diaria de Planilla</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Matriz operativa digital: Hoteles en filas $\times$ Prendas en columnas
          </p>
        </div>

        {/* Date Selector & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <Calendar className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-semibold text-slate-300">Fecha:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-medium"
            />
          </div>

          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar hotel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-48"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-600/30 transition-all disabled:opacity-50"
          >
            <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Guardando...' : 'Guardar Planilla'}</span>
          </button>
        </div>
      </div>

      {/* Status Alert */}
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

      {/* Matrix Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto max-h-[600px] relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 sticky top-0 z-20 shadow-md">
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3 sticky left-0 z-30 bg-slate-950 min-w-[180px] font-bold text-slate-200 border-r border-slate-800">
                  Hotel / Cliente
                </th>
                {items.map((item) => (
                  <th
                    key={item.id}
                    className={`px-3 py-3 text-center min-w-[80px] font-semibold ${
                      !item.se_factura ? 'text-amber-400 bg-amber-950/30' : 'text-slate-300'
                    }`}
                  >
                    <div>{item.nombre}</div>
                    {!item.se_factura && <span className="text-[9px] lowercase font-normal">(relav)</span>}
                  </th>
                ))}
                <th className="px-4 py-3 text-right sticky right-0 z-30 bg-slate-950 min-w-[90px] font-bold text-brand-400 border-l border-slate-800">
                  Total Fila
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {loading ? (
                <tr>
                  <td colSpan={items.length + 2} className="px-4 py-12 text-center text-slate-500">
                    Cargando matriz operativa...
                  </td>
                </tr>
              ) : (
                filteredHoteles.map((hotel) => {
                  const rowTotal = getRowTotal(hotel.id);
                  return (
                    <tr
                      key={hotel.id}
                      className={`hover:bg-slate-800/40 transition-colors ${rowTotal > 0 ? 'bg-brand-950/10' : ''}`}
                    >
                      {/* Sticky Hotel Name */}
                      <td className="px-4 py-2 sticky left-0 z-10 bg-slate-900 font-semibold text-slate-200 border-r border-slate-800 truncate">
                        {hotel.nombre}
                      </td>

                      {/* Items Inputs */}
                      {items.map((item) => {
                        const qty = grid[hotel.id]?.[item.id] ?? 0;
                        return (
                          <td key={item.id} className="p-1 text-center border-r border-slate-800/40">
                            <input
                              type="number"
                              min="0"
                              value={qty === 0 ? '' : qty}
                              placeholder="0"
                              onChange={(e) => handleCellChange(hotel.id, item.id, e.target.value)}
                              className={`w-full py-1.5 px-2 text-center rounded-lg border text-xs font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-brand-400 ${
                                qty > 0
                                  ? 'bg-brand-950/80 border-brand-700 text-white font-bold'
                                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Row Total */}
                      <td className="px-4 py-2 text-right sticky right-0 z-10 bg-slate-900 font-extrabold text-brand-300 border-l border-slate-800">
                        {formatNumber(rowTotal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer Totals */}
            {!loading && (
              <tfoot className="bg-slate-950 sticky bottom-0 z-20 border-t-2 border-slate-700 font-bold">
                <tr>
                  <td className="px-4 py-3 sticky left-0 z-30 bg-slate-950 text-slate-200 border-r border-slate-800">
                    TOTAL GENERAL DEL DÍA
                  </td>
                  {items.map((item) => {
                    const colTotal = getColumnTotal(item.id);
                    return (
                      <td key={item.id} className="px-3 py-3 text-center text-slate-200 border-r border-slate-800/40">
                        {formatNumber(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right sticky right-0 z-30 bg-slate-950 text-emerald-400 border-l border-slate-800 text-sm">
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
