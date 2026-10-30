import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { AuditoriaItem, Envio, Hotel } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  ClipboardCheck,
  Search,
  QrCode,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  HelpCircle,
  Filter,
  X,
  Edit3,
  RotateCcw,
  Sparkles,
  Printer,
  Building2,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  FileText,
  History,
  Trash2,
  Calendar,
  Hash,
} from 'lucide-react';
import { RemitoPrintableModal } from '../hotel360/RemitoPrintableModal';
import { CargarRemitoModal } from './CargarRemitoModal';

interface HotelAuditoriaGroup {
  hotel_id: number;
  hotel_nombre: string;
  items: AuditoriaItem[];
  totalDeclaradas: number;
  totalLimpias: number;
  totalRelavado: number;
  totalRotas: number;
  totalContado: number;
  diferenciaTotal: number;
  totalOK: number;
  totalFaltantes: number;
  totalSobrantes: number;
  totalPendientes: number;
  totalSinRemito: number;
}

export const AuditoriaView: React.FC = () => {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Selector de vista principal: Auditoría de Prendas vs Historial de Remitos
  const [vistaActiva, setVistaActiva] = useState<'auditoria' | 'historial'>('auditoria');

  // Filtro por número de remito / QR (búsqueda global en auditoría e historial)
  const [busquedaRemito, setBusquedaRemito] = useState<string>('');

  // Modal para Cargar / Modificar Remito en Papel
  const [modalCargarRemitoOpen, setModalCargarRemitoOpen] = useState(false);
  const [remitoParaEditar, setRemitoParaEditar] = useState<Envio | null>(null);
  const [hotelPreseleccionado, setHotelPreseleccionado] = useState<number | undefined>(undefined);

  // Lista de Remitos y Catálogo de Hoteles para Historial
  const [remitos, setRemitos] = useState<Envio[]>([]);
  const [hotelesLista, setHotelesLista] = useState<Hotel[]>([]);
  const [loadingRemitos, setLoadingRemitos] = useState(false);
  const [filtroHotelHistorial, setFiltroHotelHistorial] = useState<number | 'all'>('all');
  const [filtroFechaHistorial, setFiltroFechaHistorial] = useState<string>('');

  // Estados de navegación por Hotel en Auditoría: Acordeón y Pestaña activa
  const [expandedHotels, setExpandedHotels] = useState<Record<number, boolean>>({});
  const [activeHotelTab, setActiveHotelTab] = useState<number | 'all'>('all');
  const [soloConDiferencias, setSoloConDiferencias] = useState<boolean>(false);
  const [busquedaPrenda, setBusquedaPrenda] = useState<string>('');

  // Escáner / Búsqueda QR
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [scannedEnvio, setScannedEnvio] = useState<Envio | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Modal para registrar conteo de salida (Limpias, Relavados, Rotas)
  const [selectedItemForConteo, setSelectedItemForConteo] = useState<AuditoriaItem | null>(null);
  const [limpiasInput, setLimpiasInput] = useState<number>(0);
  const [relavadoInput, setRelavadoInput] = useState<number>(0);
  const [rotasInput, setRotasInput] = useState<number>(0);
  const [savingConteo, setSavingConteo] = useState(false);
  const [remitoParaImprimir, setRemitoParaImprimir] = useState<Envio | null>(null);

  useEffect(() => {
    cargarAuditoria();
  }, [fechaFiltro, busquedaRemito]);

  useEffect(() => {
    cargarHistorialRemitos();
  }, [filtroFechaHistorial, filtroHotelHistorial, busquedaRemito]);

  useEffect(() => {
    api.getHoteles().then((res) => {
      setHotelesLista(Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, []);

  const cargarAuditoria = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditoria({
        fecha: fechaFiltro || undefined,
        remito: busquedaRemito.trim() || undefined,
      });
      setItems(data);
    } catch (err) {
      console.error('Error cargando auditoria:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarHistorialRemitos = async () => {
    setLoadingRemitos(true);
    try {
      const data = await api.getEnvios({
        fecha: filtroFechaHistorial || undefined,
        hotel_id: filtroHotelHistorial !== 'all' ? filtroHotelHistorial : undefined,
        remito: busquedaRemito.trim() || undefined,
      });
      setRemitos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando historial de remitos:', err);
    } finally {
      setLoadingRemitos(false);
    }
  };

  const abrirCargarRemitoModal = (hotelId?: number) => {
    setRemitoParaEditar(null);
    setHotelPreseleccionado(hotelId || (activeHotelTab !== 'all' ? activeHotelTab : undefined));
    setModalCargarRemitoOpen(true);
  };

  const abrirEditarRemito = (env: Envio) => {
    setRemitoParaEditar(env);
    setHotelPreseleccionado(env.hotel_id);
    setModalCargarRemitoOpen(true);
  };

  const handleRemitoGuardado = async (_saved: Envio) => {
    setModalCargarRemitoOpen(false);
    setRemitoParaEditar(null);
    await Promise.all([cargarAuditoria(), cargarHistorialRemitos()]);
  };

  const handleDeleteRemito = async (id: number, numRemito?: string | null) => {
    const ident = numRemito ? `N° ${numRemito}` : `ID #${id}`;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el remito ${ident}? Esta acción descontará las prendas de la auditoría.`)) {
      return;
    }
    try {
      await api.deleteEnvio(id);
      await Promise.all([cargarAuditoria(), cargarHistorialRemitos()]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error eliminando remito');
    }
  };

  // Agrupamiento por Hotel
  const hotelGroups = useMemo<HotelAuditoriaGroup[]>(() => {
    const map = new Map<number, HotelAuditoriaGroup>();

    items.forEach((item) => {
      if (!map.has(item.hotel_id)) {
        map.set(item.hotel_id, {
          hotel_id: item.hotel_id,
          hotel_nombre: item.hotel_nombre,
          items: [],
          totalDeclaradas: 0,
          totalLimpias: 0,
          totalRelavado: 0,
          totalRotas: 0,
          totalContado: 0,
          diferenciaTotal: 0,
          totalOK: 0,
          totalFaltantes: 0,
          totalSobrantes: 0,
          totalPendientes: 0,
          totalSinRemito: 0,
        });
      }

      const group = map.get(item.hotel_id)!;
      group.items.push(item);
      group.totalDeclaradas += item.cantidad_declarada;
      group.totalLimpias += item.cantidad_limpia;
      group.totalRelavado += item.cantidad_relavado;
      group.totalRotas += item.cantidad_rota;
      group.totalContado += item.total_contado;
      group.diferenciaTotal += item.diferencia;

      if (item.estado === 'OK') group.totalOK++;
      else if (item.estado === 'FALTANTE') group.totalFaltantes++;
      else if (item.estado === 'SOBRANTE') group.totalSobrantes++;
      else if (item.estado === 'PENDIENTE_LAVADERO') group.totalPendientes++;
      else if (item.estado === 'SIN_REMITO') group.totalSinRemito++;
    });

    return Array.from(map.values());
  }, [items]);

  // Al cargar nuevos datos, expandir el primer hotel por defecto para conveniencia
  useEffect(() => {
    if (hotelGroups.length > 0 && Object.keys(expandedHotels).length === 0) {
      setExpandedHotels({ [hotelGroups[0].hotel_id]: true });
    }
  }, [hotelGroups]);

  const toggleHotel = (hotelId: number) => {
    setExpandedHotels((prev) => ({
      ...prev,
      [hotelId]: !prev[hotelId],
    }));
  };

  const expandirTodos = () => {
    const next: Record<number, boolean> = {};
    hotelGroups.forEach((g) => {
      next[g.hotel_id] = true;
    });
    setExpandedHotels(next);
  };

  const colapsarTodos = () => {
    setExpandedHotels({});
  };

  // Filtrado final de grupos para renderizar
  const filteredGroups = useMemo(() => {
    let list = hotelGroups;

    if (activeHotelTab !== 'all') {
      list = list.filter((g) => g.hotel_id === activeHotelTab);
    }

    if (soloConDiferencias) {
      list = list.filter((g) => g.diferenciaTotal !== 0 || g.totalPendientes > 0);
    }

    return list;
  }, [hotelGroups, activeHotelTab, soloConDiferencias]);

  const handleBuscarQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrCodeInput.trim()) return;

    setScanning(true);
    setScanError(null);
    try {
      const envio = await api.getEnvioByQR(qrCodeInput.trim());
      setScannedEnvio(envio);
      setQrCodeInput('');
      // Enfocar directamente en el hotel escaneado si existe en la lista
      if (envio.hotel_id) {
        setExpandedHotels((prev) => ({ ...prev, [envio.hotel_id]: true }));
        setActiveHotelTab(envio.hotel_id);
      }
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'No se encontró ningún remito con ese código QR.');
      setScannedEnvio(null);
    } finally {
      setScanning(false);
    }
  };

  const openConteoModal = (item: AuditoriaItem) => {
    setSelectedItemForConteo(item);
    setLimpiasInput(item.cantidad_limpia || 0);
    setRelavadoInput(item.cantidad_relavado || 0);
    setRotasInput(item.cantidad_rota || 0);
  };

  const handleSaveConteo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForConteo) return;

    setSavingConteo(true);
    try {
      await api.registrarConteo({
        fecha: selectedItemForConteo.fecha,
        hotel_id: selectedItemForConteo.hotel_id,
        item_id: selectedItemForConteo.item_id,
        cantidad_limpia: limpiasInput,
        cantidad_relavado: relavadoInput,
        cantidad_rota: rotasInput,
      });
      setSelectedItemForConteo(null);
      await cargarAuditoria();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error guardando conteo');
    } finally {
      setSavingConteo(false);
    }
  };

  // Métricas globales
  const totalOK = items.filter((i) => i.estado === 'OK').length;
  const totalFaltantes = items.filter((i) => i.estado === 'FALTANTE').length;
  const totalSobrantes = items.filter((i) => i.estado === 'SOBRANTE').length;
  const totalPendientes = items.filter((i) => i.estado === 'PENDIENTE_LAVADERO').length;

  const totalCalculado = limpiasInput + relavadoInput + rotasInput;
  const difCalculada = selectedItemForConteo
    ? totalCalculado - selectedItemForConteo.cantidad_declarada
    : 0;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* 1. Encabezado & Acciones Principales */}
      <div className="bg-triton-navy/95 border border-triton-slate/50 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-triton-aqua shrink-0" />
              <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight">
                Auditoría y Gestión de Remitos por Hotel
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Control cruzado de remitos (en papel o digital) vs. prendas procesadas en lavadero, con historial y búsqueda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Botón Principal: Cargar Remito en Papel */}
            <button
              type="button"
              onClick={() => abrirCargarRemitoModal()}
              className="px-4 py-2 bg-gradient-to-r from-triton-teal to-triton-aqua hover:from-triton-teal-light hover:to-triton-aqua-hover text-triton-navy text-xs font-black rounded-xl shadow-lg shadow-triton-aqua/20 flex items-center gap-2 transition-all hover:scale-[1.02] shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Cargar Remito en Papel</span>
            </button>

            {/* Lector de QR / Búsqueda Directa */}
            <form onSubmit={handleBuscarQR} className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <div className="relative flex-1 sm:w-64">
                <QrCode className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Escanear QR o N° Remito..."
                  value={qrCodeInput}
                  onChange={(e) => setQrCodeInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={scanning}
                className="px-3 py-2 bg-triton-aqua hover:bg-triton-aqua-hover disabled:opacity-40 text-triton-navy text-xs font-black rounded-xl shadow-md shadow-triton-aqua/20 flex items-center gap-1 transition-all shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Buscar</span>
              </button>
            </form>
          </div>
        </div>

        {/* Pestañas de Vista: Auditoría de Prendas vs Historial de Remitos */}
        <div className="flex items-center gap-2 border-t border-triton-slate/50/60 pt-3">
          <button
            type="button"
            onClick={() => setVistaActiva('auditoria')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              vistaActiva === 'auditoria'
                ? 'bg-triton-aqua text-triton-navy shadow-md shadow-triton-aqua/25'
                : 'bg-triton-deep text-slate-400 hover:text-slate-200 border border-triton-slate/50'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Auditoría de Prendas</span>
          </button>

          <button
            type="button"
            onClick={() => setVistaActiva('historial')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              vistaActiva === 'historial'
                ? 'bg-triton-aqua text-triton-navy shadow-md shadow-triton-aqua/25'
                : 'bg-triton-deep text-slate-400 hover:text-slate-200 border border-triton-slate/50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial de Remitos</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-triton-navy/60 font-mono font-bold">
              {remitos.length}
            </span>
          </button>
        </div>
      </div>

      {/* Alerta de Error QR */}
      {scanError && (
        <div className="bg-rose-950/70 border border-rose-800 text-rose-300 text-xs p-4 rounded-xl flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{scanError}</span>
          </div>
          <button onClick={() => setScanError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Detalle de Remito QR Escaneado */}
      {scannedEnvio && (
        <div className="bg-brand-950/70 border border-brand-700/60 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start justify-between gap-4 animate-fadeIn">
          <div className="space-y-1.5 w-full">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-brand-600 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Remito Verificado
              </span>
              <span className="font-mono text-xs font-bold text-brand-300">{scannedEnvio.codigo_qr}</span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-white">
              Hotel: {scannedEnvio.hotel?.nombre || `Hotel #${scannedEnvio.hotel_id}`}
            </h3>
            <p className="text-xs text-slate-400">
              Fecha de remito: {new Date(scannedEnvio.fecha).toLocaleDateString('es-AR')}
            </p>

            <div className="pt-2">
              <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-2">
                Prendas declaradas por el hotel:
              </p>
              <div className="flex flex-wrap gap-2">
                {scannedEnvio.detalles && scannedEnvio.detalles.length > 0 ? (
                  scannedEnvio.detalles.map((d) => (
                    <div
                      key={d.id}
                      className="bg-triton-deep border border-triton-slate/50 px-2.5 py-1 rounded-lg text-xs"
                    >
                      <span className="text-slate-300">{d.item?.nombre}: </span>
                      <span className="font-bold text-brand-300">{d.cantidad_declarada} u.</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">Sin prendas especificadas</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            <button
              onClick={() => setRemitoParaImprimir(scannedEnvio)}
              className="flex-1 md:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/30 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Remito</span>
            </button>
            <button
              onClick={() => setScannedEnvio(null)}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-triton-deep"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* SECCIÓN 1: VISTA DE AUDITORÍA Y CRUCE DE PRENDAS */}
      {vistaActiva === 'auditoria' && (
        <>
          {/* 2. Tarjetas de Resumen Global (4 KPIs) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/15 shadow-lg">
              <div className="flex items-center justify-between text-emerald-400 mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Coincidencias</span>
                <CheckCircle className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-white">{totalOK}</p>
              <p className="text-[10px] text-slate-400">Prendas exactas (OK)</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-rose-800/60 bg-rose-950/15 shadow-lg">
              <div className="flex items-center justify-between text-rose-400 mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Faltantes</span>
                <AlertOctagon className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-rose-400">{totalFaltantes}</p>
              <p className="text-[10px] text-slate-400">Prendas de menos</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-amber-800/60 bg-amber-950/15 shadow-lg">
              <div className="flex items-center justify-between text-amber-400 mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Sobrantes</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-400">{totalSobrantes}</p>
              <p className="text-[10px] text-slate-400">Prendas contadas de más</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-brand-800/60 bg-brand-950/15 shadow-lg">
              <div className="flex items-center justify-between text-triton-aqua mb-1">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Pendientes</span>
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-black text-brand-300">{totalPendientes}</p>
              <p className="text-[10px] text-slate-400">En proceso de lavado</p>
            </div>
          </div>

          {/* 3. Barra de Controles y Selector de Pestañas por Hotel */}
          <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-2xl border border-triton-slate/50 shadow-xl space-y-3">
            {/* Controles de Filtros Superiores */}
            <div className="flex flex-col sm:flex-row flex-wrap sm:items-center justify-between gap-3">
              <div className="grid grid-cols-2 sm:flex flex-wrap items-center gap-2 sm:gap-2.5">
                {/* Selector de Fecha */}
                <div className="flex items-center gap-1.5 bg-triton-deep px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl border border-triton-slate/50">
                  <span className="text-xs font-bold text-slate-400 hidden xs:inline">Fecha:</span>
                  <input
                    type="date"
                    value={fechaFiltro}
                    onChange={(e) => setFechaFiltro(e.target.value)}
                    className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer w-full"
                  />
                  {fechaFiltro && (
                    <button
                      onClick={() => setFechaFiltro('')}
                      className="text-[10px] text-slate-400 hover:text-white underline ml-1 shrink-0"
                    >
                      Todas
                    </button>
                  )}
                </div>

                {/* Buscador de Remito */}
                <div className="relative col-span-2 sm:col-span-1">
                  <Hash className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="N° Remito o QR..."
                    value={busquedaRemito}
                    onChange={(e) => setBusquedaRemito(e.target.value)}
                    className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-8 pr-7 py-2 sm:py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-36 font-mono"
                  />
                  {busquedaRemito && (
                    <button
                      onClick={() => setBusquedaRemito('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                      title="Limpiar filtro de remito"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Toggle Solo con Diferencias */}
                <button
                  onClick={() => setSoloConDiferencias(!soloConDiferencias)}
                  className={`px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    soloConDiferencias
                      ? 'bg-amber-950/80 text-amber-300 border-amber-700 shadow-sm'
                      : 'bg-triton-deep text-slate-400 border-triton-slate/50 hover:text-slate-200'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Con Diferencias</span>
                </button>

                {/* Buscador de Prenda */}
                <div className="relative col-span-2 sm:col-span-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar prenda..."
                    value={busquedaPrenda}
                    onChange={(e) => setBusquedaPrenda(e.target.value)}
                    className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-8 pr-3 py-2 sm:py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full sm:w-40"
                  />
                </div>
              </div>

          {/* Acciones de Acordeón: Expandir / Colapsar */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2">
            <button
              onClick={expandirTodos}
              className="px-2.5 py-1.5 sm:py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-triton-deep hover:bg-triton-slate/60 rounded-lg transition-colors text-center"
            >
              Expandir
            </button>
            <button
              onClick={colapsarTodos}
              className="px-2.5 py-1.5 sm:py-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-triton-deep border border-triton-slate/50 rounded-lg transition-colors text-center"
            >
              Colapsar
            </button>
            <button
              onClick={cargarAuditoria}
              disabled={loading}
              className="px-2.5 py-1.5 sm:py-1 text-[11px] font-bold text-brand-300 hover:text-white bg-brand-950/80 border border-brand-800/60 rounded-lg transition-colors text-center"
            >
              Actualizar
            </button>
          </div>
        </div>

        {/* Pestañas Rápidas de Hoteles (Tabs Horizontales) */}
        {hotelGroups.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 pt-1 border-t border-triton-slate/50/60">
            <button
              onClick={() => setActiveHotelTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                activeHotelTab === 'all'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'bg-triton-deep text-slate-400 hover:text-slate-200 border border-triton-slate/50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Todos ({hotelGroups.length})</span>
            </button>

            {hotelGroups.map((g) => {
              const hasDiff = g.diferenciaTotal !== 0;
              const isSelected = activeHotelTab === g.hotel_id;

              return (
                <button
                  key={g.hotel_id}
                  onClick={() => {
                    setActiveHotelTab(g.hotel_id);
                    setExpandedHotels((prev) => ({ ...prev, [g.hotel_id]: true }));
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-brand-600 text-white border-brand-500 shadow-md shadow-brand-600/30'
                      : hasDiff
                      ? 'bg-triton-deep text-amber-300 border-amber-800/60 hover:bg-triton-deep'
                      : 'bg-triton-deep text-slate-300 border-triton-slate/50 hover:bg-triton-deep'
                  }`}
                >
                  <span>{g.hotel_nombre}</span>
                  {hasDiff ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Tiene diferencias" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Sin diferencias" />
                  )}
                  <span className="text-[10px] opacity-70">({g.items.length})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Lista Encuadrada por Hotel (Tarjetas / Acordeones Independientes) */}
      {loading ? (
        <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-16 text-center shadow-xl">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
          <p className="text-xs text-slate-400 font-semibold">
            Calculando auditoría y agrupando hoteles en tiempo real...
          </p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-12 text-center text-slate-400 text-xs shadow-xl">
          No se encontraron movimientos de auditoría para los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isExpanded = !!expandedHotels[group.hotel_id];
            const hasDiff = group.diferenciaTotal !== 0;

            // Filtrar prendas dentro del hotel si se usa el buscador
            const itemsVisibles = group.items.filter((it) =>
              busquedaPrenda ? it.item_nombre.toLowerCase().includes(busquedaPrenda.toLowerCase()) : true
            );

            return (
              <div
                key={group.hotel_id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-xl ${
                  isExpanded
                    ? 'bg-triton-navy border-brand-500/50 shadow-black/30'
                    : 'bg-triton-navy/80 border-triton-slate/50 hover:border-slate-500'
                }`}
              >
                {/* Cabecera del Hotel (Encuadre independiente) */}
                <div
                  onClick={() => toggleHotel(group.hotel_id)}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-triton-deep/60 border-b border-triton-slate/50' : 'hover:bg-triton-deep/30'
                  }`}
                >
                  {/* Título del Hotel y Resumen Rápido */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-triton-deep border border-triton-slate/50 text-triton-aqua shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                          {group.hotel_nombre}
                        </h2>
                        {group.items[0]?.numeros_remito && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                            <Hash className="w-3 h-3 text-cyan-400" />
                            Remito: {group.items[0].numeros_remito}
                          </span>
                        )}
                        {hasDiff ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            {group.diferenciaTotal > 0
                              ? `+${group.diferenciaTotal} sobrante(s)`
                              : `${group.diferenciaTotal} faltante(s)`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                            <CheckCircle className="w-3 h-3" />
                            Coincidencia 100% (OK)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {group.items.length} prenda(s) &bull; Declaradas: {formatNumber(group.totalDeclaradas)} u. &bull; Contadas: {formatNumber(group.totalContado)} u.
                      </p>
                    </div>
                  </div>

                  {/* Badges de Estado y Acciones Rápidas */}
                  <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-triton-slate/50/50">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirCargarRemitoModal(group.hotel_id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-triton-aqua/15 hover:bg-triton-aqua/25 text-triton-aqua border border-triton-aqua/40 text-[11px] font-bold flex items-center gap-1 transition-all"
                      title="Cargar o actualizar remito en papel para este hotel"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{group.items[0]?.numeros_remito ? 'Editar Remito' : '+ Cargar Remito'}</span>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {group.totalOK > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 font-semibold text-[11px]">
                          {group.totalOK} OK
                        </span>
                      )}
                      {group.totalFaltantes > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-300 border border-rose-800/60 font-semibold text-[11px]">
                          {group.totalFaltantes} faltan
                        </span>
                      )}
                      {group.totalSobrantes > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-950/60 text-amber-300 border border-amber-800/60 font-semibold text-[11px]">
                          {group.totalSobrantes} sobran
                        </span>
                      )}
                      {group.totalPendientes > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-brand-950/60 text-brand-300 border border-brand-800/60 font-semibold text-[11px]">
                          {group.totalPendientes} pendientes
                        </span>
                      )}
                    </div>

                    <div className="p-1.5 rounded-lg bg-triton-deep border border-triton-slate/50 text-slate-300 hover:text-white shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Contenido Desplegado: Mobile Cards (< md) + Desktop Table (md:block) */}
                {isExpanded && (
                  <>
                    {/* VISTA MOBILE (< md): Tarjetas de Prenda con Botón Directo de Conteo */}
                    <div className="md:hidden p-3 space-y-2.5 bg-triton-deep/40">
                      {itemsVisibles.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500">
                          No hay prendas que coincidan con la búsqueda.
                        </div>
                      ) : (
                        itemsVisibles.map((row, idx) => (
                          <div
                            key={`${row.fecha}-${row.hotel_id}-${row.item_id}-${idx}`}
                            className="p-3 rounded-xl bg-triton-deep border border-triton-slate/50 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-bold text-white text-sm">{row.item_nombre}</h4>
                                <div className="mt-1">
                                  {row.estado === 'OK' && (
                                    <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                                      Coincide (OK)
                                    </span>
                                  )}
                                  {row.estado === 'FALTANTE' && (
                                    <span className="inline-flex items-center gap-1 bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      <AlertOctagon className="w-3 h-3 text-rose-400" />
                                      Faltante ({row.diferencia})
                                    </span>
                                  )}
                                  {row.estado === 'SOBRANTE' && (
                                    <span className="inline-flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                      Sobrante (+{row.diferencia})
                                    </span>
                                  )}
                                  {row.estado === 'PENDIENTE_LAVADERO' && (
                                    <span className="inline-flex items-center gap-1 bg-brand-950/80 text-brand-300 border border-brand-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      <Clock className="w-3 h-3 text-triton-aqua" />
                                      Pendiente
                                    </span>
                                  )}
                                  {row.estado === 'SIN_REMITO' && (
                                    <span className="inline-flex items-center gap-1 bg-slate-900 text-slate-300 border border-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      <HelpCircle className="w-3 h-3 text-slate-400" />
                                      Sin Remito
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => openConteoModal(row)}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 rounded-xl inline-flex items-center gap-1.5 shadow-sm shrink-0"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Conteo</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-triton-slate/50/60 text-center text-[11px]">
                              <div className="bg-triton-navy rounded-lg p-1.5">
                                <span className="text-[9px] text-slate-400 uppercase block">Remito</span>
                                <span className="font-bold text-slate-200">{formatNumber(row.cantidad_declarada)}</span>
                              </div>
                              <div className="bg-triton-navy rounded-lg p-1.5">
                                <span className="text-[9px] text-emerald-400 uppercase block">Limpias</span>
                                <span className="font-black text-emerald-400">{formatNumber(row.cantidad_limpia)}</span>
                              </div>
                              <div className="bg-triton-navy rounded-lg p-1.5">
                                <span className="text-[9px] text-amber-400 uppercase block">Relav.</span>
                                <span className="font-bold text-amber-300">{row.cantidad_relavado || 0}</span>
                              </div>
                              <div className="bg-triton-navy rounded-lg p-1.5">
                                <span className="text-[9px] text-rose-400 uppercase block">Rotas</span>
                                <span className="font-bold text-rose-300">{row.cantidad_rota || 0}</span>
                              </div>
                              <div className="bg-triton-navy rounded-lg p-1.5">
                                <span className="text-[9px] text-slate-300 uppercase block">Dif.</span>
                                <span
                                  className={`font-black ${
                                    row.diferencia > 0
                                      ? 'text-amber-400'
                                      : row.diferencia < 0
                                      ? 'text-rose-400'
                                      : 'text-emerald-400'
                                  }`}
                                >
                                  {row.diferencia > 0 ? `+${row.diferencia}` : row.diferencia}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}

                      {/* Resumen Total Mobile del Hotel */}
                      <div className="p-3 rounded-xl bg-triton-deep border border-triton-slate/50 flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-300 uppercase text-[10px]">
                          Total {group.hotel_nombre}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-300">
                            Decl: <strong className="text-white">{formatNumber(group.totalDeclaradas)}</strong>
                          </span>
                          <span className="text-emerald-400">
                            Limpias: <strong>{formatNumber(group.totalLimpias)}</strong>
                          </span>
                          <span
                            className={
                              group.diferenciaTotal > 0
                                ? 'text-amber-400'
                                : group.diferenciaTotal < 0
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }
                          >
                            Dif: {group.diferenciaTotal > 0 ? `+${group.diferenciaTotal}` : group.diferenciaTotal}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* VISTA DESKTOP (md:block): Tabla Original de 9 Columnas */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-triton-deep text-slate-400 font-bold uppercase tracking-wider border-b border-triton-slate/50">
                          <tr>
                            <th className="px-4 py-3 min-w-[140px]">Prenda / Artículo</th>
                            <th className="px-3 py-3 text-right">Cant. Declarada</th>
                            <th className="px-3 py-3 text-right text-emerald-400">Limpias (OK)</th>
                            <th className="px-3 py-3 text-right text-amber-400">En Relavado</th>
                            <th className="px-3 py-3 text-right text-rose-400">Rotas</th>
                            <th className="px-3 py-3 text-right font-black text-white">Total Contado</th>
                            <th className="px-3 py-3 text-right font-black">Diferencia</th>
                            <th className="px-4 py-3 text-center">Estado Auditoría</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-triton-slate/40 bg-triton-deep/30">
                          {itemsVisibles.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                                No hay prendas que coincidan con la búsqueda.
                              </td>
                            </tr>
                          ) : (
                            itemsVisibles.map((row, idx) => (
                              <tr
                                key={`${row.fecha}-${row.hotel_id}-${row.item_id}-${idx}`}
                                className="hover:bg-triton-deep/40 transition-colors"
                              >
                                <td className="px-4 py-2.5 font-bold text-white">
                                  {row.item_nombre}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-slate-300">
                                  {formatNumber(row.cantidad_declarada)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-emerald-400">
                                  {formatNumber(row.cantidad_limpia)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-amber-400">
                                  {row.cantidad_relavado > 0 ? (
                                    <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-black">
                                      {row.cantidad_relavado}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-rose-400">
                                  {row.cantidad_rota > 0 ? (
                                    <span className="bg-rose-950/80 text-rose-300 border border-rose-800/60 px-1.5 py-0.5 rounded font-black">
                                      {row.cantidad_rota}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-black text-white">
                                  {formatNumber(row.total_contado)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-black">
                                  {row.diferencia > 0 ? (
                                    <span className="text-amber-400 bg-amber-950/70 border border-amber-800/60 px-1.5 py-0.5 rounded">
                                      +{row.diferencia}
                                    </span>
                                  ) : row.diferencia < 0 ? (
                                    <span className="text-rose-400 bg-rose-950/70 border border-rose-800/60 px-1.5 py-0.5 rounded">
                                      {row.diferencia}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400">0</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {row.estado === 'OK' && (
                                    <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                                      Coincide (OK)
                                    </span>
                                  )}
                                  {row.estado === 'FALTANTE' && (
                                    <span className="inline-flex items-center gap-1 bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                      <AlertOctagon className="w-3 h-3 text-rose-400" />
                                      Faltante ({row.diferencia})
                                    </span>
                                  )}
                                  {row.estado === 'SOBRANTE' && (
                                    <span className="inline-flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                      Sobrante (+{row.diferencia})
                                    </span>
                                  )}
                                  {row.estado === 'PENDIENTE_LAVADERO' && (
                                    <span className="inline-flex items-center gap-1 bg-brand-950/80 text-brand-300 border border-brand-800/60 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                      <Clock className="w-3 h-3 text-triton-aqua" />
                                      Pendiente
                                    </span>
                                  )}
                                  {row.estado === 'SIN_REMITO' && (
                                    <span className="inline-flex items-center gap-1 bg-slate-900 text-slate-300 border border-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                                      <HelpCircle className="w-3 h-3 text-slate-400" />
                                      Sin Remito
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  <button
                                    onClick={() => openConteoModal(row)}
                                    className="px-2.5 py-1 text-[11px] font-bold text-brand-300 hover:text-white bg-brand-600/20 hover:bg-brand-600 rounded-lg inline-flex items-center gap-1 transition-all border border-brand-700/50 shadow-sm"
                                    title="Ajustar conteo de limpias, relavado o roturas"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Conteo</span>
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>

                        {/* Pie de Tabla con Totales del Hotel */}
                        <tfoot className="bg-triton-deep font-extrabold border-t-2 border-triton-slate/50">
                          <tr>
                            <td className="px-4 py-2.5 text-white uppercase text-[10px]">
                              Total {group.hotel_nombre}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-200">
                              {formatNumber(group.totalDeclaradas)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-400">
                              {formatNumber(group.totalLimpias)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-amber-400">
                              {group.totalRelavado > 0 ? formatNumber(group.totalRelavado) : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-rose-400">
                              {group.totalRotas > 0 ? formatNumber(group.totalRotas) : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-white">
                              {formatNumber(group.totalContado)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {group.diferenciaTotal > 0 ? (
                                <span className="text-amber-400">+{group.diferenciaTotal}</span>
                              ) : group.diferenciaTotal < 0 ? (
                                <span className="text-rose-400">{group.diferenciaTotal}</span>
                              ) : (
                                <span className="text-emerald-400">0</span>
                              )}
                            </td>
                            <td colSpan={2} className="px-4 py-2.5 text-right text-slate-400 text-[10px]">
                              {group.items.length} ítems auditados
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* SECCIÓN 2: HISTORIAL DE REMITOS */}
      {vistaActiva === 'historial' && (
        <div className="space-y-4 animate-fade-in">
          {/* Barra de Filtros del Historial */}
          <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-2xl border border-triton-slate/50 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Filtro por Hotel */}
              <div className="flex items-center gap-1.5 bg-triton-deep px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl border border-triton-slate/50">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-400">Hotel:</span>
                <select
                  value={filtroHotelHistorial}
                  onChange={(e) =>
                    setFiltroHotelHistorial(
                      e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10)
                    )
                  }
                  className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-triton-navy text-white">
                    Todos los hoteles
                  </option>
                  {hotelesLista.map((h) => (
                    <option key={h.id} value={h.id} className="bg-triton-navy text-white">
                      {h.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Fecha */}
              <div className="flex items-center gap-1.5 bg-triton-deep px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl border border-triton-slate/50">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-400">Fecha:</span>
                <input
                  type="date"
                  value={filtroFechaHistorial}
                  onChange={(e) => setFiltroFechaHistorial(e.target.value)}
                  className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
                />
                {filtroFechaHistorial && (
                  <button
                    onClick={() => setFiltroFechaHistorial('')}
                    className="text-[10px] text-slate-400 hover:text-white underline ml-1"
                  >
                    Todas
                  </button>
                )}
              </div>

              {/* Búsqueda por N° de Remito o QR */}
              <div className="relative">
                <Hash className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar N° Remito o QR..."
                  value={busquedaRemito}
                  onChange={(e) => setBusquedaRemito(e.target.value)}
                  className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-8 pr-7 py-2 sm:py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-triton-aqua font-mono w-48 sm:w-56"
                />
                {busquedaRemito && (
                  <button
                    onClick={() => setBusquedaRemito('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={cargarHistorialRemitos}
                disabled={loadingRemitos}
                className="px-3 py-2 sm:py-1.5 bg-triton-deep hover:bg-slate-800 border border-triton-slate/50 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors"
              >
                Actualizar
              </button>
              <button
                onClick={() => abrirCargarRemitoModal()}
                className="px-3.5 py-2 sm:py-1.5 bg-gradient-to-r from-triton-teal to-triton-aqua hover:from-triton-teal-light hover:to-triton-aqua-hover text-triton-navy text-xs font-black rounded-xl shadow-md shadow-triton-aqua/20 flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>+ Cargar Remito</span>
              </button>
            </div>
          </div>

          {/* Tabla / Tarjetas de Remitos */}
          {loadingRemitos ? (
            <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-16 text-center shadow-xl">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-triton-aqua border-t-transparent mb-3" />
              <p className="text-xs text-slate-400 font-semibold">Cargando historial de remitos...</p>
            </div>
          ) : remitos.length === 0 ? (
            <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-14 text-center text-slate-400 text-xs shadow-xl space-y-3">
              <FileText className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="font-semibold text-slate-300">No se encontraron remitos para los filtros seleccionados.</p>
              <p className="text-[11px] text-slate-500">
                Puedes registrar un remito físico enviado por el hotel haciendo clic en "+ Cargar Remito".
              </p>
              <button
                onClick={() => abrirCargarRemitoModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-triton-aqua text-triton-navy font-black text-xs rounded-xl shadow-md shadow-triton-aqua/20"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Cargar Primer Remito</span>
              </button>
            </div>
          ) : (
            <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-triton-slate/50 bg-triton-deep text-[11px] uppercase tracking-wider text-slate-400 font-black">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Hotel / Cliente</th>
                      <th className="py-3 px-4">N° Remito Papel</th>
                      <th className="py-3 px-4">Código / Ref</th>
                      <th className="py-3 px-4 text-right">Prendas Declaradas</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-triton-slate/40">
                    {remitos.map((rem) => {
                      const totalP =
                        rem.total_prendas ||
                        rem.detalles?.reduce((acc, d) => acc + d.cantidad_declarada, 0) ||
                        0;

                      return (
                        <tr key={rem.id} className="hover:bg-triton-deep/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                            {new Date(rem.fecha).toLocaleDateString('es-AR')}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-200">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-triton-aqua shrink-0" />
                              <span>{rem.hotel?.nombre || `Hotel #${rem.hotel_id}`}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-triton-aqua">
                            {rem.numero_remito ? (
                              <span className="bg-triton-deep border border-triton-teal/50 px-2 py-0.5 rounded-md">
                                {rem.numero_remito}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-normal italic">Sin número</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {rem.codigo_qr}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-white text-sm">
                            {formatNumber(totalP)} u.
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-950/80 text-brand-300 border border-brand-800">
                              {rem.estado || 'listo_para_retiro'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ver / Imprimir */}
                              <button
                                onClick={() => setRemitoParaImprimir(rem)}
                                className="p-1.5 rounded-lg bg-triton-deep hover:bg-slate-800 text-slate-300 hover:text-white border border-triton-slate/50 transition-colors"
                                title="Ver / Imprimir Remito Oficial"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {/* Modificar */}
                              <button
                                onClick={() => abrirEditarRemito(rem)}
                                className="p-1.5 rounded-lg bg-triton-deep hover:bg-slate-800 text-slate-300 hover:text-white border border-triton-slate/50 transition-colors"
                                title="Editar Remito y Cantidades"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {/* Auditar directamente */}
                              <button
                                onClick={() => {
                                  const fStr = typeof rem.fecha === 'string' ? rem.fecha.split('T')[0] : new Date(rem.fecha).toISOString().split('T')[0];
                                  setFechaFiltro(fStr);
                                  setActiveHotelTab(rem.hotel_id);
                                  setExpandedHotels({ [rem.hotel_id]: true });
                                  setVistaActiva('auditoria');
                                }}
                                className="px-2 py-1 rounded-lg bg-brand-600/30 hover:bg-brand-600 text-brand-300 hover:text-white border border-brand-700/60 font-bold text-[11px] flex items-center gap-1 transition-colors"
                                title="Ver cruce de auditoría para este remito y fecha"
                              >
                                <ClipboardCheck className="w-3 h-3" />
                                <span>Auditar</span>
                              </button>
                              {/* Eliminar */}
                              <button
                                onClick={() => handleDeleteRemito(rem.id, rem.numero_remito)}
                                className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-400 hover:text-rose-200 border border-rose-800/50 transition-colors"
                                title="Eliminar remito"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Modal para Registrar Conteo de Salida (Océano Corporativo) */}
      {selectedItemForConteo && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-triton-navy rounded-2xl border border-triton-slate/50 max-w-lg w-full max-h-[92dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedItemForConteo(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-triton-deep"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-triton-slate/50 pb-3 mb-4 pr-8">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-300 bg-brand-950/80 border border-brand-800/60 px-2 py-0.5 rounded">
                Registro de Salida y Auditoría
              </span>
              <h3 className="text-base sm:text-lg font-black text-white mt-1.5">
                {selectedItemForConteo.item_nombre} &bull; {selectedItemForConteo.hotel_nombre}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Fecha: <span className="font-semibold text-slate-200">{selectedItemForConteo.fecha}</span> &bull; Declarado en remito:{' '}
                <span className="font-black text-cyan-300">
                  {selectedItemForConteo.cantidad_declarada} prendas
                </span>
              </p>
            </div>

            <form onSubmit={handleSaveConteo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-400 mb-1.5">
                  1. Prendas Limpias (Devueltas OK)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLimpiasInput((v) => Math.max(0, v - 1))}
                    className="w-11 h-10 rounded-xl bg-triton-deep active:bg-triton-slate/80 border border-triton-slate/50 text-white flex items-center justify-center shrink-0"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={limpiasInput}
                    onChange={(e) => setLimpiasInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="flex-1 px-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-center text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setLimpiasInput((v) => v + 1)}
                    className="w-11 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Ropa limpia doblada para entregar al hotel.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-amber-400 mb-1.5 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  2. Prendas para Relavado (Quedan en Lavadero)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRelavadoInput((v) => Math.max(0, v - 1))}
                    className="w-11 h-10 rounded-xl bg-triton-deep active:bg-triton-slate/80 border border-triton-slate/50 text-white flex items-center justify-center shrink-0"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={relavadoInput}
                    onChange={(e) => setRelavadoInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="flex-1 px-3 py-2 bg-triton-deep border border-amber-800/60 rounded-xl text-center text-sm font-bold text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setRelavadoInput((v) => v + 1)}
                    className="w-11 h-10 rounded-xl bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Prendas manchadas que quedan en la planta para un segundo ciclo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-rose-400 mb-1.5">
                  3. Prendas Rotas / Dadas de Baja
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRotasInput((v) => Math.max(0, v - 1))}
                    className="w-11 h-10 rounded-xl bg-triton-deep active:bg-triton-slate/80 border border-triton-slate/50 text-white flex items-center justify-center shrink-0"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={rotasInput}
                    onChange={(e) => setRotasInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="flex-1 px-3 py-2 bg-triton-deep border border-rose-800/60 rounded-xl text-center text-sm font-bold text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setRotasInput((v) => v + 1)}
                    className="w-11 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Ropa que se descarta o separa por rotura/baja.</p>
              </div>

              {/* Resumen del conteo */}
              <div className="p-3.5 bg-triton-deep rounded-xl border border-triton-slate/50 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Total Contado (Limpias + Relavado + Rotas):</span>
                  <span className="font-black text-sm text-white">{totalCalculado}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Diferencia vs lo que mandó el Hotel:</span>
                  <span
                    className={`font-black text-sm ${
                      difCalculada === 0
                        ? 'text-emerald-400'
                        : difCalculada < 0
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {difCalculada > 0 ? `+${difCalculada}` : difCalculada}
                  </span>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItemForConteo(null)}
                  className="px-4 py-2.5 sm:py-2 bg-triton-deep hover:bg-triton-slate/60 text-slate-300 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConteo}
                  className="px-5 py-2.5 sm:py-2 bg-triton-aqua hover:bg-triton-aqua-hover disabled:opacity-40 text-triton-navy text-xs font-black rounded-xl shadow-md shadow-triton-aqua/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{savingConteo ? 'Guardando...' : 'Guardar y Actualizar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Impresión de Remito Oficial */}
      {remitoParaImprimir && (
        <RemitoPrintableModal
          envio={remitoParaImprimir}
          hotelNombre={remitoParaImprimir.hotel?.nombre || ''}
          onClose={() => setRemitoParaImprimir(null)}
        />
      )}

      {/* Modal para Cargar o Modificar Remito en Papel */}
      {modalCargarRemitoOpen && (
        <CargarRemitoModal
          isOpen={modalCargarRemitoOpen}
          onClose={() => {
            setModalCargarRemitoOpen(false);
            setRemitoParaEditar(null);
          }}
          onSuccess={handleRemitoGuardado}
          initialHotelId={hotelPreseleccionado}
          initialFecha={fechaFiltro || undefined}
          remitoParaEditar={remitoParaEditar}
        />
      )}
    </div>
  );
};
