import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { AuditoriaItem, Envio, Hotel } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  Truck,
  Building2,
  PackageCheck,
  RotateCcw,
  AlertTriangle,
  QrCode,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Printer,
  Calendar,
  X,
  FileText,
  AlertOctagon,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { RemitoPrintableModal } from '../hotel360/RemitoPrintableModal';

interface HotelEntregaGroup {
  hotel_id: number;
  hotel_nombre: string;
  items: AuditoriaItem[];
  totalDeclaradas: number;
  totalLimpias: number;
  totalRelavado: number;
  totalRotas: number;
  totalContado: number;
  diferenciaTotal: number;
  envioAsociado?: Envio;
}

export const EntregasView: React.FC = () => {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [hotelFiltro, setHotelFiltro] = useState<number | 'all'>('all');
  const [busquedaPrenda, setBusquedaPrenda] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Escaneo o consulta rápida por QR
  const [qrInput, setQrInput] = useState('');
  const [scannedEnvio, setScannedEnvio] = useState<Envio | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Acordeones abiertos por hotel
  const [expandedHotels, setExpandedHotels] = useState<Record<number, boolean>>({});

  // Modal para imprimir remito de entrega
  const [remitoParaImprimir, setRemitoParaImprimir] = useState<{
    envio: Envio;
    hotelNombre: string;
  } | null>(null);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [fechaFiltro]);

  const cargarCatalogos = async () => {
    try {
      const h = await api.getHoteles();
      setHoteles(h);
    } catch (err) {
      console.error('Error cargando catalogo de hoteles:', err);
    }
  };

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [auditoriaData, enviosData] = await Promise.all([
        api.getAuditoria({ fecha: fechaFiltro || undefined }),
        api.getEnvios({ fecha: fechaFiltro || undefined }).catch(() => [] as Envio[]),
      ]);
      setItems(auditoriaData);
      setEnvios(enviosData);

      // Expandir todos los hoteles por defecto para facilitar la lectura del chofer
      const expandMap: Record<number, boolean> = {};
      auditoriaData.forEach((i) => {
        expandMap[i.hotel_id] = true;
      });
      setExpandedHotels(expandMap);
    } catch (err) {
      console.error('Error cargando entregas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Agrupamiento por Hotel
  const hotelGroups = useMemo<HotelEntregaGroup[]>(() => {
    const map = new Map<number, HotelEntregaGroup>();

    items.forEach((item) => {
      if (!map.has(item.hotel_id)) {
        const envioDelHotel = envios.find((e) => e.hotel_id === item.hotel_id);
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
          envioAsociado: envioDelHotel,
        });
      }

      const g = map.get(item.hotel_id)!;
      g.items.push(item);
      g.totalDeclaradas += item.cantidad_declarada;
      g.totalLimpias += item.cantidad_limpia;
      g.totalRelavado += item.cantidad_relavado;
      g.totalRotas += item.cantidad_rota;
      g.totalContado += item.total_contado;
      g.diferenciaTotal += item.diferencia;
    });

    return Array.from(map.values());
  }, [items, envios]);

  // Filtrado de grupos
  const gruposFiltrados = useMemo(() => {
    let list = hotelGroups;

    if (hotelFiltro !== 'all') {
      list = list.filter((g) => g.hotel_id === hotelFiltro);
    }

    if (busquedaPrenda.trim()) {
      const q = busquedaPrenda.toLowerCase();
      list = list
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => i.item_nombre.toLowerCase().includes(q)),
        }))
        .filter((g) => g.items.length > 0);
    }

    return list;
  }, [hotelGroups, hotelFiltro, busquedaPrenda]);

  // Totales de la carga del vehículo
  const totalLimpiasCarga = hotelGroups.reduce((acc, g) => acc + g.totalLimpias, 0);
  const totalRelavadosCarga = hotelGroups.reduce((acc, g) => acc + g.totalRelavado, 0);
  const totalRotasCarga = hotelGroups.reduce((acc, g) => acc + g.totalRotas, 0);
  const totalHotelesCarga = hotelGroups.filter((g) => g.totalLimpias > 0).length;

  const toggleHotel = (hotelId: number) => {
    setExpandedHotels((prev) => ({
      ...prev,
      [hotelId]: !prev[hotelId],
    }));
  };

  const handleBuscarQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;

    setScanError(null);
    try {
      const envio = await api.getEnvioByQR(qrInput.trim());
      setScannedEnvio(envio);
      setQrInput('');
      if (envio.hotel_id) {
        setHotelFiltro(envio.hotel_id);
        setExpandedHotels((prev) => ({ ...prev, [envio.hotel_id]: true }));
      }
    } catch (err: any) {
      setScanError(err.message || 'No se encontró remito con ese código QR.');
      setScannedEnvio(null);
    }
  };

  const abrirRemitoImpresion = (group: HotelEntregaGroup) => {
    if (group.envioAsociado) {
      setRemitoParaImprimir({
        envio: group.envioAsociado,
        hotelNombre: group.hotel_nombre,
      });
      return;
    }

    // Si no hay objeto Envio digital formal pero sí auditoría, construimos el remito sintético de entrega
    const syntheticEnvio: Envio = {
      id: group.hotel_id,
      hotel_id: group.hotel_id,
      fecha: fechaFiltro || new Date().toISOString().split('T')[0],
      codigo_qr: `ENTREGA-${group.hotel_id}-${(fechaFiltro || '').replace(/-/g, '')}`,
      creado_en: new Date().toISOString(),
      detalles: group.items.map((it, idx) => ({
        id: idx + 1,
        envio_id: group.hotel_id,
        item_id: it.item_id,
        item: { id: it.item_id, nombre: it.item_nombre, precio_unitario: null, se_factura: false },
        cantidad_declarada: it.cantidad_limpia, // Lo limpio que se entrega efectivamente
      })),
    };

    setRemitoParaImprimir({
      envio: syntheticEnvio,
      hotelNombre: group.hotel_nombre,
    });
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* 1. Encabezado Oficial para Reparto */}
      <div className="bg-[#0b1a33]/90 border border-[#1e3659] rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Hoja de Ruta & Entregas
                </h1>
                <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Solo Consulta
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Resumen de ropa procesada a entregar por hotel &bull; Cruce con remito de origen
              </p>
            </div>
          </div>
        </div>

        {/* Lector / Búsqueda rápida QR para el chofer */}
        <form onSubmit={handleBuscarQR} className="flex items-center gap-2 max-w-sm w-full md:w-auto">
          <div className="relative flex-1">
            <QrCode className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Escanear QR Remito (ENV-...)"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#071326] border border-[#1e3659] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-400 font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Buscar</span>
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

      {/* Remito QR Escaneado Directo */}
      {scannedEnvio && (
        <div className="bg-blue-950/60 border border-blue-700/60 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-300">Remito Detectado</span>
              <p className="text-sm font-bold text-white">
                {scannedEnvio.hotel?.nombre || `Hotel #${scannedEnvio.hotel_id}`} &mdash;{' '}
                <span className="font-mono text-xs text-blue-300">{scannedEnvio.codigo_qr}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setScannedEnvio(null)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#132747]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Tarjetas de Carga del Vehículo (KPIs para el Repartidor) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Limpias a Entregar */}
        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20 shadow-lg">
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Listo a Entregar
            </span>
            <PackageCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">
            {formatNumber(totalLimpiasCarga)}
          </p>
          <p className="text-[10px] text-emerald-300/80 font-medium">
            Prendas limpias en el vehículo
          </p>
        </div>

        {/* Hoteles en Ruta */}
        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-blue-800/60 bg-blue-950/20 shadow-lg">
          <div className="flex items-center justify-between text-blue-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Hoteles en Ruta
            </span>
            <Building2 className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">
            {totalHotelesCarga}
          </p>
          <p className="text-[10px] text-blue-300/80 font-medium">
            Destinos con entrega hoy
          </p>
        </div>

        {/* En Relavado (Quedaron en Planta) */}
        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-amber-800/60 bg-amber-950/20 shadow-lg">
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              En Relavado
            </span>
            <RotateCcw className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-400">
            {formatNumber(totalRelavadosCarga)}
          </p>
          <p className="text-[10px] text-amber-300/80 font-medium">
            Pendientes (quedaron en planta)
          </p>
        </div>

        {/* Prendas Dadas de Baja */}
        <div className="bg-[#0b1a33]/90 p-4 rounded-xl border border-rose-800/60 bg-rose-950/20 shadow-lg">
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              Roturas / Bajas
            </span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-400">
            {formatNumber(totalRotasCarga)}
          </p>
          <p className="text-[10px] text-rose-300/80 font-medium">
            Prendas dañadas registradas
          </p>
        </div>
      </div>

      {/* 3. Filtros Rápidos y Selector */}
      <div className="bg-[#0b1a33]/90 p-4 rounded-2xl border border-[#1e3659] shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Selector de Fecha */}
          <div className="flex items-center gap-2 bg-[#071326] px-3 py-2 rounded-xl border border-[#1e3659] w-full sm:w-auto">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold text-slate-400">Fecha:</span>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
            />
            {fechaFiltro !== new Date().toISOString().split('T')[0] && (
              <button
                onClick={() => setFechaFiltro(new Date().toISOString().split('T')[0])}
                className="text-[10px] text-blue-400 hover:text-white underline font-semibold ml-1"
              >
                Hoy
              </button>
            )}
          </div>

          {/* Selector de Hotel */}
          <div className="flex items-center gap-2 bg-[#071326] px-3 py-2 rounded-xl border border-[#1e3659] w-full sm:w-auto">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={hotelFiltro}
              onChange={(e) =>
                setHotelFiltro(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-[#071326] text-white">
                Todos los Hoteles ({hotelGroups.length})
              </option>
              {hoteles.map((h) => (
                <option key={h.id} value={h.id} className="bg-[#071326] text-white">
                  {h.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Buscador de Prenda */}
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar prenda..."
              value={busquedaPrenda}
              onChange={(e) => setBusquedaPrenda(e.target.value)}
              className="w-full bg-[#071326] border border-[#1e3659] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Acciones de Vista */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const all: Record<number, boolean> = {};
              gruposFiltrados.forEach((g) => {
                all[g.hotel_id] = true;
              });
              setExpandedHotels(all);
            }}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-[#132747] hover:bg-[#1e3659] rounded-lg transition-colors"
          >
            Expandir todo
          </button>
          <button
            onClick={() => setExpandedHotels({})}
            className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-[#071326] border border-[#1e3659] rounded-lg transition-colors"
          >
            Colapsar
          </button>
        </div>
      </div>

      {/* 4. Lista de Entregas por Hotel */}
      {loading ? (
        <div className="bg-[#0b1a33]/80 border border-[#1e3659] rounded-2xl p-8 text-center text-slate-400 text-xs">
          <p className="animate-pulse font-bold text-blue-300">
            Cargando hoja de ruta de entregas...
          </p>
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="bg-[#0b1a33]/80 border border-[#1e3659] rounded-2xl p-10 text-center space-y-3">
          <Truck className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">
            No hay entregas registradas para los filtros seleccionados
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No se encontraron prendas procesadas para esta fecha o cliente. Verifica la fecha seleccionada o prueba con otra parada de ruta.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gruposFiltrados.map((group, index) => {
            const isExpanded = !!expandedHotels[group.hotel_id];
            const hayRelavados = group.totalRelavado > 0;
            const hayRoturas = group.totalRotas > 0;
            const coincideExacto = group.diferenciaTotal === 0 && !hayRelavados && !hayRoturas;

            return (
              <div
                key={group.hotel_id}
                className="bg-[#0b1a33]/90 border border-[#1e3659] rounded-2xl overflow-hidden shadow-xl transition-all"
              >
                {/* Cabecera de la Parada / Hotel */}
                <div
                  onClick={() => toggleHotel(group.hotel_id)}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-[#132747]/40 transition-colors select-none"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 font-black text-xs">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base sm:text-lg font-black text-white">
                          {group.hotel_nombre}
                        </h2>
                        {coincideExacto ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Carga Exacta (OK)
                          </span>
                        ) : hayRelavados ? (
                          <span className="inline-flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <RotateCcw className="w-3 h-3 text-amber-400" />
                            {group.totalRelavado} en relavado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-blue-950/80 text-blue-300 border border-blue-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <FileText className="w-3 h-3 text-blue-400" />
                            {group.totalLimpias} prendas listas
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Declaradas por hotel: <span className="text-slate-300 font-semibold">{formatNumber(group.totalDeclaradas)}</span>
                        {group.envioAsociado?.codigo_qr && (
                          <> &bull; Remito: <span className="font-mono text-blue-300">{group.envioAsociado.codigo_qr}</span></>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Resumen numérico y Acciones */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-baseline gap-1.5 justify-end">
                        <span className="text-xl sm:text-2xl font-black text-emerald-400">
                          {formatNumber(group.totalLimpias)}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">limpias</span>
                      </div>
                      <p className="text-[10px] text-slate-400">a entregar al cliente</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirRemitoImpresion(group);
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all"
                        title="Ver e imprimir remito oficial de entrega"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remito Entrega</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleHotel(group.hotel_id);
                        }}
                        className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-[#132747]"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Contenido Desplegado */}
                {isExpanded && (
                  <div className="border-t border-[#1e3659] bg-[#071326]/50 p-4 sm:p-5 space-y-4">
                    {/* Alerta de novedad para el chofer si hay prendas en relavado o rotas */}
                    {(hayRelavados || hayRoturas) && (
                      <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Aviso para informar al recibir en el hotel:</p>
                          <p className="text-[11px] text-amber-300/90 mt-0.5">
                            {hayRelavados && (
                              <span>&bull; {group.totalRelavado} prendas quedaron retenidas en lavadero para relavado por manchas difíciles. Se entregan en el siguiente despacho. </span>
                            )}
                            {hayRoturas && (
                              <span>&bull; {group.totalRotas} prendas fueron dadas de baja por rotura y están asentadas en la auditoría.</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Tabla Detallada de Prendas */}
                    <div className="overflow-x-auto rounded-xl border border-[#1e3659]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#071326] text-slate-400 font-bold uppercase tracking-wider border-b border-[#1e3659]">
                          <tr>
                            <th className="px-4 py-3 min-w-[150px]">Prenda / Artículo</th>
                            <th className="px-3 py-3 text-right">Remitado por Hotel</th>
                            <th className="px-3 py-3 text-right text-emerald-400 font-black">
                              A Entregar (Limpias)
                            </th>
                            <th className="px-3 py-3 text-right text-amber-400">En Relavado</th>
                            <th className="px-3 py-3 text-right text-rose-400">Rotas</th>
                            <th className="px-3 py-3 text-right">Diferencia</th>
                            <th className="px-4 py-3 text-center">Estado</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-[#1e3659]/50 bg-[#071326]/30">
                          {group.items.map((row, idx) => (
                            <tr
                              key={`${row.item_id}-${idx}`}
                              className="hover:bg-[#132747]/40 transition-colors"
                            >
                              <td className="px-4 py-2.5 font-bold text-white">
                                {row.item_nombre}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-300">
                                {formatNumber(row.cantidad_declarada)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-black text-emerald-400 text-sm">
                                {formatNumber(row.cantidad_limpia)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-amber-400">
                                {row.cantidad_relavado > 0 ? (
                                  <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.5 rounded font-bold">
                                    {row.cantidad_relavado}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-rose-400">
                                {row.cantidad_rota > 0 ? (
                                  <span className="bg-rose-950/80 text-rose-300 border border-rose-800/60 px-1.5 py-0.5 rounded font-bold">
                                    {row.cantidad_rota}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold">
                                {row.diferencia > 0 ? (
                                  <span className="text-amber-400">+{row.diferencia}</span>
                                ) : row.diferencia < 0 ? (
                                  <span className="text-rose-400">{row.diferencia}</span>
                                ) : (
                                  <span className="text-emerald-400">0</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {row.estado === 'OK' && (
                                  <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    OK
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
                                  <span className="inline-flex items-center gap-1 bg-blue-950/80 text-blue-300 border border-blue-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    <Clock className="w-3 h-3 text-blue-400" />
                                    En Lavado
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>

                        <tfoot className="bg-[#071326] font-extrabold border-t-2 border-[#1e3659]">
                          <tr>
                            <td className="px-4 py-2.5 text-white uppercase text-[10px]">
                              Total Entrega {group.hotel_nombre}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-300">
                              {formatNumber(group.totalDeclaradas)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-emerald-400 text-sm">
                              {formatNumber(group.totalLimpias)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-amber-400">
                              {group.totalRelavado > 0 ? formatNumber(group.totalRelavado) : '-'}
                            </td>
                            <td className="px-3 py-2.5 text-right text-rose-400">
                              {group.totalRotas > 0 ? formatNumber(group.totalRotas) : '-'}
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
                            <td className="px-4 py-2.5 text-center text-slate-400 text-[10px]">
                              {coincideExacto ? 'Completado' : 'Con diferencias'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Impresión de Remito de Entrega */}
      {remitoParaImprimir && (
        <RemitoPrintableModal
          envio={remitoParaImprimir.envio}
          hotelNombre={remitoParaImprimir.hotelNombre}
          onClose={() => setRemitoParaImprimir(null)}
        />
      )}
    </div>
  );
};
