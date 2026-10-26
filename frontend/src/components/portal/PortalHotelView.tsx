import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import { Item, PortalHotelDashboard, Envio } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  PlusCircle,
  QrCode,
  Printer,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  Minus,
  Search,
  Share2,
  FileText,
} from 'lucide-react';
import { FichaHotel360 } from '../../types';
import { LiquidacionPrintable } from '../hotel360/LiquidacionPrintable';
import { RemitoPrintableModal } from '../hotel360/RemitoPrintableModal';

export const PortalHotelView: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'nuevo_remito' | 'dashboard' | 'historial' | 'liquidacion'>('nuevo_remito');
  const [dashboard, setDashboard] = useState<PortalHotelDashboard | null>(null);
  const [ficha, setFicha] = useState<FichaHotel360 | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario nuevo remito
  const [fechaEnvio, setFechaEnvio] = useState(new Date().toISOString().split('T')[0]);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [filtroPrenda, setFiltroPrenda] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdEnvio, setCreatedEnvio] = useState<Envio | null>(null);
  const [selectedRemitoForModal, setSelectedRemitoForModal] = useState<Envio | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [dashData, itemsData, enviosData, fichaData] = await Promise.all([
        api.getPortalDashboard().catch((err) => {
          console.error('Error cargando dashboard portal:', err);
          return null;
        }),
        api.getItems(),
        api.getEnvios().catch((err) => {
          console.error('Error cargando envios portal:', err);
          return [] as Envio[];
        }),
        user?.hotel_id
          ? api.getFichaHotel360(user.hotel_id).catch((err) => {
              console.error('Error cargando ficha 360:', err);
              return null;
            })
          : Promise.resolve(null),
      ]);
      if (dashData) setDashboard(dashData);
      setItems(Array.isArray(itemsData) ? itemsData : []);
      setEnvios(Array.isArray(enviosData) ? enviosData : []);
      if (fichaData) setFicha(fichaData);
    } catch (err) {
      console.error('Error cargando portal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCantidadChange = (itemId: number, valor: string | number) => {
    const num = typeof valor === 'number' ? valor : parseInt(valor, 10);
    setCantidades((prev) => ({
      ...prev,
      [itemId]: isNaN(num) || num < 0 ? 0 : num,
    }));
  };

  const incrementar = (itemId: number, delta: number) => {
    setCantidades((prev) => {
      const actual = prev[itemId] || 0;
      const nuevo = Math.max(0, actual + delta);
      return { ...prev, [itemId]: nuevo };
    });
  };

  const totalPrendasDeclaradas = Object.values(cantidades).reduce((a, b) => a + b, 0);

  const handleSubmitRemito = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (totalPrendasDeclaradas === 0) {
      alert('Debes indicar al menos una prenda para enviar.');
      return;
    }

    setSubmitting(true);
    try {
      const detalles = Object.entries(cantidades)
        .filter(([_, cant]) => cant > 0)
        .map(([itemId, cant]) => ({
          item_id: parseInt(itemId, 10),
          cantidad_declarada: cant,
        }));

      const nuevo = await api.createEnvio({
        fecha: fechaEnvio,
        detalles,
      });

      setCreatedEnvio(nuevo);
      setCantidades({});
      await cargarDatos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al enviar remito');
    } finally {
      setSubmitting(false);
    }
  };

  const prendasFiltradas = items.filter((it) =>
    it.nombre.toLowerCase().includes(filtroPrenda.toLowerCase())
  );

  const compartirWhatsApp = (env: Envio) => {
    const texto = `*REMITO LAVANDERIA - ${user?.hotel_nombre || 'Hotel'}*\nFecha: ${new Date(
      env.fecha
    ).toLocaleDateString('es-AR')}\nCodigo: ${env.codigo_qr}\nTotal Prendas: ${
      env.detalles?.reduce((acc, d) => acc + d.cantidad_declarada, 0) || 0
    }\nVerificado para chofer de TRITÓN Lavadero Industrial.`;
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-triton-navy/90 border border-triton-slate/50 rounded-xl p-12 text-center shadow-lg">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent mb-3" />
        <p className="text-sm text-slate-300 font-medium">Cargando portal móvil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      {/* Encabezado Mobile-Friendly */}
      <div className="bg-triton-navy/95 border border-triton-slate/40 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-triton-slate/50 bg-triton-deep shrink-0 p-1 flex items-center justify-center shadow-inner">
              <img src="/logo-triton.jpg" alt="TRITÓN" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-triton-deep text-triton-aqua border border-triton-teal/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Portal Hotel B2B
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-xs font-semibold">TRITÓN Lavadero Industrial</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1">
                {user?.hotel_nombre || dashboard?.hotel_nombre || 'Mi Hotel'}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Carga rápida de remitos de ropa sucia y control de estado.
              </p>
            </div>
          </div>

          {/* Botones de navegación tipo Pestañas Mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-triton-deep border border-triton-slate/50 p-1 rounded-xl w-full sm:w-auto mt-2 sm:mt-0">
            <button
              onClick={() => setActiveTab('nuevo_remito')}
              className={`py-2 px-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'nuevo_remito'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-white hover:bg-triton-deep'
              }`}
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Cargar</span>
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2 px-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-white hover:bg-triton-deep'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Estado</span>
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`py-2 px-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'historial'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-white hover:bg-triton-deep'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>Remitos ({envios.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('liquidacion')}
              className={`py-2 px-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'liquidacion'
                  ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                  : 'text-slate-400 hover:text-white hover:bg-triton-deep'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Liquidación</span>
            </button>
          </div>
        </div>
      </div>

      {/* TICKET / QR CODE GENERADO PARA EL CHOFER (VISTA CELULAR) */}
      {createdEnvio && (
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-2xl p-5 sm:p-6 shadow-xl animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/20 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg">¡Remito Confirmado!</h3>
                <p className="text-xs text-emerald-100">
                  Mostrale este código en pantalla al chofer del lavadero.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCreatedEnvio(null)}
              className="text-white/80 hover:text-white text-xs bg-white/10 px-2.5 py-1 rounded-lg"
            >
              Cerrar
            </button>
          </div>

          <div className="bg-white text-slate-800 p-4 sm:p-5 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Código Único de Remito
              </span>
              <p className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-wider">
                {createdEnvio.codigo_qr}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Fecha:{' '}
                <span className="font-semibold text-slate-700">
                  {new Date(createdEnvio.fecha).toLocaleDateString('es-AR')}
                </span>{' '}
                • Hotel: <span className="font-semibold text-slate-700">{user?.hotel_nombre}</span>
              </p>
            </div>

            {/* Código QR grande para escanear de celular a celular o tablet */}
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                  createdEnvio.codigo_qr
                )}`}
                alt="Código QR del Remito"
                className="w-32 h-32 sm:w-28 sm:h-28 rounded-lg mx-auto"
              />
            </div>
          </div>

          {/* Botones de acción móvil */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => compartirWhatsApp(createdEnvio)}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
            >
              <Share2 className="w-4 h-4" />
              Enviar por WhatsApp
            </button>
            <button
              onClick={() => window.print()}
              className="py-2.5 px-3 bg-white/20 hover:bg-white/30 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Imprimir Etiqueta
            </button>
          </div>
        </div>
      )}

      {/* 1. VISTA CARGA DE REMITO (MOBILE FIRST PARA MUCAMAS) */}
      {activeTab === 'nuevo_remito' && (
        <div className="space-y-4">
          {/* Barra de Fecha y Buscador */}
          <div className="bg-triton-navy/90 border border-triton-slate/50 p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row gap-3">
            <div className="sm:w-48">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Fecha de Entrega
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="date"
                  value={fechaEnvio}
                  onChange={(e) => setFechaEnvio(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Buscar Prenda Rápido
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ej: Sábana, Toalla, Funda..."
                  value={filtroPrenda}
                  onChange={(e) => setFiltroPrenda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-triton-deep border border-triton-slate/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {filtroPrenda && (
                  <button
                    onClick={() => setFiltroPrenda('')}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tarjetas Táctiles de Prendas (Optimizadas para dedos / Celular) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {prendasFiltradas.map((it) => {
              const cant = cantidades[it.id] || 0;
              const hasQty = cant > 0;
              return (
                <div
                  key={it.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    hasQty
                      ? 'bg-brand-950/60 border-brand-500/70 shadow-lg shadow-brand-950/50'
                      : 'bg-triton-navy/90 border-triton-slate/50 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-base text-white leading-snug line-clamp-1">
                      {it.nombre}
                    </span>
                    {hasQty && (
                      <span className="bg-brand-600 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-sm">
                        {cant}
                      </span>
                    )}
                  </div>

                  {/* Stepper Táctil Grande */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, -1)}
                      disabled={cant <= 0}
                      className="w-12 h-11 bg-triton-deep active:bg-triton-slate/80 disabled:opacity-20 disabled:pointer-events-none rounded-xl flex items-center justify-center text-slate-200 font-black text-lg transition-colors touch-manipulation border border-triton-slate/50"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={cant === 0 ? '' : cant}
                      placeholder="0"
                      onChange={(e) => handleCantidadChange(it.id, e.target.value)}
                      className="flex-1 h-11 text-center font-black text-lg text-white bg-triton-deep border border-triton-slate/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />

                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 1)}
                      className="w-12 h-11 bg-brand-600 active:bg-brand-700 text-white rounded-xl flex items-center justify-center font-black text-lg transition-colors shadow-sm touch-manipulation hover:bg-brand-500"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Atajos de conteo rápido para mucamas (+10, +25, +50) */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 5)}
                      className="py-1 text-xs font-bold text-slate-300 bg-triton-deep hover:bg-triton-slate/60 border border-triton-slate/50 rounded-lg active:scale-95 transition-all"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 10)}
                      className="py-1 text-xs font-bold text-slate-300 bg-triton-deep hover:bg-triton-slate/60 border border-triton-slate/50 rounded-lg active:scale-95 transition-all"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 25)}
                      className="py-1 text-xs font-bold text-slate-300 bg-triton-deep hover:bg-triton-slate/60 border border-triton-slate/50 rounded-lg active:scale-95 transition-all"
                    >
                      +25
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BARRA INFERIOR FLOTANTE FIJA EN MÓVIL (Sticky Bar) */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-triton-navy/95 backdrop-blur-md border-t border-triton-slate/50 p-3.5 sm:hidden shadow-2xl">
            <div className="max-w-md mx-auto flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Prendas
                </span>
                <p className="text-xl font-black text-brand-400 leading-tight">
                  {formatNumber(totalPrendasDeclaradas)}{' '}
                  <span className="text-xs font-medium text-slate-400">u.</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSubmitRemito()}
                disabled={submitting || totalPrendasDeclaradas === 0}
                className="flex-1 py-3 px-4 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] disabled:opacity-40 disabled:pointer-events-none text-triton-navy font-black text-sm rounded-xl shadow-lg shadow-triton-aqua/30 flex items-center justify-center gap-2 transition-all"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>{submitting ? 'Generando...' : 'Confirmar y QR'}</span>
              </button>
            </div>
          </div>

          {/* Botón flotante para pantallas grandes */}
          <div className="hidden sm:flex bg-triton-navy/90 border border-triton-slate/50 p-5 rounded-2xl shadow-xl items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Resumen del Remito
              </span>
              <p className="text-2xl font-black text-brand-400">
                {formatNumber(totalPrendasDeclaradas)}{' '}
                <span className="text-sm font-semibold text-slate-400">prendas en las bolsas</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleSubmitRemito()}
              disabled={submitting || totalPrendasDeclaradas === 0}
              className="py-3 px-6 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] disabled:opacity-40 text-triton-navy font-black text-sm rounded-xl shadow-md shadow-triton-aqua/30 flex items-center gap-2 transition-all"
            >
              <QrCode className="w-5 h-5" />
              <span>{submitting ? 'Generando remito...' : 'Confirmar y Generar Código QR'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. VISTA DASHBOARD Y ESTADO EN LAVADERO */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Tarjetas KPI Mobile */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-triton-slate/50 shadow-lg">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-400">Total Mes</span>
              <p className="text-xl sm:text-2xl font-black text-white mt-1">
                {formatNumber(dashboard?.total_prendas_mes || 0)}
              </p>
              <p className="text-[10px] text-slate-400">Prendas procesadas</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20 shadow-lg">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-emerald-400">Limpias</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
                {formatNumber(dashboard?.prendas_facturables || 0)}
              </p>
              <p className="text-[10px] text-emerald-500/80">Entregadas OK</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-amber-800/60 bg-amber-950/20 shadow-lg">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-amber-400">En Lavadero</span>
              <p className="text-xl sm:text-2xl font-black text-amber-400 mt-1">
                {formatNumber(dashboard?.prendas_relavadas || 0)}
              </p>
              <p className="text-[10px] text-amber-500/80">En relavado</p>
            </div>

            <div className="bg-triton-navy/90 p-3.5 sm:p-4 rounded-xl border border-rose-800/60 bg-rose-950/20 shadow-lg">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-rose-400">Bajas</span>
              <p className="text-xl sm:text-2xl font-black text-rose-400 mt-1">
                {formatNumber(dashboard?.prendas_rotas || 0)}
              </p>
              <p className="text-[10px] text-rose-500/80">Por rotura</p>
            </div>
          </div>

          {/* TABLA PRINCIPAL: ESTADO DE PRENDAS EN LAVADERO */}
          <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-triton-slate/50 bg-triton-deep/60">
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-400" />
                Ropa en Tránsito y Estado en Lavadero
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Prendas limpias devueltas vs. las que quedaron en relavado o rotas.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-300">
                <thead className="bg-triton-deep text-slate-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b border-triton-slate/50">
                  <tr>
                    <th className="px-3 sm:px-4 py-3">Prenda</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-emerald-400">Limpias (OK)</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-amber-400">En Relavado</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-rose-400">Rotas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-triton-slate/40">
                  {dashboard?.ropa_en_lavadero && dashboard.ropa_en_lavadero.length > 0 ? (
                    dashboard.ropa_en_lavadero.map((row) => (
                      <tr key={row.item_id} className="hover:bg-triton-deep/40 transition-colors">
                        <td className="px-3 sm:px-4 py-3 font-bold text-white">{row.item_nombre}</td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-emerald-400">
                          {formatNumber(row.limpias_devueltas)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-amber-400">
                          {row.en_relavado > 0 ? (
                            <span className="bg-amber-950/80 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded text-[11px] font-black">
                              {row.en_relavado} en lavadero
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-rose-400">
                          {row.dadas_de_baja > 0 ? (
                            <span className="bg-rose-950/80 text-rose-300 border border-rose-800/60 px-1.5 py-0.5 rounded text-[11px]">
                              {row.dadas_de_baja}
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No hay registros en tránsito este mes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. HISTORIAL DE REMITOS */}
      {activeTab === 'historial' && (
        <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-triton-slate/50 bg-triton-deep/60">
            <h3 className="font-bold text-sm sm:text-base text-white">Historial de Remitos Emitidos</h3>
          </div>
          <div className="divide-y divide-triton-slate/40">
            {envios.length > 0 ? (
              envios.map((env) => (
                <div key={env.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-triton-deep/30 transition-colors">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-white">
                        {new Date(env.fecha).toLocaleDateString('es-AR')}
                      </span>
                      <span className="font-mono text-[11px] bg-triton-deep text-brand-300 border border-triton-slate/50 px-2 py-0.5 rounded font-bold">
                        {env.codigo_qr}
                      </span>
                      {env.estado === 'retirado' ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" />
                          <span>Retirado - En camino al lavadero</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Listo para retiro (Repartidor avisado)</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {env.detalles && env.detalles.length > 0 ? (
                        env.detalles.map((d) => (
                          <span
                            key={d.id}
                            className="text-[11px] bg-brand-950/50 text-brand-300 px-2 py-0.5 rounded font-medium border border-brand-800/60"
                          >
                            {d.item?.nombre}: <b>{d.cantidad_declarada}</b>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Sin detalle</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedRemitoForModal(env)}
                    className="w-full sm:w-auto px-3 py-1.5 bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-700/50 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Ver / Imprimir Remito
                  </button>
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-slate-500 py-8">No hay remitos registrados.</p>
            )}
          </div>
        </div>
      )}

      {/* 4. LIQUIDACIÓN MENSUAL B2B */}
      {activeTab === 'liquidacion' && (
        <div className="space-y-4">
          {ficha ? (
            <LiquidacionPrintable
              hotelId={ficha.hotel_id}
              hotelNombre={ficha.hotel_nombre}
              fechaDesde={ficha.fecha_desde}
              fechaHasta={ficha.fecha_hasta}
              items={ficha.consumo_prendas}
              facturacionTotal={ficha.facturacion_estimada}
              onExportCSV={() =>
                api.exportarLiquidacionCSV(ficha.hotel_id, {
                  fecha_desde: ficha.fecha_desde,
                  fecha_hasta: ficha.fecha_hasta,
                })
              }
            />
          ) : (
            <div className="bg-triton-navy/90 p-12 rounded-2xl border border-triton-slate/50 text-center text-slate-400 text-xs">
              No hay datos de facturación disponibles para este período.
            </div>
          )}
        </div>
      )}

      {/* Modal de Impresión de Remito */}
      {selectedRemitoForModal && (
        <RemitoPrintableModal
          envio={selectedRemitoForModal}
          hotelNombre={user?.hotel_nombre || dashboard?.hotel_nombre || ''}
          onClose={() => setSelectedRemitoForModal(null)}
        />
      )}
    </div>
  );
};
