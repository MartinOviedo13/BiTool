import React from 'react';
import { AlertTriangle, AlertOctagon, Info, Bell, ShieldCheck, ChevronRight } from 'lucide-react';
import { Alerta } from '../../types';

const NIVEL_ESTILO: Record<Alerta['nivel'], { icon: React.ElementType; badge: string; text: string; card: string }> = {
  danger: { icon: AlertOctagon, badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', text: 'text-rose-300', card: 'border-rose-500/20 hover:border-rose-500/40' },
  warning: { icon: AlertTriangle, badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', text: 'text-amber-300', card: 'border-amber-500/20 hover:border-amber-500/40' },
  info: { icon: Info, badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20', text: 'text-sky-300', card: 'border-sky-500/20 hover:border-sky-500/40' },
};

export const AlertasPanel: React.FC<{ alertas: Alerta[]; loading?: boolean }> = ({ alertas, loading }) => {
  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Alertas Automáticas</h3>
            <p className="text-[10px] text-slate-500">Señales detectadas sobre los datos del período</p>
          </div>
        </div>
        {!loading && (
          <span className="text-xs text-slate-400">
            {alertas.length === 0 ? 'Todo en orden' : `${alertas.length} alerta(s)`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-500">Evaluando alertas…</div>
      ) : alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-200">Sin alertas en este período</p>
          <p className="text-xs text-slate-500">No se detectaron desvíos sobre los umbrales configurados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alertas.map((a) => {
            const est = NIVEL_ESTILO[a.nivel];
            const Icon = est.icon;
            return (
              <div
                key={a.id}
                className={`group flex items-start gap-3 p-3 rounded-xl border bg-slate-950/50 transition-all ${est.card}`}
              >
                <div className={`p-1.5 rounded-lg border ${est.badge} shrink-0`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${est.text}`}>{a.categoria}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-100 mt-0.5">{a.titulo}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{a.detalle}</p>
                  {a.accion && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {a.accion}
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
