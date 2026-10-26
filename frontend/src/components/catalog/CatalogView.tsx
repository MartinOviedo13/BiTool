import React, { useEffect, useState } from 'react';
import {
  Building2,
  Shirt,
  Plus,
  Check,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Hotel, Item } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export const CatalogView: React.FC = () => {
  const [tab, setTab] = useState<'hoteles' | 'items'>('hoteles');
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // New hotel state
  const [newHotelName, setNewHotelName] = useState<string>('');
  const [addingHotel, setAddingHotel] = useState<boolean>(false);

  // New item state
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [newItemSeFactura, setNewItemSeFactura] = useState<boolean>(true);
  const [addingItem, setAddingItem] = useState<boolean>(false);

  // Editing price state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCatalogs = async () => {
    setLoading(true);
    try {
      const [hotelesData, itemsData] = await Promise.all([api.getHoteles(), api.getItems()]);
      setHoteles(hotelesData);
      setItems(itemsData);
    } catch (err) {
      console.error('Error cargando catálogos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  const handleToggleHotel = async (hotel: Hotel) => {
    try {
      const updated = await api.updateHotel(hotel.id, { activo: !hotel.activo });
      setHoteles((prev) => prev.map((h) => (h.id === hotel.id ? updated : h)));
      setStatusMessage({
        type: 'success',
        text: `Hotel "${hotel.nombre}" ${updated.activo ? 'activado' : 'desactivado'}.`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error actualizando hotel.' });
    }
  };

  const handleAddHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHotelName.trim()) return;
    try {
      const created = await api.createHotel(newHotelName.trim());
      setHoteles((prev) => [...prev, created]);
      setNewHotelName('');
      setAddingHotel(false);
      setStatusMessage({ type: 'success', text: `Hotel "${created.nombre}" creado exitosamente.` });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creando hotel.' });
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      const price = newItemPrice ? parseFloat(newItemPrice) : null;
      const created = await api.createItem({
        nombre: newItemName.trim(),
        precio_unitario: price,
        se_factura: newItemSeFactura,
      });
      setItems((prev) => [...prev, created]);
      setNewItemName('');
      setNewItemPrice('');
      setNewItemSeFactura(true);
      setAddingItem(false);
      setStatusMessage({ type: 'success', text: `Prenda "${created.nombre}" agregada exitosamente.` });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error agregando prenda.' });
    }
  };

  const handleSavePrice = async (item: Item) => {
    try {
      const price = editPriceValue === '' ? null : parseFloat(editPriceValue);
      const updated = await api.updateItem(item.id, { precio_unitario: price });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setEditingItemId(null);
      setStatusMessage({ type: 'success', text: `Precio actualizado para "${item.nombre}".` });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error actualizando precio.' });
    }
  };

  const filteredHoteles = hoteles.filter((h) => h.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredItems = items.filter((i) => i.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header & Sub-Tabs */}
      <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="grid grid-cols-2 sm:flex items-center gap-1 bg-triton-deep p-1 rounded-xl border border-triton-slate/50 w-full sm:w-auto">
            <button
              onClick={() => setTab('hoteles')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'hoteles'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-triton-deep'
              }`}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate">Hoteles ({hoteles.length})</span>
            </button>
            <button
              onClick={() => setTab('items')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'items'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-triton-deep'
              }`}
            >
              <Shirt className="h-4 w-4 shrink-0" />
              <span className="truncate">Prendas ({items.length})</span>
            </button>
          </div>
        </div>

        {/* Search & Add Action */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar ${tab === 'hoteles' ? 'hotel' : 'prenda'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-52"
            />
          </div>

          {tab === 'hoteles' ? (
            <button
              onClick={() => setAddingHotel(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Hotel</span>
            </button>
          ) : (
            <button
              onClick={() => setAddingItem(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva Prenda</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Message */}
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

      {/* New Hotel Modal / Inline Form */}
      {addingHotel && (
        <div className="bg-triton-navy p-4 rounded-2xl border border-brand-500/40 animate-fadeIn">
          <form onSubmit={handleAddHotel} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Nombre del nuevo hotel / cliente..."
              value={newHotelName}
              onChange={(e) => setNewHotelName(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua flex-1 min-w-[200px]"
              autoFocus
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-4 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-colors"
              >
                Crear Hotel
              </button>
              <button
                type="button"
                onClick={() => setAddingHotel(false)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-triton-deep hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Item Modal / Inline Form */}
      {addingItem && (
        <div className="bg-triton-navy p-4 rounded-2xl border border-brand-500/40 animate-fadeIn">
          <form onSubmit={handleAddItem} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Nombre de la prenda / concepto..."
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua flex-1 min-w-[200px]"
              autoFocus
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio unitario ($)..."
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-36"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newItemSeFactura}
                onChange={(e) => setNewItemSeFactura(e.target.checked)}
                className="rounded border-triton-slate/60 text-brand-600 focus:ring-brand-500"
              />
              <span>Es Facturable</span>
            </label>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-4 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-colors"
              >
                Guardar Prenda
              </button>
              <button
                type="button"
                onClick={() => setAddingItem(false)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-triton-deep hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Catalog Content: Mobile Cards + Desktop Table */}
      <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 overflow-hidden shadow-xl">
        {tab === 'hoteles' ? (
          <>
            {/* Mobile Cards for Hoteles */}
            <div className="md:hidden divide-y divide-slate-800">
              {loading ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">Cargando catálogo...</div>
              ) : (
                filteredHoteles.map((hotel) => (
                  <div key={hotel.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-mono">#{hotel.id}</span>
                        <span className="text-sm font-bold text-slate-100 truncate">{hotel.nombre}</span>
                      </div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            hotel.activo
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-triton-deep text-slate-400 border-triton-slate/60'
                          }`}
                        >
                          {hotel.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleHotel(hotel)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                        hotel.activo
                          ? 'bg-rose-950/60 active:bg-rose-900 text-rose-300 border border-rose-800'
                          : 'bg-emerald-950/60 active:bg-emerald-900 text-emerald-300 border border-emerald-800'
                      }`}
                    >
                      {hotel.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table for Hoteles */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-triton-deep text-slate-400 uppercase tracking-wider font-semibold border-b border-triton-slate/50">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nombre del Hotel</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        Cargando catálogo...
                      </td>
                    </tr>
                  ) : (
                    filteredHoteles.map((hotel) => (
                      <tr key={hotel.id} className="hover:bg-triton-deep/60 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-mono">#{hotel.id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-200">{hotel.nombre}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              hotel.activo
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-triton-deep text-slate-400 border-triton-slate/60'
                            }`}
                          >
                            {hotel.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleToggleHotel(hotel)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              hotel.activo
                                ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {hotel.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Mobile Cards for Prendas */}
            <div className="md:hidden divide-y divide-slate-800">
              {filteredItems.map((item) => (
                <div key={item.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-mono">#{item.id}</span>
                        <span className="text-sm font-bold text-slate-100">{item.nombre}</span>
                      </div>
                      <span
                        className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          item.se_factura
                            ? 'bg-brand-950 text-brand-300 border-brand-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {item.se_factura ? 'Facturable' : 'Relavado (No facturable)'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Precio Unit.</span>
                      <span className="text-sm font-black text-slate-100">
                        {item.precio_unitario != null ? formatCurrency(item.precio_unitario) : 'Sin precio'}
                      </span>
                    </div>
                  </div>

                  {editingItemId === item.id ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        step="0.01"
                        value={editPriceValue}
                        onChange={(e) => setEditPriceValue(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-triton-deep border border-brand-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSavePrice(item)}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Guardar</span>
                      </button>
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="p-2 bg-triton-deep text-slate-300 rounded-xl"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditPriceValue(item.precio_unitario != null ? item.precio_unitario.toString() : '');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-triton-deep active:bg-slate-700 text-slate-200 border border-triton-slate/60"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Editar Precio</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table for Prendas */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-triton-deep text-slate-400 uppercase tracking-wider font-semibold border-b border-triton-slate/50">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Tipo de Prenda / Concepto</th>
                    <th className="px-4 py-3">Tipo de Facturación</th>
                    <th className="px-4 py-3 text-right">Precio Unitario</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-triton-deep/60 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono">#{item.id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{item.nombre}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            item.se_factura
                              ? 'bg-brand-950 text-brand-300 border-brand-800'
                              : 'bg-amber-950 text-amber-300 border-amber-800'
                          }`}
                        >
                          {item.se_factura ? 'Facturable' : 'Relavado (No facturable)'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {editingItemId === item.id ? (
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              step="0.01"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              placeholder="0.00"
                              className="bg-triton-deep border border-brand-500 rounded px-2 py-1 text-xs text-white w-24 text-right focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSavePrice(item)}
                              className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-500"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingItemId(null)}
                              className="p-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-200">
                            {item.precio_unitario != null ? formatCurrency(item.precio_unitario) : 'Sin precio'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingItemId !== item.id && (
                          <button
                            onClick={() => {
                              setEditingItemId(item.id);
                              setEditPriceValue(item.precio_unitario != null ? item.precio_unitario.toString() : '');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-triton-deep hover:bg-slate-700 text-slate-200 border border-triton-slate/60 transition-colors"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Editar Precio</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
