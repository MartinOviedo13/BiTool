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
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error actualizando hotel.' });
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
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error creando hotel.' });
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
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error agregando prenda.' });
    }
  };

  const handleSavePrice = async (item: Item) => {
    try {
      const price = editPriceValue === '' ? null : parseFloat(editPriceValue);
      const updated = await api.updateItem(item.id, { precio_unitario: price });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setEditingItemId(null);
      setStatusMessage({ type: 'success', text: `Precio actualizado para "${item.nombre}".` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error actualizando precio.' });
    }
  };

  const filteredHoteles = hoteles.filter((h) => h.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredItems = items.filter((i) => i.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tabs */}
      <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setTab('hoteles')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'hoteles'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Hoteles ({hoteles.length})</span>
            </button>
            <button
              onClick={() => setTab('items')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'items'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Shirt className="h-4 w-4" />
              <span>Prendas & Precios ({items.length})</span>
            </button>
          </div>
        </div>

        {/* Search & Add Action */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar ${tab === 'hoteles' ? 'hotel' : 'prenda'}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-52"
            />
          </div>

          {tab === 'hoteles' ? (
            <button
              onClick={() => setAddingHotel(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-600/20"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Hotel</span>
            </button>
          ) : (
            <button
              onClick={() => setAddingItem(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-600/20"
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
        <div className="bg-slate-900 p-4 rounded-2xl border border-brand-500/40 animate-fadeIn">
          <form onSubmit={handleAddHotel} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Nombre del nuevo hotel / cliente..."
              value={newHotelName}
              onChange={(e) => setNewHotelName(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 flex-1 min-w-[240px]"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Crear Hotel
            </button>
            <button
              type="button"
              onClick={() => setAddingHotel(false)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* New Item Modal / Inline Form */}
      {addingItem && (
        <div className="bg-slate-900 p-4 rounded-2xl border border-brand-500/40 animate-fadeIn">
          <form onSubmit={handleAddItem} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Nombre de la prenda / concepto..."
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 flex-1 min-w-[200px]"
              autoFocus
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio unitario ($)..."
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 w-36"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newItemSeFactura}
                onChange={(e) => setNewItemSeFactura(e.target.checked)}
                className="rounded border-slate-700 text-brand-600 focus:ring-brand-500"
              />
              <span>Es Facturable</span>
            </label>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Guardar Prenda
            </button>
            <button
              type="button"
              onClick={() => setAddingItem(false)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* Catalog Table */}
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {tab === 'hoteles' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
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
                ) : filteredHoteles.map((hotel) => (
                  <tr key={hotel.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono">#{hotel.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200">{hotel.nombre}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          hotel.activo
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
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
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
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
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
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
                            className="bg-slate-950 border border-brand-500 rounded px-2 py-1 text-xs text-white w-24 text-right focus:outline-none"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
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
        )}
      </div>
    </div>
  );
};
