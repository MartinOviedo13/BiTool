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
} from 'lucide-react';

export const PortalHotelView: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'nuevo_remito' | 'dashboard' | 'historial'>('nuevo_remito');
  const [dashboard, setDashboard] = useState<PortalHotelDashboard | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulario nuevo remito
  const [fechaEnvio, setFechaEnvio] = useState(new Date().toISOString().split('T')[0]);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [filtroPrenda, setFiltroPrenda] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdEnvio, setCreatedEnvio] = useState<Envio | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [dashData, itemsData, enviosData] = await Promise.all([
        api.getPortalDashboard(),
        api.getItems(),
        api.getEnvios(),
      ]);
      setDashboard(dashData);
      setItems(itemsData);
      setEnvios(enviosData);
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
    } catch (err: any) {
      alert(err.message || 'Error al enviar remito');
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
    }\nVerificado para chofer de Poseidón SRL.`;
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3" />
        <p className="text-sm text-slate-500 font-medium">Cargando portal móvil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      {/* Encabezado Mobile-Friendly */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Portal Hotel B2B
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500 text-xs font-semibold">Poseidón Lavandería</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
              {user?.hotel_nombre || dashboard?.hotel_nombre || 'Mi Hotel'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Carga rápida de remitos de ropa sucia y control de estado.
            </p>
          </div>

          {/* Botones de navegación tipo Pestañas Mobile */}
          <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl w-full sm:w-auto mt-2 sm:mt-0">
            <button
              onClick={() => setActiveTab('nuevo_remito')}
              className={`py-2 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'nuevo_remito'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Cargar</span>
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span>Estado</span>
            </button>
            <button
              onClick={() => setActiveTab('historial')}
              className={`py-2 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'historial'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>Remitos ({envios.length})</span>
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
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="sm:w-48">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Fecha de Entrega
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="date"
                  value={fechaEnvio}
                  onChange={(e) => setFechaEnvio(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Buscar Prenda Rápido
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ej: Sábana, Toalla, Funda..."
                  value={filtroPrenda}
                  onChange={(e) => setFiltroPrenda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {filtroPrenda && (
                  <button
                    onClick={() => setFiltroPrenda('')}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
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
                      ? 'bg-blue-50/60 border-blue-300 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-base text-slate-800 leading-snug line-clamp-1">
                      {it.nombre}
                    </span>
                    {hasQty && (
                      <span className="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded-full">
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
                      className="w-12 h-11 bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none rounded-xl flex items-center justify-center text-slate-700 font-black text-lg transition-colors touch-manipulation"
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
                      className="flex-1 h-11 text-center font-black text-lg text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 1)}
                      className="w-12 h-11 bg-blue-600 active:bg-blue-700 text-white rounded-xl flex items-center justify-center font-black text-lg transition-colors shadow-sm touch-manipulation"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Atajos de conteo rápido para mucamas (+10, +25, +50) */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 5)}
                      className="py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg active:scale-95 transition-all"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 10)}
                      className="py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg active:scale-95 transition-all"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => incrementar(it.id, 25)}
                      className="py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg active:scale-95 transition-all"
                    >
                      +25
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BARRA INFERIOR FLOTANTE FIJA EN MÓVIL (Sticky Bar) */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3.5 sm:hidden shadow-2xl">
            <div className="max-w-md mx-auto flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Prendas
                </span>
                <p className="text-xl font-black text-blue-600 leading-tight">
                  {formatNumber(totalPrendasDeclaradas)}{' '}
                  <span className="text-xs font-medium text-slate-500">u.</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSubmitRemito()}
                disabled={submitting || totalPrendasDeclaradas === 0}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 transition-all"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>{submitting ? 'Generando...' : 'Confirmar y QR'}</span>
              </button>
            </div>
          </div>

          {/* Botón flotante para pantallas grandes */}
          <div className="hidden sm:flex bg-white p-5 rounded-2xl border border-slate-200 shadow-sm items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Resumen del Remito
              </span>
              <p className="text-2xl font-black text-blue-600">
                {formatNumber(totalPrendasDeclaradas)}{' '}
                <span className="text-sm font-semibold text-slate-500">prendas en las bolsas</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleSubmitRemito()}
              disabled={submitting || totalPrendasDeclaradas === 0}
              className="py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-md flex items-center gap-2 transition-all"
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
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-400">Total Mes</span>
              <p className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                {formatNumber(dashboard?.total_prendas_mes || 0)}
              </p>
              <p className="text-[10px] text-slate-400">Prendas procesadas</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-emerald-700">Limpias</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
                {formatNumber(dashboard?.prendas_facturables || 0)}
              </p>
              <p className="text-[10px] text-emerald-600">Entregadas OK</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-amber-700">En Lavadero</span>
              <p className="text-xl sm:text-2xl font-black text-amber-800 mt-1">
                {formatNumber(dashboard?.prendas_relavadas || 0)}
              </p>
              <p className="text-[10px] text-amber-600">En relavado</p>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-red-200 bg-red-50/30 shadow-sm">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-red-700">Bajas</span>
              <p className="text-xl sm:text-2xl font-black text-red-700 mt-1">
                {formatNumber(dashboard?.prendas_rotas || 0)}
              </p>
              <p className="text-[10px] text-red-600">Por rotura</p>
            </div>
          </div>

          {/* TABLA PRINCIPAL: ESTADO DE PRENDAS EN LAVADERO */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-sm sm:text-base text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                Ropa en Tránsito y Estado en Lavadero
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Prendas limpias devueltas vs. las que quedaron en relavado o rotas.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-3 sm:px-4 py-3">Prenda</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-emerald-700">Limpias (OK)</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-amber-700">En Relavado</th>
                    <th className="px-2 sm:px-4 py-3 text-right text-red-700">Rotas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard?.ropa_en_lavadero && dashboard.ropa_en_lavadero.length > 0 ? (
                    dashboard.ropa_en_lavadero.map((row) => (
                      <tr key={row.item_id} className="hover:bg-slate-50/50">
                        <td className="px-3 sm:px-4 py-3 font-bold text-slate-800">{row.item_nombre}</td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-emerald-700">
                          {formatNumber(row.limpias_devueltas)}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-amber-700">
                          {row.en_relavado > 0 ? (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-black">
                              {row.en_relavado} en lavadero
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-3 text-right font-bold text-red-700">
                          {row.dadas_de_baja > 0 ? (
                            <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[11px]">
                              {row.dadas_de_baja}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-sm sm:text-base text-slate-800">Historial de Remitos Emitidos</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {envios.length > 0 ? (
              envios.map((env) => (
                <div key={env.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800">
                        {new Date(env.fecha).toLocaleDateString('es-AR')}
                      </span>
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                        {env.codigo_qr}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {env.detalles && env.detalles.length > 0 ? (
                        env.detalles.map((d) => (
                          <span
                            key={d.id}
                            className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-100"
                          >
                            {d.item?.nombre}: <b>{d.cantidad_declarada}</b>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Sin detalle</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setCreatedEnvio(env);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="w-full sm:w-auto px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Ver QR / Etiqueta
                  </button>
                </div>
              ))
            ) : (
              <p className="text-center text-xs text-slate-400 py-8">No hay remitos registrados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
