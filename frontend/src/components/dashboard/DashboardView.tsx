import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  RotateCcw,
  Calendar,
  RefreshCw,
  Building2,
  PieChart as PieChartIcon,
  BarChart3,
  Search,
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
} from 'recharts';
import { api } from '../../api/client';
import { ResumenGeneral, RankingHotel, PeriodOption, Registro } from '../../types';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatters';
import { getDateRange, formatDateDisplay, getTodayDateString } from '../../utils/date';

const COLORS = ['#0c8fe9', '#38bdf8', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

export const DashboardView: React.FC = () => {
  const [period, setPeriod] = useState<PeriodOption>('month');
  const [customFrom, setCustomFrom] = useState<string>(getTodayDateString());
  const [customTo, setCustomTo] = useState<string>(getTodayDateString());

  const [loading, setLoading] = useState<boolean>(true);
  const [resumen, setResumen] = useState<ResumenGeneral | null>(null);
  const [ranking, setRanking] = useState<RankingHotel[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const dateFilter = useMemo(() => {
    return getDateRange(period, customFrom, customTo);
  }, [period, customFrom, customTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resumenData, rankingData, registrosData] = await Promise.all([
        api.getResumen({ fecha_desde: dateFilter.from, fecha_hasta: dateFilter.to }),
        api.getRankingHoteles({ fecha_desde: dateFilter.from, fecha_hasta: dateFilter.to, limit: 10 }),
        api.getRegistros({ fecha_desde: dateFilter.from, fecha_hasta: dateFilter.to }),
      ]);
      setResumen(resumenData);
      setRanking(rankingData);
      setRegistros(registrosData);
    } catch (err) {
      console.error('Error cargando datos del dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFilter]);

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

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-brand-400" />
          <span className="text-sm font-semibold text-slate-200">Período de Análisis:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
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
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  period === opt.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-brand-500"
            />
            <span className="text-slate-500">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        )}

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors ml-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-brand-400' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Procesadas */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Procesado</span>
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_total || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
            <span className="text-slate-300 font-medium">{formatDateDisplay(dateFilter.from)}</span>
            <span>al</span>
            <span className="text-slate-300 font-medium">{formatDateDisplay(dateFilter.to)}</span>
          </div>
        </div>

        {/* Facturables */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Prendas Facturables</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_facturable || 0)}
          </div>
          <div className="mt-2 text-xs text-emerald-400 font-medium flex items-center gap-1">
            <span>{resumen?.cantidad_total ? formatPercent((resumen.cantidad_facturable / resumen.cantidad_total)) : '0%'}</span>
            <span className="text-slate-400 font-normal">del total de prendas</span>
          </div>
        </div>

        {/* Relavado */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Prendas de Relavado</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <RotateCcw className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatNumber(resumen?.cantidad_relavado || 0)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                relavadoRatio > 0.05
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {formatPercent(relavadoRatio)}
            </span>
            <span className="text-xs text-slate-400">tasa de reproceso</span>
          </div>
        </div>

        {/* Facturación Estimada */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Facturación Estimada</span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            {loading ? '...' : formatCurrency(resumen?.facturacion_estimada || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Calculado con precios unitarios activos
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ranking Bar Chart */}
        <div className="lg:col-span-2 bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand-400" />
              <h3 className="font-bold text-slate-100">Top Hoteles por Volumen</h3>
            </div>
            <span className="text-xs text-slate-400">Prendas facturables</span>
          </div>

          <div className="h-72 w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">Cargando gráfico...</div>
            ) : ranking.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No hay registros para el período seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranking} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="hotel" stroke="#94a3b8" fontSize={12} width={110} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                    formatter={(val: number) => [`${formatNumber(val)} prendas`, 'Volumen']}
                  />
                  <Bar dataKey="cantidad_total" fill="#0c8fe9" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Item Distribution Donut */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-cyan-400" />
              <h3 className="font-bold text-slate-100">Distribución por Prenda</h3>
            </div>
          </div>

          <div className="h-72 w-full">
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

      {/* Ranking Detailed Table */}
      <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-400" />
            <h3 className="font-bold text-slate-100">Rendimiento por Cliente</h3>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar hotel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Posición</th>
                <th className="px-4 py-3">Hotel / Cliente</th>
                <th className="px-4 py-3 text-right">Prendas Procesadas</th>
                <th className="px-4 py-3 text-right">% Cuota Período</th>
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
                  const percent = resumen?.cantidad_facturable
                    ? (item.cantidad_total / resumen.cantidad_facturable) * 100
                    : 0;
                  return (
                    <tr key={item.hotel_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-400">#{idx + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-200">{item.hotel}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{formatNumber(item.cantidad_total)}</td>
                      <td className="px-4 py-3 text-right text-brand-400 font-semibold">{percent.toFixed(1)}%</td>
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
