import React, { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  DollarSign,
  Package,
  RotateCcw,
  AlertTriangle,
  FileText,
  Truck,
  TrendingUp,
  X,
  RefreshCw,
  QrCode,
  Layers,
  ChevronRight,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../../api/client';
import { FichaHotel360, Envio } from '../../types';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatters';
import { LiquidacionPrintable } from './LiquidacionPrintable';
import { RemitoPrintableModal } from './RemitoPrintableModal';

const COLORS = ['#0c8fe9', '#38bdf8', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

interface FichaHotel360ModalProps {
  hotelId: number;
  initialHotelNombre?: string;
  onClose: () => void;
}

type SubTab = 'dashboard' | 'liquidacion' | 'remitos';

export const FichaHotel360Modal: React.FC<FichaHotel360ModalProps> = ({
  hotelId,
  initialHotelNombre,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SubTab>('dashboard');
  const [loading, setLoading] = useState<boolean>(true);
  const [ficha, setFicha] = useState<FichaHotel360 | null>(null);
  const [selectedRemitoForPrint, setSelectedRemitoForPrint] = useState<Envio | null>(null);

  // Períodos preconfigurados
  const [periodoPreset, setPeriodoPreset] = useState<'month' | 'last_month' | 'quarter' | 'year' | 'custom'>('month');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  const calcularFechasPreset = (preset: 'month' | 'last_month' | 'quarter' | 'year') => {
    const now = new Date();
    let dDesde: Date;
    let dHasta: Date;

    if (preset === 'month') {
      dDesde = new Date(now.getFullYear(), now.getMonth(), 1);
      dHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === 'last_month') {
      dDesde = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      dHasta = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === 'quarter') {
      dDesde = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      dHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
      // year
      dDesde = new Date(now.getFullYear(), 0, 1);
      dHasta = new Date(now.getFullYear(), 11, 31);
    }

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { desde: fmt(dDesde), hasta: fmt(dHasta) };
  };

  const loadFicha = async (fDesde?: string, fHasta?: string) => {
    setLoading(true);
    try {
      const data = await api.getFichaHotel360(hotelId, {
        fecha_desde: fDesde || fechaDesde || undefined,
        fecha_hasta: fHasta || fechaHasta || undefined,
      });
      setFicha(data);
      if (!fechaDesde && data.fecha_desde) setFechaDesde(data.fecha_desde);
      if (!fechaHasta && data.fecha_hasta) setFechaHasta(data.fecha_hasta);
    } catch (err) {
      console.error('Error cargando Ficha 360 del hotel:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { desde, hasta } = calcularFechasPreset('month');
    setFechaDesde(desde);
    setFechaHasta(hasta);
    loadFicha(desde, hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  const handlePresetChange = (preset: 'month' | 'last_month' | 'quarter' | 'year' | 'custom') => {
    setPeriodoPreset(preset);
    if (preset !== 'custom') {
      const { desde, hasta } = calcularFechasPreset(preset);
      setFechaDesde(desde);
      setFechaHasta(hasta);
      loadFicha(desde, hasta);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fechaDesde && fechaHasta) {
      loadFicha(fechaDesde, fechaHasta);
    }
  };

  const handleExportCSV = () => {
    api.exportarLiquidacionCSV(hotelId, { fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
  };

  // Datos para gráfico de mix de prendas
  const mixPrendasData = (ficha?.consumo_prendas || [])
    .filter((p) => p.cantidad_facturable > 0)
    .map((p) => ({
      name: p.item_nombre,
      value: p.cantidad_facturable,
    }))
    .slice(0, 7);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-5xl w-full max-h-[94dvh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
        {/* Header Modal */}
        <div className="no-print bg-slate-900/90 border-b border-slate-800 p-3.5 sm:p-6 flex flex-wrap items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2.5 sm:p-3 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-2xl shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-brand-400">
                  Ficha 360° del Cliente
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    ficha?.activo ?? true
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {ficha?.activo ?? true ? 'Cuenta Activa' : 'Inactivo'}
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white truncate">
                {ficha?.hotel_nombre || initialHotelNombre || `Hotel #${hotelId}`}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="sm:order-3 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Cerrar Ficha 360"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Navegación por pestañas */}
          <div className="sm:order-2 flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>Dashboard 360°</span>
            </button>
            <button
              onClick={() => setActiveTab('liquidacion')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'liquidacion'
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Liquidación</span>
            </button>
            <button
              onClick={() => setActiveTab('remitos')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeTab === 'remitos'
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span>Remitos ({ficha?.total_envios || 0})</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros de Período (común para Dashboard y Liquidación) */}
        <div className="no-print bg-slate-900/40 border-b border-slate-800/80 px-3.5 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 max-w-full overflow-x-auto no-scrollbar">
            <Calendar className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="font-semibold text-slate-300 hidden sm:inline">Período:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'month', label: 'Mes Actual' },
                  { id: 'last_month', label: 'Mes Anterior' },
                  { id: 'quarter', label: 'Trimestre' },
                  { id: 'year', label: 'Año' },
                  { id: 'custom', label: 'Personalizado' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handlePresetChange(opt.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all whitespace-nowrap ${
                    periodoPreset === opt.id
                      ? 'bg-brand-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {periodoPreset === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="flex-1 sm:flex-initial bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
              />
              <span className="text-slate-500">a</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="flex-1 sm:flex-initial bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-brand-600 text-white rounded font-bold hover:bg-brand-500"
              >
                Filtrar
              </button>
            </form>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-400 font-mono text-[11px]">
              {fechaDesde} &rarr; {fechaHasta}
            </span>
            <button
              onClick={() => loadFicha(fechaDesde, fechaHasta)}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Contenido Scrolleable del Modal */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-500 border-t-transparent" />
              <p className="text-xs text-slate-400 font-medium">Cargando información 360° del hotel...</p>
            </div>
          ) : !ficha ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              No se pudo obtener la información de este hotel.
            </div>
          ) : (
            <>
              {/* PESTAÑA 1: DASHBOARD 360° */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Volumen Procesado */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Total Procesado</span>
                        <Package className="w-4 h-4 text-brand-400" />
                      </div>
                      <p className="text-2xl font-black text-white">{formatNumber(ficha.total_prendas)}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatNumber(ficha.prendas_facturables)} limpias entregadas
                      </p>
                    </div>

                    {/* Facturación Estimada */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Facturación Estimada</span>
                        <DollarSign className="w-4 h-4 text-cyan-400" />
                      </div>
                      <p className="text-2xl font-black text-cyan-300">
                        {formatCurrency(ficha.facturacion_estimada)}
                      </p>
                      <p className="text-[11px] text-slate-500">Precios unitarios vigentes</p>
                    </div>

                    {/* Tasa de Relavado vs Promedio General del Lavadero */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Tasa de Relavado</span>
                        <RotateCcw className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-2xl font-black text-amber-300">
                        {formatPercent(ficha.tasa_relavado / 100)}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                            ficha.tasa_relavado <= ficha.tasa_relavado_promedio_total
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {ficha.tasa_relavado <= ficha.tasa_relavado_promedio_total ? '✓ Mejor' : '▲ Mayor'}
                        </span>
                        <span className="text-slate-500">
                          Media lavadero: {formatPercent(ficha.tasa_relavado_promedio_total / 100)}
                        </span>
                      </div>
                    </div>

                    {/* Remitos y Discrepancias */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Balance Remitos</span>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      </div>
                      <p className="text-2xl font-black text-white">
                        {ficha.diferencia_total > 0
                          ? `+${formatNumber(ficha.diferencia_total)}`
                          : formatNumber(ficha.diferencia_total)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatNumber(ficha.total_prendas_declaradas)} declaradas vs{' '}
                        {formatNumber(ficha.total_prendas_auditadas)} auditadas
                      </p>
                    </div>
                  </div>

                  {/* Gráficos: Estacionalidad + Mix de Prendas */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Evolución Mensual / Estacionalidad */}
                    <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-brand-400" />
                          Curva de Demanda y Estacionalidad (Últimos 12 Meses)
                        </h4>
                        <span className="text-[11px] text-slate-500">Prendas por mes</span>
                      </div>
                      <div className="h-64 w-full">
                        {ficha.evolucion_mensual.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                            Sin historial suficiente para graficar
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ficha.evolucion_mensual} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="mes" stroke="#64748b" fontSize={11} />
                              <YAxis stroke="#64748b" fontSize={11} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                                formatter={(val: number, name: string) => [
                                  name === 'Facturacion' ? formatCurrency(val) : formatNumber(val),
                                  name === 'Facturacion' ? 'Facturado' : 'Prendas',
                                ]}
                              />
                              <Bar dataKey="cantidad" name="Prendas" fill="#0c8fe9" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Mix de Prendas Donut */}
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                      <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2 mb-4">
                        <PieChartIcon className="w-4 h-4 text-cyan-400" />
                        Composición de Ropa (Mix)
                      </h4>
                      <div className="h-64 w-full">
                        {mixPrendasData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                            Sin prendas facturadas en el período
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={mixPrendasData}
                                innerRadius={45}
                                outerRadius={70}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {mixPrendasData.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                                formatter={(val: number) => [`${formatNumber(val)} u.`, 'Volumen']}
                              />
                              <Legend
                                formatter={(val) => <span className="text-[11px] text-slate-300">{val}</span>}
                                wrapperStyle={{ fontSize: '10px' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock en Lavadero / Prendas Retenidas */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                    <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2 mb-3">
                      <Layers className="w-4 h-4 text-amber-400" />
                      Ropa Retenida en Lavadero (Pendiente de Entrega)
                    </h4>
                    {ficha.ropa_en_lavadero.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">
                        ✓ No hay prendas retenidas en relavado ni dadas de baja en este período.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Prenda</th>
                              <th className="py-2 px-3 text-right text-amber-400">En Relavado (en planta)</th>
                              <th className="py-2 px-3 text-right text-rose-400">Dadas de Baja (rotura)</th>
                              <th className="py-2 px-3 text-right text-emerald-400">Limpias Entregadas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {ficha.ropa_en_lavadero.map((r) => (
                              <tr key={r.item_id} className="hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-semibold text-slate-300">{r.item_nombre}</td>
                                <td className="py-2 px-3 text-right font-bold text-amber-400">
                                  {r.en_relavado > 0 ? formatNumber(r.en_relavado) : '-'}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-rose-400">
                                  {r.dadas_de_baja > 0 ? formatNumber(r.dadas_de_baja) : '-'}
                                </td>
                                <td className="py-2 px-3 text-right text-emerald-400">
                                  {formatNumber(r.limpias_devueltas)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PESTAÑA 2: LIQUIDACIÓN MENSUAL */}
              {activeTab === 'liquidacion' && (
                <LiquidacionPrintable
                  hotelId={hotelId}
                  hotelNombre={ficha.hotel_nombre}
                  fechaDesde={fechaDesde}
                  fechaHasta={fechaHasta}
                  items={ficha.consumo_prendas}
                  facturacionTotal={ficha.facturacion_estimada}
                  onExportCSV={handleExportCSV}
                />
              )}

              {/* PESTAÑA 3: REMITOS & TRAZABILIDAD */}
              {activeTab === 'remitos' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-white">Historial de Remitos y Envíos</h4>
                      <p className="text-xs text-slate-400">
                        Listado de envíos generados por el hotel con código QR para control en camión y planta.
                      </p>
                    </div>
                  </div>

                  {ficha.envios_recientes.length === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 text-xs">
                      No hay remitos registrados en este período.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ficha.envios_recientes.map((env) => {
                        const totalPrendas = env.detalles?.reduce((acc, d) => acc + d.cantidad_declarada, 0) || 0;
                        return (
                          <div
                            key={env.id}
                            className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">
                                  {new Date(env.fecha).toLocaleDateString('es-AR')}
                                </span>
                                <span className="font-mono text-xs font-bold bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded">
                                  {env.codigo_qr}
                                </span>
                                <span className="text-xs text-slate-400 font-semibold">
                                  &bull; {formatNumber(totalPrendas)} prendas
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1 mt-2">
                                {env.detalles?.map((d) => (
                                  <span
                                    key={d.id}
                                    className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
                                  >
                                    {d.item?.nombre}: <b className="text-white">{d.cantidad_declarada}</b>
                                  </span>
                                ))}
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedRemitoForPrint(env)}
                              className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-brand-600/20 transition-all shrink-0 w-full sm:w-auto justify-center"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>Ver / Imprimir Remito</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal flotante de Remito Imprimible */}
      {selectedRemitoForPrint && (
        <RemitoPrintableModal
          envio={selectedRemitoForPrint}
          hotelNombre={ficha?.hotel_nombre || initialHotelNombre || ''}
          onClose={() => setSelectedRemitoForPrint(null)}
        />
      )}
    </div>
  );
};
