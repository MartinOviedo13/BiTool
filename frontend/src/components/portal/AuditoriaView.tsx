import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { AuditoriaItem, Envio } from '../../types';
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
} from 'lucide-react';
import { RemitoPrintableModal } from '../hotel360/RemitoPrintableModal';

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

  // Estados de navegación por Hotel: Acordeón y Pestaña activa
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
  }, [fechaFiltro]);

  const cargarAuditoria = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditoria({
        fecha: fechaFiltro || undefined,
      });
      setItems(data);
    } catch (err) {
      console.error('Error cargando auditoria:', err);
    } finally {
      setLoading(false);
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
    <div className="space-y-5 animate-fade-in">
      {/* 1. Encabezado & Lector QR */}
      <div className="bg-[#0b1a33]/90 border border-[#1e3659] rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-brand-400" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Auditoría y Cruce de Remitos por Hotel
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Control individualizado por cliente: prendas declaradas vs. limpias, relavadas y roturas.
          </p>
        </div>

        {/* Lector de QR para el Operario */}
        <form onSubmit={handleBuscarQR} className="flex items-center gap-2 max-w-md w-full md:w-auto">
          <div className="relative flex-1">
            <QrCode className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Escanear Remito QR (ENV-...)"
              value={qrCodeInput}
              onChange={(e) => setQrCodeInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#071326] border border-[#1e3659] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={scanning}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-brand-600/30 flex items-center gap-1.5 transition-all shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Consultar</span>
          </button>
        </form>
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
        <div className="bg-brand-950/70 border border-brand-700/60 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start justify-between gap-4 animate-fadeIn">
          <div className="space-y-1.5">
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
                      className="bg-[#071326] border border-[#1e3659] px-2.5 py-1 rounded-lg text-xs"
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

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setRemitoParaImprimir(scannedEnvio)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/30 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Remito</span>
            </button>
            <button
              onClick={() => setScannedEnvio(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#132747]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Tarjetas de Resumen Global (4 KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/15 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Coincidencias</span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-white">{totalOK}</p>
          <p className="text-[10px] text-slate-400">Prendas exactas (OK)</p>
        </div>

        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-rose-800/60 bg-rose-950/15 shadow-lg">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Faltantes</span>
            <AlertOctagon className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-400">{totalFaltantes}</p>
          <p className="text-[10px] text-slate-400">Prendas de menos</p>
        </div>

        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-amber-800/60 bg-amber-950/15 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Sobrantes</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-400">{totalSobrantes}</p>
          <p className="text-[10px] text-slate-400">Prendas contadas de más</p>
        </div>

        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-brand-800/60 bg-brand-950/15 shadow-lg">
          <div className="flex items-center justify-between text-brand-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Pendientes</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-brand-300">{totalPendientes}</p>
          <p className="text-[10px] text-slate-400">En proceso de lavado</p>
        </div>
      </div>

      {/* 3. Barra de Controles y Selector de Pestañas por Hotel */}
      <div className="bg-[#0b1a33]/90 p-4 rounded-2xl border border-[#1e3659] shadow-xl space-y-3">
        {/* Controles de Filtros Superiores */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Selector de Fecha */}
            <div className="flex items-center gap-2 bg-[#071326] px-3 py-1.5 rounded-xl border border-[#1e3659]">
              <span className="text-xs font-bold text-slate-400">Fecha:</span>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
              />
              {fechaFiltro && (
                <button
                  onClick={() => setFechaFiltro('')}
                  className="text-[10px] text-slate-400 hover:text-white underline ml-1"
                >
                  Todas
                </button>
              )}
            </div>

            {/* Toggle Solo con Diferencias */}
            <button
              onClick={() => setSoloConDiferencias(!soloConDiferencias)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                soloConDiferencias
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700 shadow-sm'
                  : 'bg-[#071326] text-slate-400 border-[#1e3659] hover:text-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Solo con Diferencias</span>
            </button>

            {/* Buscador de Prenda */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar prenda..."
                value={busquedaPrenda}
                onChange={(e) => setBusquedaPrenda(e.target.value)}
                className="bg-[#071326] border border-[#1e3659] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-400 w-36 sm:w-44"
              />
            </div>
          </div>

          {/* Acciones de Acordeón: Expandir / Colapsar */}
          <div className="flex items-center gap-2">
            <button
              onClick={expandirTodos}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-[#132747] hover:bg-[#1e3659] rounded-lg transition-colors"
            >
              Expandir todos
            </button>
            <button
              onClick={colapsarTodos}
              className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-[#071326] border border-[#1e3659] rounded-lg transition-colors"
            >
              Colapsar todos
            </button>
            <button
              onClick={cargarAuditoria}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] font-bold text-brand-300 hover:text-white bg-brand-950/80 border border-brand-800/60 rounded-lg transition-colors"
            >
              Actualizar
            </button>
          </div>
        </div>

        {/* Pestañas Rápidas de Hoteles (Tabs Horizontales) */}
        {hotelGroups.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-[#1e3659]/60">
            <button
              onClick={() => setActiveHotelTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                activeHotelTab === 'all'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                  : 'bg-[#071326] text-slate-400 hover:text-slate-200 border border-[#1e3659]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Todos los Hoteles ({hotelGroups.length})</span>
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
                      ? 'bg-[#071326] text-amber-300 border-amber-800/60 hover:bg-[#132747]'
                      : 'bg-[#071326] text-slate-300 border-[#1e3659] hover:bg-[#132747]'
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
        <div className="bg-[#0b1a33]/90 rounded-2xl border border-[#1e3659] p-16 text-center shadow-xl">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
          <p className="text-xs text-slate-400 font-semibold">
            Calculando auditoría y agrupando hoteles en tiempo real...
          </p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="bg-[#0b1a33]/90 rounded-2xl border border-[#1e3659] p-12 text-center text-slate-400 text-xs shadow-xl">
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
                    ? 'bg-[#0b1a33] border-brand-500/50 shadow-black/30'
                    : 'bg-[#0b1a33]/80 border-[#1e3659] hover:border-slate-500'
                }`}
              >
                {/* Cabecera del Hotel (Encuadre independiente) */}
                <div
                  onClick={() => toggleHotel(group.hotel_id)}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-[#071326]/60 border-b border-[#1e3659]' : 'hover:bg-[#132747]/30'
                  }`}
                >
                  {/* Título del Hotel y Resumen Rápido */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#071326] border border-[#1e3659] text-brand-400 shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                          {group.hotel_nombre}
                        </h2>
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
                        {group.items.length} prenda(s) auditadas &bull; Declaradas: {formatNumber(group.totalDeclaradas)} u. &bull; Contadas: {formatNumber(group.totalContado)} u.
                      </p>
                    </div>
                  </div>

                  {/* Badges de Estado y Botón de Despliegue */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[#1e3659]/50">
                    <div className="flex items-center gap-1.5 text-xs">
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

                    <div className="p-1 rounded-lg bg-[#071326] border border-[#1e3659] text-slate-300 hover:text-white">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Contenido Desplegado: Tabla de Prendas del Hotel */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#071326] text-slate-400 font-bold uppercase tracking-wider border-b border-[#1e3659]">
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

                      <tbody className="divide-y divide-[#1e3659]/50 bg-[#071326]/30">
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
                              className="hover:bg-[#132747]/40 transition-colors"
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
                                    <Clock className="w-3 h-3 text-brand-400" />
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
                      <tfoot className="bg-[#071326] font-extrabold border-t-2 border-[#1e3659]">
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal para Registrar Conteo de Salida (Océano Corporativo) */}
      {selectedItemForConteo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0b1a33] rounded-2xl border border-[#1e3659] max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedItemForConteo(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#132747]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-[#1e3659] pb-3 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-300 bg-brand-950/80 border border-brand-800/60 px-2 py-0.5 rounded">
                Registro de Salida y Auditoría
              </span>
              <h3 className="text-lg font-black text-white mt-1.5">
                {selectedItemForConteo.item_nombre} &bull; {selectedItemForConteo.hotel_nombre}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Fecha del lote: <span className="font-semibold text-slate-200">{selectedItemForConteo.fecha}</span> &bull; Declarado en remito:{' '}
                <span className="font-black text-cyan-300">
                  {selectedItemForConteo.cantidad_declarada} prendas
                </span>
              </p>
            </div>

            <form onSubmit={handleSaveConteo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-emerald-400 mb-1">
                  1. Prendas Limpias (Devueltas OK)
                </label>
                <input
                  type="number"
                  min="0"
                  value={limpiasInput}
                  onChange={(e) => setLimpiasInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-[#071326] border border-[#1e3659] rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Ropa limpia doblada para entregar al hotel.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-amber-400 mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  2. Prendas para Relavado (Quedan en Lavadero)
                </label>
                <input
                  type="number"
                  min="0"
                  value={relavadoInput}
                  onChange={(e) => setRelavadoInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-[#071326] border border-amber-800/60 rounded-xl text-sm font-bold text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Prendas manchadas que quedan en la planta para un segundo ciclo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-rose-400 mb-1">
                  3. Prendas Rotas / Dadas de Baja
                </label>
                <input
                  type="number"
                  min="0"
                  value={rotasInput}
                  onChange={(e) => setRotasInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-[#071326] border border-rose-800/60 rounded-xl text-sm font-bold text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Ropa que se descarta o separa por rotura/baja.</p>
              </div>

              {/* Resumen del conteo */}
              <div className="p-3.5 bg-[#071326] rounded-xl border border-[#1e3659] space-y-1.5 text-xs">
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

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItemForConteo(null)}
                  className="px-4 py-2 bg-[#132747] hover:bg-[#1e3659] text-slate-300 text-xs font-bold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConteo}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-brand-600/30 flex items-center gap-1.5 transition-all"
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
    </div>
  );
};
