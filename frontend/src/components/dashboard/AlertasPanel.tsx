import React from 'react';
import { AlertTriangle, AlertOctagon, Info, Bell, ShieldCheck, ChevronRight } from 'lucide-react';
import { Alerta } from '../../types';

const NIVEL_ESTILO: Record<
  Alerta['nivel'],
  { icon: React.ElementType; badge: string; categoryText: string; actionText: string; card: string }
> = {
  danger: {
    icon: AlertOctagon,
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-400/40 dark:border-rose-500/30',
    categoryText: 'text-rose-800 dark:text-rose-400',
    actionText: 'text-rose-700 dark:text-rose-300',
    card: 'bg-rose-50/90 dark:bg-[#1f1318] border-rose-300 dark:border-rose-500/35 hover:border-rose-400 dark:hover:border-rose-500/60',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40 dark:border-amber-500/30',
    categoryText: 'text-amber-800 dark:text-amber-400',
    actionText: 'text-amber-800 dark:text-amber-300',
    card: 'bg-amber-50/90 dark:bg-[#1f1b12] border-amber-300 dark:border-amber-500/35 hover:border-amber-400 dark:hover:border-amber-500/60',
  },
  info: {
    icon: Info,
    badge: 'bg-triton-teal/15 text-triton-teal dark:text-triton-aqua border-triton-teal/35 dark:border-triton-aqua/30',
    categoryText: 'text-[#006070] dark:text-triton-aqua',
    actionText: 'text-[#006070] dark:text-triton-aqua',
    card: 'bg-[#f0f9fa] dark:bg-[#141d24] border-[#b0dce0] dark:border-triton-teal/45 hover:border-triton-teal dark:hover:border-triton-aqua/60',
  },
};

export const AlertasPanel: React.FC<{ alertas: Alerta[]; loading?: boolean }> = ({ alertas, loading }) => {
  return (
    <div className="bg-triton-navy/90 rounded-2xl border border-triton-slate/50 p-4 sm:p-5 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-triton-teal/15 text-triton-teal dark:text-triton-aqua border border-triton-teal/30">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
              Alertas Automáticas
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Señales detectadas sobre los datos del período
            </p>
          </div>
        </div>
        {!loading && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-triton-deep border border-triton-slate/50 text-slate-700 dark:text-slate-300">
            {alertas.length === 0 ? 'Todo en orden' : `${alertas.length} alerta(s)`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-500">Evaluando alertas…</div>
      ) : alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 mb-3">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Sin alertas en este período</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No se detectaron desvíos sobre los umbrales configurados.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {alertas.map((a) => {
            const est = NIVEL_ESTILO[a.nivel];
            const Icon = est.icon;
            return (
              <div
                key={a.id}
                className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all shadow-xs ${est.card}`}
              >
                <div className={`p-2 rounded-lg border ${est.badge} shrink-0 mt-0.5`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider ${est.categoryText}`}>
                      {a.categoria}
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {a.titulo}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed font-medium">
                    {a.detalle}
                  </p>
                  {a.accion && (
                    <p className={`text-[11px] font-bold mt-1.5 flex items-center gap-1 ${est.actionText}`}>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      <span>{a.accion}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
