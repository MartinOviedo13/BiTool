import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  Sparkles,
  Receipt,
} from 'lucide-react';
import { MetricasResumenResponse } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { MetricasSkeleton } from './MetricasSkeleton';

interface MetricasSectionProps {
  metricas: MetricasResumenResponse | null;
  loading: boolean;
  periodLabel?: string;
}

// Badge de variación con flecha verde/roja
const DeltaIndicator: React.FC<{ delta: number | null | undefined; invert?: boolean; label?: string }> = ({
  delta,
  invert,
  label = 'vs anterior',
}) => {
  if (delta == null || !isFinite(delta)) {
    return <span className="text-[10px] text-slate-500 font-medium">sin comparación</span>;
  }
  const up = delta >= 0;
  const isPositive = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
        isPositive
          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
          : 'bg-rose-950/80 text-rose-300 border-rose-800/60'
      }`}
      title={label}
    >
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
};

export const MetricasSection: React.FC<MetricasSectionProps> = ({
  metricas,
  loading,
  periodLabel = 'Período seleccionado',
}) => {
  if (loading) {
    return <MetricasSkeleton />;
  }

  if (!metricas) {
    return null;
  }

  const {
    facturacion_total,
    delta_facturacion,
    ticket_promedio,
    delta_ticket_promedio,
    total_remitos,
    remitos_activos,
    tiempo_medio_horas,
    prendas_totales,
    delta_prendas_totales,
    prendas_estrella = [],
  } = metricas;

  // Formato amigable de tiempo medio (horas o días)
  const formatTiempo = (horas: number) => {
    if (!horas || horas <= 0) return '0 hs';
    if (horas >= 24) {
      const dias = (horas / 24).toFixed(1);
      return `${horas.toFixed(1)} hs (${dias} d)`;
    }
    return `${horas.toFixed(1)} hs`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Tarjetas KPI de Alto Impacto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Facturación del Período / Hoy */}
        <div className="bg-triton-navy/90 p-5 rounded-2xl border border-triton-slate/50 relative overflow-hidden group hover:border-triton-aqua/50 shadow-lg shadow-black/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Facturación {periodLabel === 'Hoy' ? 'Hoy' : 'Período'}
            </span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {formatCurrency(facturacion_total || 0)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator delta={delta_facturacion} />
            <span className="text-[11px] text-slate-400">vs período anterior</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>{formatNumber(prendas_totales || 0)} prendas procesadas</span>
            {delta_prendas_totales != null && isFinite(delta_prendas_totales) && (
              <span className="text-[10px] text-slate-500">
                ({delta_prendas_totales >= 0 ? '+' : ''}{delta_prendas_totales.toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        {/* KPI 2: Remitos Activos en Planta */}
        <div className="bg-triton-navy/90 p-5 rounded-2xl border border-triton-slate/50 relative overflow-hidden group hover:border-triton-aqua/50 shadow-lg shadow-black/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-triton-aqua uppercase tracking-wider">
              Remitos en Planta
            </span>
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-triton-aqua border border-brand-500/20 group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-2">
            <span>{formatNumber(remitos_activos || 0)}</span>
            <span className="text-xs font-semibold text-brand-300 bg-brand-950/70 border border-brand-800 px-2 py-0.5 rounded-full">
              en proceso
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-slate-300 font-medium">Lavado y conteo activo</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {total_remitos > 0 ? `${total_remitos} remitos totales en el período` : 'Operación regular'}
          </div>
        </div>

        {/* KPI 3: Ticket / Remito Promedio */}
        <div className="bg-triton-navy/90 p-5 rounded-2xl border border-triton-slate/50 relative overflow-hidden group hover:border-triton-aqua/50 shadow-lg shadow-black/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Ticket Promedio
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
              <Receipt className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {formatCurrency(ticket_promedio || 0)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <DeltaIndicator delta={delta_ticket_promedio} />
            <span className="text-[11px] text-slate-400">por remito/entrega</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Facturación media por despacho
          </div>
        </div>

        {/* KPI 4: Tiempo Medio de Ciclo (Turnaround Time) */}
        <div className="bg-triton-navy/90 p-5 rounded-2xl border border-triton-slate/50 relative overflow-hidden group hover:border-triton-aqua/50 shadow-lg shadow-black/20 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Tiempo Medio de Ciclo
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {formatTiempo(tiempo_medio_horas)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              SLA Óptimo (&lt; 48h)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Rotación desde recepción a salida limpia
          </div>
        </div>
      </div>

      {/* 2. Ranking de las 5 Prendas Estrella ("Platos Estrella" adaptado a lavandería) */}
      <div className="bg-triton-navy/90 p-5 rounded-2xl border border-triton-slate/50 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between mb-4 border-b border-triton-slate/50 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                Ranking de las 5 Prendas Estrella
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/60">
                  Mayor Recaudación & Volumen
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Artículos que concentran la mayor facturación y movimiento de la lavandería
              </p>
            </div>
          </div>
        </div>

        {prendas_estrella.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            No hay registros de prendas en el período seleccionado.
          </div>
        ) : (
          <div className="space-y-3">
            {prendas_estrella.map((p, idx) => {
              // Estilo del podio
              const badgeColors = [
                'bg-amber-500/20 text-amber-300 border-amber-500/40', // #1 Oro
                'bg-slate-300/20 text-slate-200 border-slate-300/40', // #2 Plata
                'bg-amber-800/20 text-amber-400 border-amber-800/40', // #3 Bronce
                'bg-blue-900/30 text-blue-300 border-blue-700/40',
                'bg-blue-900/30 text-blue-300 border-blue-700/40',
              ];
              const badgeStyle = badgeColors[idx] || badgeColors[3];

              return (
                <div
                  key={p.item_id}
                  className="p-3 sm:p-3.5 rounded-xl bg-triton-deep/70 border border-triton-slate/50 hover:border-triton-aqua/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Badge de Posición */}
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs border shrink-0 ${badgeStyle}`}
                    >
                      #{idx + 1}
                    </span>

                    {/* Nombre y barra de progreso */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-white text-sm truncate group-hover:text-brand-300 transition-colors">
                          {p.nombre}
                        </span>
                        <span className="text-xs font-semibold text-triton-aqua sm:hidden">
                          {formatCurrency(p.facturacion)}
                        </span>
                      </div>

                      {/* Barra de progreso */}
                      <div className="w-full bg-triton-deep rounded-full h-2 overflow-hidden flex items-center">
                        <div
                          className="bg-gradient-to-r from-triton-teal via-[#007888] to-triton-aqua h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(5, p.porcentaje))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Métricas a la derecha (Desktop) */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 text-right shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-triton-slate/40">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Unidades
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-200">
                        {formatNumber(p.cantidad)}{' '}
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({p.porcentaje.toFixed(1)}%)
                        </span>
                      </span>
                    </div>

                    <div className="hidden sm:block min-w-[110px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Recaudación
                      </span>
                      <span className="text-xs sm:text-sm font-black text-cyan-300">
                        {formatCurrency(p.facturacion)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
