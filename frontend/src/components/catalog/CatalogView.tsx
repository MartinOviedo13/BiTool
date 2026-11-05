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
  MessageSquare,
  Send,
  QrCode,
  RefreshCw,
  Users,
  History,
} from 'lucide-react';
import { api } from '../../api/client';
import { Hotel, Item, User, WhatsAppStatus, WhatsAppQRCodeResponse, WhatsAppLogEntry } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export const CatalogView: React.FC = () => {
  const [tab, setTab] = useState<'hoteles' | 'items' | 'personal' | 'whatsapp_logs'>('hoteles');
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // New usuario state
  const [newUsuarioUsername, setNewUsuarioUsername] = useState<string>('');
  const [newUsuarioPassword, setNewUsuarioPassword] = useState<string>('');
  const [newUsuarioRol, setNewUsuarioRol] = useState<string>('repartidor');
  const [newUsuarioPhone, setNewUsuarioPhone] = useState<string>('');
  const [addingUsuario, setAddingUsuario] = useState<boolean>(false);
  const [editingUsuarioId, setEditingUsuarioId] = useState<number | null>(null);
  const [editUsuarioPhone, setEditUsuarioPhone] = useState<string>('');
  const [sendingTestUsuarioId, setSendingTestUsuarioId] = useState<number | null>(null);

  // WhatsApp logs state
  const [waLogs, setWaLogs] = useState<WhatsAppLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // New hotel state
  const [newHotelName, setNewHotelName] = useState<string>('');
  const [newHotelPhone, setNewHotelPhone] = useState<string>('');
  const [addingHotel, setAddingHotel] = useState<boolean>(false);

  // WhatsApp states
  const [editingHotelId, setEditingHotelId] = useState<number | null>(null);
  const [editHotelPhone, setEditHotelPhone] = useState<string>('');
  const [editHotelWhatsAppActivo, setEditHotelWhatsAppActivo] = useState<boolean>(true);
  const [sendingTestHotelId, setSendingTestHotelId] = useState<number | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [qrData, setQrData] = useState<WhatsAppQRCodeResponse | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);

  const fetchQRCode = async () => {
    setLoadingQR(true);
    try {
      const res = await api.getWhatsAppQR();
      setQrData(res);
      if (res.conectado) {
        api.getWhatsAppStatus().then(setWaStatus).catch(() => {});
      }
    } catch (err) {
      console.error('Error obteniendo QR WhatsApp:', err);
    } finally {
      setLoadingQR(false);
    }
  };

  useEffect(() => {
    if (!connectModalOpen) return;
    fetchQRCode();
    const interval = setInterval(() => {
      fetchQRCode();
    }, 4000);
    return () => clearInterval(interval);
  }, [connectModalOpen]);

  // New item state
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');
  const [newItemSeFactura, setNewItemSeFactura] = useState<boolean>(true);
  const [newItemSector, setNewItemSector] = useState<'planchado' | 'secadora'>('planchado');
  const [addingItem, setAddingItem] = useState<boolean>(false);

  // Editing price state
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCatalogs = async () => {
    setLoading(true);
    try {
      const [hotelesData, itemsData, usuariosData, waData] = await Promise.all([
        api.getHoteles().catch((err) => {
          console.error('Error cargando hoteles:', err);
          return [] as Hotel[];
        }),
        api.getItems().catch((err) => {
          console.error('Error cargando prendas:', err);
          return [] as Item[];
        }),
        api.getUsuarios().catch(() => [] as User[]),
        api.getWhatsAppStatus().catch(() => null),
      ]);
      setHoteles(hotelesData);
      setItems(itemsData);
      setUsuarios(usuariosData);
      if (waData) setWaStatus(waData);
      if (hotelesData.length === 0 && itemsData.length === 0) {
        setStatusMessage({
          type: 'error',
          text: 'El servidor en Render se estaba reiniciando. Presiona "Refrescar" para volver a cargar los datos.',
        });
      }
    } catch (err) {
      console.error('Error cargando catálogos:', err);
      setStatusMessage({
        type: 'error',
        text: 'Error conectando con la base de datos. Por favor presiona "Refrescar".',
      });
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
      const created = await api.createHotel({
        nombre: newHotelName.trim(),
        telefono_whatsapp: newHotelPhone.trim() || undefined,
        whatsapp_activo: true,
      });
      setHoteles((prev) => [...prev, created]);
      setNewHotelName('');
      setNewHotelPhone('');
      setAddingHotel(false);
      setStatusMessage({ type: 'success', text: `Hotel "${created.nombre}" creado exitosamente.` });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creando hotel.' });
    }
  };

  const handleSaveHotelWhatsApp = async (hotelId: number) => {
    try {
      const updated = await api.updateHotel(hotelId, {
        telefono_whatsapp: editHotelPhone.trim(),
        whatsapp_activo: editHotelWhatsAppActivo,
      });
      setHoteles((prev) => prev.map((h) => (h.id === hotelId ? updated : h)));
      setEditingHotelId(null);
      setStatusMessage({
        type: 'success',
        text: `WhatsApp actualizado para "${updated.nombre}".`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error guardando WhatsApp.' });
    }
  };

  const handleTestWhatsApp = async (hotel: Hotel) => {
    if (!hotel.telefono_whatsapp) {
      alert('El hotel no tiene teléfono de WhatsApp configurado.');
      return;
    }
    setSendingTestHotelId(hotel.id);
    try {
      await api.testWhatsAppMessage({
        hotel_id: hotel.id,
        mensaje: `Hola ${hotel.nombre}! Mensaje de prueba de TRITÓN Lavadero Industrial confirmando conexión con WhatsApp.`,
      });
      setStatusMessage({
        type: 'success',
        text: `Mensaje de prueba enviado exitosamente al ${hotel.telefono_whatsapp} (${hotel.nombre}).`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error enviando prueba.' });
    } finally {
      setSendingTestHotelId(null);
    }
  };

  const loadWhatsAppLogs = async () => {
    setLoadingLogs(true);
    try {
      const logs = await api.getWhatsAppLogs();
      setWaLogs(logs);
    } catch (err) {
      console.error('Error cargando logs de WhatsApp:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (tab === 'whatsapp_logs') {
      loadWhatsAppLogs();
    }
  }, [tab]);

  const handleToggleUsuario = async (u: User) => {
    try {
      const updated = await api.updateUsuario(u.id, { activo: !u.activo });
      setUsuarios((prev) => prev.map((item) => (item.id === u.id ? updated : item)));
      setStatusMessage({
        type: 'success',
        text: `Usuario "${u.username}" ${updated.activo ? 'activado' : 'desactivado'}.`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error actualizando usuario.' });
    }
  };

  const handleAddUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsuarioUsername.trim() || !newUsuarioPassword.trim()) {
      alert('Usuario y contraseña requeridos.');
      return;
    }
    try {
      const created = await api.createUsuario({
        username: newUsuarioUsername.trim(),
        password: newUsuarioPassword.trim(),
        rol: newUsuarioRol,
        telefono_whatsapp: newUsuarioPhone.trim() || undefined,
      });
      setUsuarios((prev) => [...prev, created]);
      setNewUsuarioUsername('');
      setNewUsuarioPassword('');
      setNewUsuarioPhone('');
      setAddingUsuario(false);
      setStatusMessage({
        type: 'success',
        text: `Personal/Chofer "${created.username}" creado exitosamente.`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creando usuario.' });
    }
  };

  const handleSaveUsuarioWhatsApp = async (userId: number) => {
    try {
      const updated = await api.updateUsuario(userId, {
        telefono_whatsapp: editUsuarioPhone.trim(),
      });
      setUsuarios((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      setEditingUsuarioId(null);
      setStatusMessage({
        type: 'success',
        text: `WhatsApp actualizado para "${updated.username}".`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error guardando WhatsApp.' });
    }
  };

  const handleTestUsuarioWhatsApp = async (u: User) => {
    if (!u.telefono_whatsapp) {
      alert('El usuario no tiene teléfono de WhatsApp configurado.');
      return;
    }
    setSendingTestUsuarioId(u.id);
    try {
      await api.testWhatsAppMessage({
        telefono: u.telefono_whatsapp,
        mensaje: `Hola ${u.username}! Mensaje de prueba de TRITÓN Lavadero confirmando tu número para alertas de hoja de ruta.`,
      });
      setStatusMessage({
        type: 'success',
        text: `Mensaje de prueba enviado exitosamente al ${u.telefono_whatsapp} (${u.username}).`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error enviando prueba.' });
    } finally {
      setSendingTestUsuarioId(null);
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
        sector: newItemSector,
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
  const filteredUsuarios = usuarios.filter((u) =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.rol && u.rol.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.telefono_whatsapp && u.telefono_whatsapp.includes(searchTerm))
  );
  const filteredLogs = waLogs.filter((l) =>
    l.telefono.includes(searchTerm) ||
    l.tipo_evento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.mensaje.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.estado.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.hotel_nombre && l.hotel_nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (l.usuario_nombre && l.usuario_nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stitch Client & Garment Directory Header */}
      <div className="stitch-panel p-3.5 sm:p-4 bg-triton-navy/95 border border-triton-slate/50 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-triton-teal/20 border border-triton-teal/40 text-triton-aqua flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-triton-aqua">Catálogo & Directorio B2B</span>
              <span className="stitch-telemetry-pill text-[9px] py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Clientes & Personal
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Gestión de clientes, convenios comerciales, choferes y canal de WhatsApp automático.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono-tabular text-xs text-slate-300 bg-triton-deep px-3 py-1.5 rounded-lg border border-triton-slate/40">
          <span>{hoteles.filter(h => h.activo).length} Hoteles</span>
          <span className="text-slate-500">•</span>
          <span>{usuarios.length} Usuarios/Choferes</span>
          <span className="text-slate-500">•</span>
          <span>{items.length} Prendas</span>
        </div>
      </div>

      {/* Top Header & Sub-Tabs */}
      <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="grid grid-cols-2 lg:flex items-center gap-1 bg-triton-deep p-1 rounded-xl border border-triton-slate/50 w-full sm:w-auto">
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
              onClick={() => setTab('personal')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'personal'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-triton-deep'
              }`}
            >
              <Users className="h-4 w-4 shrink-0" />
              <span className="truncate">Choferes & Personal ({usuarios.length})</span>
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
            <button
              onClick={() => setTab('whatsapp_logs')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === 'whatsapp_logs'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-triton-deep'
              }`}
            >
              <History className="h-4 w-4 shrink-0" />
              <span className="truncate">Historial WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Search & Add Action */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={
                tab === 'hoteles'
                  ? 'Buscar hotel...'
                  : tab === 'personal'
                  ? 'Buscar chofer/personal...'
                  : tab === 'whatsapp_logs'
                  ? 'Buscar en mensajes...'
                  : 'Buscar prenda...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-52"
            />
          </div>

          {tab === 'hoteles' && (
            <button
              onClick={() => setAddingHotel(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Hotel</span>
            </button>
          )}

          {tab === 'personal' && (
            <button
              onClick={() => setAddingUsuario(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Personal</span>
            </button>
          )}

          {tab === 'items' && (
            <button
              onClick={() => setAddingItem(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/25 shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Nueva Prenda</span>
            </button>
          )}

          <button
            onClick={() => {
              loadCatalogs();
              if (tab === 'whatsapp_logs') loadWhatsAppLogs();
            }}
            disabled={loading || loadingLogs}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-triton-deep hover:bg-slate-700 text-slate-200 border border-triton-slate/50 rounded-xl text-xs font-bold transition-all shrink-0"
            title="Recargar datos del catálogo y servidor"
          >
            <RefreshCw className={`h-4 w-4 ${loading || loadingLogs ? 'animate-spin text-triton-aqua' : ''}`} />
            <span>Refrescar</span>
          </button>
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
            <input
              type="text"
              placeholder="WhatsApp Notificaciones (ej. 3514567890)..."
              value={newHotelPhone}
              onChange={(e) => setNewHotelPhone(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-56"
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
            <select
              value={newItemSector}
              onChange={(e) => setNewItemSector(e.target.value as 'planchado' | 'secadora')}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-triton-aqua"
            >
              <option value="planchado">🥌 Sector Planchado / Calandra</option>
              <option value="secadora">🌀 Sector Secadoras / Felpa</option>
            </select>
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

      {/* New Usuario Modal / Inline Form */}
      {addingUsuario && (
        <div className="bg-triton-navy p-4 rounded-2xl border border-brand-500/40 animate-fadeIn">
          <form onSubmit={handleAddUsuario} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Nombre de usuario (login)..."
              value={newUsuarioUsername}
              onChange={(e) => setNewUsuarioUsername(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua flex-1 min-w-[160px]"
              autoFocus
              required
            />
            <input
              type="password"
              placeholder="Contraseña inicial..."
              value={newUsuarioPassword}
              onChange={(e) => setNewUsuarioPassword(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-44"
              required
            />
            <select
              value={newUsuarioRol}
              onChange={(e) => setNewUsuarioRol(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-triton-aqua"
            >
              <option value="repartidor">🚚 Chofer / Repartidor</option>
              <option value="operario">⚙️ Operario de Planta</option>
              <option value="admin">🛡️ Administrador</option>
              <option value="cliente">🏨 Cliente Hotel</option>
            </select>
            <input
              type="text"
              placeholder="WhatsApp (ej. 3514567890)..."
              value={newUsuarioPhone}
              onChange={(e) => setNewUsuarioPhone(e.target.value)}
              className="bg-triton-deep border border-triton-slate/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-52"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-4 py-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy rounded-xl text-xs font-black transition-colors"
              >
                Crear Usuario
              </button>
              <button
                type="button"
                onClick={() => setAddingUsuario(false)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-triton-deep hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp Gateway Status Bar */}
      {(tab === 'hoteles' || tab === 'personal' || tab === 'whatsapp_logs') && waStatus && (
        <div className="bg-triton-navy/95 border border-triton-slate/50 rounded-2xl p-3 sm:p-4 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${waStatus.habilitado ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className="font-bold text-white flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Notificaciones WhatsApp (Evolution API)
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${waStatus.habilitado ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'}`}>
              {waStatus.habilitado ? 'Canal Activo' : 'Simulación'}
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5 text-slate-300 text-[11px] font-mono">
            <span>Enviados (24h): <b className="text-emerald-400 font-bold">{waStatus.mensajes_enviados_24h}</b></span>
            <span>Recibidos (24h): <b className="text-triton-aqua font-bold">{waStatus.mensajes_recibidos_24h}</b></span>
            {waStatus.fallidos_24h > 0 && (
              <span className="text-rose-400 font-bold">Fallidos: {waStatus.fallidos_24h}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setConnectModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Conectar WhatsApp del Lavadero</span>
          </button>
        </div>
      )}

      {/* Catalog Content: Mobile Cards + Desktop Table */}
      <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 overflow-hidden shadow-xl">
        {tab === 'hoteles' && (
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
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            hotel.activo
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-triton-deep text-slate-400 border-triton-slate/60'
                          }`}
                        >
                          {hotel.activo ? 'Activo' : 'Inactivo'}
                        </span>
                        {hotel.telefono_whatsapp && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                            <MessageSquare className="w-2.5 h-2.5 text-emerald-400" />
                            {hotel.telefono_whatsapp}
                          </span>
                        )}
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
                    <th className="px-4 py-3">WhatsApp Notificaciones</th>
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
                        <td className="px-4 py-3">
                          {editingHotelId === hotel.id ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input
                                type="text"
                                placeholder="Ej: 3514567890"
                                value={editHotelPhone}
                                onChange={(e) => setEditHotelPhone(e.target.value)}
                                className="bg-triton-deep border border-triton-slate/60 rounded px-2 py-1 text-xs text-white w-32 focus:border-triton-aqua"
                                autoFocus
                              />
                              <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editHotelWhatsAppActivo}
                                  onChange={(e) => setEditHotelWhatsAppActivo(e.target.checked)}
                                  className="rounded border-triton-slate/60"
                                />
                                <span>Activo</span>
                              </label>
                              <button
                                onClick={() => handleSaveHotelWhatsApp(hotel.id)}
                                className="p-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded hover:bg-emerald-900"
                                title="Guardar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingHotelId(null)}
                                className="p-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {hotel.telefono_whatsapp ? (
                                <>
                                  <span className="font-mono text-[11px] text-emerald-300 flex items-center gap-1">
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    {hotel.telefono_whatsapp}
                                  </span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                      hotel.whatsapp_activo !== false
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                        : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                    }`}
                                  >
                                    {hotel.whatsapp_activo !== false ? 'Auto' : 'Pausado'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingHotelId(hotel.id);
                                      setEditHotelPhone(hotel.telefono_whatsapp || '');
                                      setEditHotelWhatsAppActivo(hotel.whatsapp_activo !== false);
                                    }}
                                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-triton-deep"
                                    title="Editar número"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleTestWhatsApp(hotel)}
                                    disabled={sendingTestHotelId === hotel.id}
                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-brand-950 text-brand-300 border border-brand-800 rounded text-[10px] font-bold hover:bg-brand-900"
                                    title="Enviar WhatsApp de prueba"
                                  >
                                    <Send className="w-2.5 h-2.5" />
                                    <span>{sendingTestHotelId === hotel.id ? '...' : 'Test'}</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingHotelId(hotel.id);
                                    setEditHotelPhone('');
                                    setEditHotelWhatsAppActivo(true);
                                  }}
                                  className="text-[11px] text-slate-400 hover:text-triton-aqua flex items-center gap-1 border border-dashed border-slate-700 px-2 py-0.5 rounded transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Configurar WhatsApp</span>
                                </button>
                              )}
                            </div>
                          )}
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
        )}

        {/* Tab Choferes & Personal */}
        {tab === 'personal' && (
          <>
            {/* Mobile Cards for Personal */}
            <div className="md:hidden divide-y divide-slate-800">
              {loading ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">Cargando personal...</div>
              ) : filteredUsuarios.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">No se encontraron usuarios o choferes.</div>
              ) : (
                filteredUsuarios.map((u) => (
                  <div key={u.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-mono">#{u.id}</span>
                          <span className="text-sm font-bold text-slate-100">{u.username}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              u.rol === 'repartidor'
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : u.rol === 'admin'
                                ? 'bg-purple-950 text-purple-300 border-purple-800'
                                : 'bg-blue-950 text-blue-300 border-blue-800'
                            }`}
                          >
                            {u.rol === 'repartidor' ? '🚚 Chofer' : u.rol === 'admin' ? '🛡️ Admin' : u.rol === 'operario' ? '⚙️ Operario' : u.rol}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              u.activo
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-triton-deep text-slate-400 border-triton-slate/60'
                            }`}
                          >
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleUsuario(u)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-colors ${
                          u.activo
                            ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                            : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>

                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400">WhatsApp:</span>
                      {u.telefono_whatsapp ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{u.telefono_whatsapp}</span>
                          <button
                            onClick={() => handleTestUsuarioWhatsApp(u)}
                            disabled={sendingTestUsuarioId === u.id}
                            className="ml-1 px-1.5 py-0.5 bg-brand-950 text-brand-300 border border-brand-800 rounded text-[10px] font-bold"
                          >
                            {sendingTestUsuarioId === u.id ? '...' : 'Test'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">No configurado</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table for Personal */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-triton-deep text-slate-400 uppercase tracking-wider font-semibold border-b border-triton-slate/50">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Nombre de Usuario</th>
                    <th className="px-4 py-3">Rol / Función</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">WhatsApp Personal / Alertas</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Cargando personal...
                      </td>
                    </tr>
                  ) : filteredUsuarios.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No se encontraron usuarios o choferes registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredUsuarios.map((u) => (
                      <tr key={u.id} className="hover:bg-triton-deep/60 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-mono">#{u.id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-200">{u.username}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border ${
                              u.rol === 'repartidor'
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : u.rol === 'admin'
                                ? 'bg-purple-950 text-purple-300 border-purple-800'
                                : 'bg-blue-950 text-blue-300 border-blue-800'
                            }`}
                          >
                            {u.rol === 'repartidor' ? '🚚 Chofer / Repartidor' : u.rol === 'admin' ? '🛡️ Administrador' : u.rol === 'operario' ? '⚙️ Operario de Planta' : u.rol}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              u.activo
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-triton-deep text-slate-400 border-triton-slate/60'
                            }`}
                          >
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {editingUsuarioId === u.id ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input
                                type="text"
                                placeholder="Ej: 3514567890"
                                value={editUsuarioPhone}
                                onChange={(e) => setEditUsuarioPhone(e.target.value)}
                                className="bg-triton-deep border border-triton-slate/60 rounded px-2 py-1 text-xs text-white w-32 focus:border-triton-aqua"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveUsuarioWhatsApp(u.id)}
                                className="p-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded hover:bg-emerald-900"
                                title="Guardar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingUsuarioId(null)}
                                className="p-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {u.telefono_whatsapp ? (
                                <>
                                  <span className="font-mono text-[11px] text-emerald-300 flex items-center gap-1">
                                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    {u.telefono_whatsapp}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingUsuarioId(u.id);
                                      setEditUsuarioPhone(u.telefono_whatsapp || '');
                                    }}
                                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-triton-deep"
                                    title="Editar número"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleTestUsuarioWhatsApp(u)}
                                    disabled={sendingTestUsuarioId === u.id}
                                    className="flex items-center gap-1 px-1.5 py-0.5 bg-brand-950 text-brand-300 border border-brand-800 rounded text-[10px] font-bold hover:bg-brand-900"
                                    title="Enviar WhatsApp de prueba al chofer"
                                  >
                                    <Send className="w-2.5 h-2.5" />
                                    <span>{sendingTestUsuarioId === u.id ? '...' : 'Test'}</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingUsuarioId(u.id);
                                    setEditUsuarioPhone('');
                                  }}
                                  className="text-[11px] text-slate-400 hover:text-triton-aqua flex items-center gap-1 border border-dashed border-slate-700 px-2 py-0.5 rounded transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Asignar WhatsApp</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleToggleUsuario(u)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              u.activo
                                ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800'
                                : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                            }`}
                          >
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Tab Prendas */}
        {tab === 'items' && (
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
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            item.sector === 'planchado'
                              ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                              : 'bg-teal-950 text-teal-300 border-teal-800'
                          }`}
                        >
                          {item.sector === 'planchado' ? '🥌 Planchado' : '🌀 Secadora'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            item.se_factura
                              ? 'bg-brand-950 text-brand-300 border-brand-800'
                              : 'bg-amber-950 text-amber-300 border-amber-800'
                          }`}
                        >
                          {item.se_factura ? 'Facturable' : 'Relavado'}
                        </span>
                      </div>
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
                    <th className="px-4 py-3">Sector de Planta</th>
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
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            item.sector === 'planchado'
                              ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                              : 'bg-teal-950 text-teal-300 border-teal-800'
                          }`}
                        >
                          {item.sector === 'planchado' ? '🥌 Planchado / Calandra' : '🌀 Secadoras / Felpa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            item.se_factura
                              ? 'bg-brand-950 text-brand-300 border-brand-800'
                              : 'bg-amber-950 text-amber-300 border-amber-800'
                          }`}
                        >
                          {item.se_factura ? 'Facturable' : 'Relavado'}
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

        {/* Tab Historial WhatsApp */}
        {tab === 'whatsapp_logs' && (
          <>
            {/* Mobile Cards for WhatsApp Logs */}
            <div className="md:hidden divide-y divide-slate-800">
              {loadingLogs ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">Cargando historial de mensajes...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">No hay registros de mensajes enviados o recibidos.</div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                            log.direccion === 'saliente'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-blue-950 text-blue-300 border-blue-800'
                          }`}
                        >
                          {log.direccion === 'saliente' ? '↗️ Saliente' : '↙️ Entrante'}
                        </span>
                        <span className="text-[11px] font-bold text-white">
                          {log.hotel_nombre || log.usuario_nombre || log.telefono}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          log.estado === 'enviado'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : log.estado === 'recibido'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800'
                            : log.estado === 'simulado'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {log.estado}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 bg-triton-deep/60 p-2.5 rounded-xl border border-triton-slate/40 whitespace-pre-wrap font-sans">
                      {log.mensaje}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>Evento: {log.tipo_evento}</span>
                      <span>{new Date(log.created_at).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table for WhatsApp Logs */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-triton-deep text-slate-400 uppercase tracking-wider font-semibold border-b border-triton-slate/50">
                  <tr>
                    <th className="px-4 py-3">Fecha / Hora</th>
                    <th className="px-4 py-3">Dirección</th>
                    <th className="px-4 py-3">Interlocutor</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">Tipo Evento</th>
                    <th className="px-4 py-3">Mensaje</th>
                    <th className="px-4 py-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        Cargando historial de mensajes...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No hay mensajes registrados aún en el log de auditoría.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-triton-deep/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('es-AR')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              log.direccion === 'saliente'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : 'bg-blue-950 text-blue-300 border-blue-800'
                            }`}
                          >
                            {log.direccion === 'saliente' ? '↗️ Saliente' : '↙️ Entrante'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {log.hotel_nombre ? (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-triton-aqua shrink-0" />
                              {log.hotel_nombre}
                            </span>
                          ) : log.usuario_nombre ? (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-amber-400 shrink-0" />
                              {log.usuario_nombre}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Desconocido</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                          {log.telefono}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-mono text-slate-300 bg-triton-deep px-2 py-0.5 rounded border border-triton-slate/50">
                            {log.tipo_evento}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs xl:max-w-md truncate text-slate-300" title={log.mensaje}>
                          {log.mensaje}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              log.estado === 'enviado'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : log.estado === 'recibido'
                                ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                : log.estado === 'simulado'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {log.estado}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal de Conexión de WhatsApp del Lavadero (Escaneo QR) */}
      {connectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-triton-navy border border-triton-slate/50 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-triton-slate/50 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Vincular Celular de TRITÓN</h3>
              </div>
              <button
                onClick={() => setConnectModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-triton-deep"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {qrData?.conectado ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-white">¡WhatsApp Conectado!</h4>
                <p className="text-xs text-slate-300">
                  El número del lavadero está vinculado y activo para despachar notificaciones automáticas y responder consultas de hoteles y choferes con Gemini.
                </p>
                {qrData.instancia && (
                  <p className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 py-1 px-3 rounded-full inline-block">
                    Instancia: {qrData.instancia} (Activa)
                  </p>
                )}
                <div className="pt-2">
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="w-full py-2 bg-triton-aqua text-triton-navy font-black text-xs rounded-xl"
                  >
                    Aceptar y Cerrar
                  </button>
                </div>
              </div>
            ) : qrData?.qrcode ? (
              <div className="space-y-4 text-center">
                <p className="text-xs text-slate-300">
                  Escaneá este código QR desde la app de WhatsApp del celular del lavadero para vincularlo como emisor de notificaciones:
                </p>
                <div className="bg-white p-3 rounded-2xl inline-block shadow-lg border border-slate-200">
                  <img
                    src={qrData.qrcode.startsWith('data:') ? qrData.qrcode : `data:image/png;base64,${qrData.qrcode}`}
                    alt="Código QR WhatsApp"
                    className="w-56 h-56 mx-auto object-contain"
                  />
                </div>
                <div className="bg-triton-deep/60 border border-triton-slate/40 rounded-xl p-3 text-[11px] text-slate-300 text-left space-y-1">
                  <p className="font-bold text-white mb-1">Pasos en el teléfono:</p>
                  <p>1. Abrí WhatsApp en el celular corporativo de TRITÓN.</p>
                  <p>2. Tocá los tres puntos o Ajustes &gt; <b>Dispositivos vinculados</b>.</p>
                  <p>3. Tocá <b>Vincular un dispositivo</b> y apuntá la cámara a este código.</p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <RefreshCw className={`w-3 h-3 ${loadingQR ? 'animate-spin' : ''}`} />
                    Actualizando estado automáticamente...
                  </span>
                  <button
                    onClick={fetchQRCode}
                    disabled={loadingQR}
                    className="text-triton-aqua hover:underline font-bold"
                  >
                    Refrescar ahora
                  </button>
                </div>
              </div>
            ) : qrData?.estado === 'connecting' || qrData?.estado === 'close' ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
                  <RefreshCw className={`w-7 h-7 ${loadingQR ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Gateway Conectado — Preparando Sesión</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    {qrData?.mensaje || 'El servidor de WhatsApp en la nube está en línea y preparando el código QR.'}
                  </p>
                </div>
                {qrData?.instancia && (
                  <p className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/50 py-1 px-3 rounded-full inline-block">
                    Instancia: {qrData.instancia} (Online en Render)
                  </p>
                )}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={fetchQRCode}
                    disabled={loadingQR}
                    className="w-full py-2.5 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] text-triton-navy font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingQR ? 'animate-spin' : ''}`} />
                    <span>{loadingQR ? 'Consultando código QR...' : 'Generar / Refrescar Código QR'}</span>
                  </button>
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="w-full py-2 bg-triton-deep hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">Gateway de WhatsApp Pendiente</h4>
                <p className="text-xs text-slate-300">
                  {qrData?.mensaje || 'El servicio de WhatsApp aún no está listo o respondiendo.'}
                </p>
                <p className="text-[10px] text-slate-400">
                  Mientras tanto, el sistema funciona en <b>Modo Simulación</b> (los mensajes se guardan en el log de auditoría sin fallar).
                </p>
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={fetchQRCode}
                    disabled={loadingQR}
                    className="w-full py-2.5 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-navy font-bold text-xs rounded-xl"
                  >
                    Reintentar conexión
                  </button>
                  <button
                    onClick={() => setConnectModalOpen(false)}
                    className="w-full py-2 bg-triton-deep hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
