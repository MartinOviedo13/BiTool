import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  RotateCcw,
  Calendar,
  RefreshCw,
  Building2,
  PieChart as PieChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
  Search,
  Download,
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
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { api } from '../../api/client';
import { ResumenGeneral, RankingHotel, PeriodOption, Registro, ComparacionPeriodo, TendenciaRegistro, Hotel, Item, Alerta } from '../../types';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatters';
import { getDateRange, formatDateDisplay, getTodayDateString } from '../../utils/date';
import { AlertasPanel } from './AlertasPanel';

const COLORS = ['#0c8fe9', '#38bdf8', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

// Badge de variacion: muestra %Δ con flecha verde/roja.
const DeltaBadge: React.FC<{ delta: number | null; invert?: boolean; label?: string }> = ({ delta, invert, label }) => {
  if (delta == null || !isFinite(delta)) return <span className="text-[10px] text-slate-500">sin comparación</span>;
  const up = delta >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
        good ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
      }`}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
};

export const DashboardView: React.FC = () => {
  const [period, setPeriod] = useState<PeriodOption>('month');
  const [customFrom, setCustomFrom] = useState<string>(getTodayDateString());
  const [customTo, setCustomTo] = useState<string>(getTodayDateString());

  // Filtros
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [hotelFilter, setHotelFilter] = useState<number | ''>('');
  const [itemFilter, setItemFilter] = useState<number | ''>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [resumen, setResumen] = useState<ResumenGeneral | null>(null);
  const [ranking, setRanking] = useState<RankingHotel[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [comparacion, setComparacion] = useState<ComparacionPeriodo | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaRegistro[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const dateFilter = useMemo(() => {
    return getDateRange(period, customFrom, customTo);
  }, [period, customFrom, customTo]);

  const loadCatalogs = async () => {
    try {
      const [h, it] = await Promise.all([api.getHoteles(), api.getItems()]);
      setHoteles(h.filter((x) => x.activo));
      setItems(it);
    } catch {
      /* silencioso */
    }
  };

  const loadData = async () => {
    setLoading(true);
    const f = { fecha_desde: dateFilter.from, fecha_hasta: dateFilter.to };
    const filtros = { ...f, hotel_id: hotelFilter === '' ? undefined : hotelFilter, item_id: itemFilter === '' ? undefined : itemFilter };
    try {
      const [resumenData, rankingData, registrosData, tendenciaData, comparacionData, alertasData] = await Promise.all([
        api.getResumen(filtros),
        api.getRankingHoteles({ ...f, item_id: itemFilter === '' ? undefined : itemFilter, limit: 10 }),
        api.getRegistros(filtros),
        api.getTendencia({ ...f, hotel_id: hotelFilter === '' ? undefined : hotelFilter, item_id: itemFilter === '' ? undefined : itemFilter, periodo: 'diario' }),
        api.getComparacion(f),
        api.getAlertas(f),
      ]);
      setResumen(resumenData);
      setRanking(hotelFilter === '' ? rankingData : []);
      setRegistros(registrosData);
      setTendencia(tendenciaData);
      setComparacion(comparacionData);
      setAlertas(alertasData);
    } catch (err) {
      console.error('Error cargando datos del dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, hotelFilter, itemFilter]);

  // Variaciones respecto al periodo anterior (para KPI cards)
  const ctx = useMemo(() => {
    if (!comparacion) return null;
    const deltas = {
      cantidad_total: comparacion.cantidad_total_anterior
        ? ((comparacion.cantidad_total_actual - comparacion.cantidad_total_anterior) / comparacion.cantidad_total_anterior) * 100
        : null,
      cantidad_facturable: comparacion.cantidad_facturable_anterior
        ? ((comparacion.cantidad_facturable_actual - comparacion.cantidad_facturable_anterior) / comparacion.cantidad_facturable_anterior) * 100
        : null,
      facturacion: comparacion.facturacion_anterior
        ? ((comparacion.facturacion_actual - comparacion.facturacion_anterior) / comparacion.facturacion_anterior) * 100
        : null,
      relavado: comparacion.cantidad_total_anterior
        ? ((comparacion.cantidad_relavado_actual - comparacion.cantidad_relavado_anterior) / comparacion.cantidad_total_anterior) * 100
        : null,
    };
    return deltas;
  }, [comparacion]);

  // Breakdown by item for Pie Chart
  const itemDistribution = useMemo(() => {
    const map = new Map<string, number>();
    registros.forEach((r) => {
      const name = r.item?.nombre || `Item #${r.item_id}`;
      map.set(name, (map.get(name) || 0) + r.cantidad);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [registros]);

  const relavadoRatio = useMemo(() => {
    if (!resumen || resumen.cantidad_total === 0) return 0;
    return resumen.cantidad_relavado / resumen.cantidad_total;
  }, [resumen]);

  // Filtered ranking for table search
  const filteredRanking = useMemo(() => {
    if (!searchTerm) return ranking;
    return ranking.filter((h) => h.hotel.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [ranking, searchTerm]);

  const selHotel = hotelFilter === '' ? undefined : hoteles.find((h) => h.id === hotelFilter);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-triton-deep/40 p-3.5 sm:p-4 rounded-2xl border border-triton-slate/50 flex flex-col md:flex-row flex-wrap md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-triton-aqua shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-slate-200">Período de Análisis:</span>
          </div>
          <div className="flex items-center gap-1 bg-triton-navy p-1 rounded-xl border border-triton-slate/50 overflow-x-auto no-scrollbar max-w-full">
            {(
              [
                { id: 'today', label: 'Hoy' },
                { id: 'last7', label: 'Últimos 7 días' },
                { id: 'month', label: 'Mes Actual' },
                { id: 'all', label: 'Histórico' },
                { id: 'custom', label: 'Personalizado' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setPeriod(opt.id)}
                className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                  period === opt.id
                    ? 'bg-triton-teal text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-triton-deep'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 sm:flex-initial bg-triton-navy border border-triton-slate/50 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-triton-aqua"
            />
            <span className="text-slate-400">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 sm:flex-initial bg-triton-navy border border-triton-slate/50 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-triton-aqua"
            />
          </div>
        )}

        {/* Filtros por hotel y prenda */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex items-center gap-2 text-xs w-full md:w-auto">
          <select
            value={hotelFilter}
            onChange={(e) => setHotelFilter(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="bg-triton-navy border border-triton-slate/50 rounded-lg px-2.5 py-2 sm:py-1.5 text-slate-200 focus:outline-none focus:border-triton-aqua w-full md:w-auto"
          >
            <option value="">Todos los hoteles</option>
            {hoteles.map((h) => (
              <option key={h.id} value={h.id}>{h.nombre}</option>
            ))}
          </select>
          <select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="bg-triton-navy border border-triton-slate/50 rounded-lg px-2.5 py-2 sm:py-1.5 text-slate-200 focus:outline-none focus:border-triton-aqua w-full md:w-auto"
          >
            <option value="">Todas las prendas</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.nombre}{!i.se_factura ? ' (relav)' : ''}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex-1 md:flex-initial justify-center flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-triton-deep hover:bg-triton-slate/50 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-triton-slate/50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-triton-aqua' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={() =>
              api.exportarCSV({
                fecha_desde: dateFilter.from,
                fecha_hasta: dateFilter.to,
                item_id: itemFilter === '' ? undefined : itemFilter,
              })
            }
            className="flex-1 md:flex-initial justify-center flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] text-triton-navy rounded-xl text-xs font-black transition-all shadow-md shadow-triton-aqua/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Procesadas */}
        <div className="bg-triton-navy/90 p-3.5 sm:p-5 rounded-2xl border border-triton-slate/50 relative overflow-hidden group hover:border-triton-teal/50 transition-all shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-300 uppercase tracking-wider">Total Procesado</span>
            <div className="p-2 sm:p-2.5 rounded-xl bg-triton-teal/20 text-triton-aqua border border-triton-teal/40">
              <Package className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_total || 0)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {ctx && <DeltaBadge delta={ctx.cantidad_total} label="vs período anterior" />}
            <span className="text-[10px] text-slate-400">vs anterior</span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-400 flex items-center gap-1 flex-wrap">
            <span className="text-slate-300 font-medium">{formatDateDisplay(dateFilter.from)}</span>
            <span>al</span>
            <span className="text-slate-300 font-medium">{formatDateDisplay(dateFilter.to)}</span>
          </div>
        </div>

        {/* Facturables */}
        <div className="bg-triton-navy/90 p-3.5 sm:p-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 relative overflow-hidden group hover:border-emerald-400 transition-all shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-emerald-400 uppercase tracking-wider">Facturables</span>
            <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_facturable || 0)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {ctx && <DeltaBadge delta={ctx.cantidad_facturable} label="vs período anterior" />}
            <span className="text-[10px] text-slate-400">vs anterior</span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-emerald-400 font-medium flex items-center gap-1 flex-wrap">
            <span>{resumen?.cantidad_total ? formatPercent(resumen.cantidad_facturable / resumen.cantidad_total) : '0%'}</span>
            <span className="text-slate-400 font-normal">del total</span>
          </div>
        </div>

        {/* Relavado */}
        <div className="bg-triton-navy/90 p-3.5 sm:p-5 rounded-2xl border border-amber-500/40 bg-amber-950/20 relative overflow-hidden group hover:border-amber-400 transition-all shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-semibold text-amber-400 uppercase tracking-wider">Relavado</span>
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_relavado || 0)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {ctx && <DeltaBadge delta={ctx.relavado} invert label="vs período anterior" />}
            <span className="text-[10px] text-slate-400">vs anterior</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold ${
                relavadoRatio > 0.05
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {formatPercent(relavadoRatio)}
            </span>
            <span className="text-[11px] sm:text-xs text-slate-400">reproceso</span>
          </div>
        </div>

        {/* Facturación Estimada */}
        <div className="bg-triton-navy/90 p-3.5 sm:p-5 rounded-2xl border border-triton-aqua/40 bg-triton-deep/30 relative overflow-hidden group hover:border-triton-aqua transition-all shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <span className="text-[10px] sm:text-xs font-bold text-triton-aqua uppercase tracking-wider">Facturación Est.</span>
            <div className="p-2 sm:p-2.5 rounded-xl bg-triton-aqua/20 text-triton-aqua border border-triton-aqua/40">
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-black text-triton-aqua tracking-tight truncate">
            {loading ? '...' : formatCurrency(resumen?.facturacion_estimada || 0)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {ctx && <DeltaBadge delta={ctx.facturacion} label="vs período anterior" />}
            <span className="text-[10px] text-slate-400">vs anterior</span>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs text-slate-300">
            Precios unitarios activos
          </div>
        </div>
      </div>

      <AlertasPanel alertas={alertas} loading={loading} />

      {/* Tendencia + Distribución */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Tendencia Line Chart */}
        <div className="lg:col-span-2 bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-triton-aqua" />
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">Tendencia de Volumen</h3>
            </div>
            <span className="text-xs text-slate-400">Agrupado por día</span>
          </div>

          <div className="h-64 sm:h-72 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Cargando gráfico...</div>
            ) : tendencia.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No hay datos para el período seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tendencia} margin={{ top: 5, right: 15, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="fecha" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                    formatter={(val: number) => [formatNumber(val), 'prenda(s)']}
                  />
                  <Line type="monotone" dataKey="cantidad_total" stroke="#48c0b0" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Item Distribution Donut */}
        <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-cyan-400" />
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">Distribución por Prenda</h3>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Cargando gráfico...</div>
            ) : itemDistribution.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Sin datos para mostrar</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={itemDistribution}
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {itemDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                    formatter={(val: number) => [`${formatNumber(val)} prendas`, 'Cantidad']}
                  />
                  <Legend
                    formatter={(val) => <span className="text-xs text-slate-300">{val}</span>}
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Ranking Bar Chart */}
      <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-triton-aqua" />
            <h3 className="font-bold text-slate-100 text-sm sm:text-base">Top Hoteles por Volumen</h3>
          </div>
          <span className="text-xs text-slate-400">
            {selHotel ? `Filtrado: ${selHotel.nombre}` : 'Prendas facturables'}
          </span>
        </div>

        <div className="h-64 sm:h-72 w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">Cargando gráfico...</div>
          ) : ranking.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              No hay registros para el período seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="hotel" stroke="#94a3b8" fontSize={11} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                  formatter={(val: number) => [`${formatNumber(val)} prendas`, 'Volumen']}
                />
                <Bar dataKey="cantidad_total" fill="#48c0b0" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Ranking Detailed Table */}
      <div className="bg-triton-navy/90 p-4 sm:p-5 rounded-2xl border border-triton-slate/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-triton-aqua" />
            <h3 className="font-bold text-slate-100 text-sm sm:text-base">Rendimiento por Cliente</h3>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar hotel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-triton-deep border border-triton-slate/50 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-triton-aqua w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-triton-slate/50">
          <table className="w-full text-left text-xs">
            <thead className="bg-triton-deep/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-triton-slate/50">
              <tr>
                <th className="px-3 sm:px-4 py-3">Pos.</th>
                <th className="px-3 sm:px-4 py-3">Hotel / Cliente</th>
                <th className="px-3 sm:px-4 py-3 text-right">Prendas</th>
                <th className="px-3 sm:px-4 py-3 text-right">% Cuota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRanking.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No se encontraron clientes para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRanking.map((item, idx) => {
                  const base = hotelFilter === '' ? resumen?.cantidad_facturable : item.cantidad_total;
                  const percent = base ? (item.cantidad_total / base) * 100 : 0;
                  return (
                    <tr key={item.hotel_id} className="hover:bg-triton-deep/60 transition-colors">
                      <td className="px-3 sm:px-4 py-3 font-semibold text-slate-400">#{idx + 1}</td>
                      <td className="px-3 sm:px-4 py-3 font-bold text-slate-200">{item.hotel}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-medium text-white">{formatNumber(item.cantidad_total)}</td>
                      <td className="px-3 sm:px-4 py-3 text-right text-triton-aqua font-semibold">{percent.toFixed(1)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
