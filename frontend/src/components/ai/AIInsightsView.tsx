import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle,
  BrainCircuit,
  MessageSquareQuote,
  Copy,
  Check,
  Building,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import { ResumenGeneral, RankingHotel, Item } from '../../types';
import { formatCurrency, formatNumber, formatPercent } from '../../utils/formatters';

export const AIInsightsView: React.FC = () => {
  const [resumen, setResumen] = useState<ResumenGeneral | null>(null);
  const [ranking, setRanking] = useState<RankingHotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [resumenData, rankingData, itemsData] = await Promise.all([
          api.getResumen(),
          api.getRankingHoteles({ limit: 5 }),
          api.getItems(),
        ]);
        setResumen(resumenData);
        setRanking(rankingData);
        setItems(itemsData);
      } catch (err) {
        console.error('Error cargando métricas para IA:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const relavadoRatio = useMemo(() => {
    if (!resumen || resumen.cantidad_total === 0) return 0;
    return resumen.cantidad_relavado / resumen.cantidad_total;
  }, [resumen]);

  const unpricedItems = useMemo(() => {
    return items.filter((i) => i.se_factura && (i.precio_unitario == null || i.precio_unitario <= 0));
  }, [items]);

  // Copy prompt helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(id);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const executivePrompt = `
Actúa como Consultor Senior de Business Intelligence industrial.
Analiza los siguientes KPIs reales del lavadero industrial Poseidón SRL:
- Volumen total procesado: ${formatNumber(resumen?.cantidad_total || 0)} prendas
- Prendas facturables: ${formatNumber(resumen?.cantidad_facturable || 0)} (${resumen?.cantidad_total ? formatPercent(resumen.cantidad_facturable / resumen.cantidad_total) : '0%'})
- Prendas reprocesadas (Relavado): ${formatNumber(resumen?.cantidad_relavado || 0)} (${formatPercent(relavadoRatio)})
- Facturación estimada: ${formatCurrency(resumen?.facturacion_estimada || 0)}
- Top 3 clientes por volumen: ${ranking.map((r, i) => `${i + 1}. ${r.hotel} (${formatNumber(r.cantidad_total)} prendas)`).join(', ')}

Por favor genera:
1. Diagnóstico de eficiencia operativa y desvíos de calidad.
2. Análisis de riesgo por concentración de clientes.
3. 3 recomendaciones prioritarias para optimizar el margen y reducir costos químicos/energéticos.
`.trim();

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-brand-950 via-slate-900 to-indigo-950 p-6 rounded-2xl border border-brand-800/40 relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>Módulo de IA & Business Intelligence</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Diagnóstico Automatizado & Análisis en Lenguaje Natural
            </h2>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              La IA procesa los indicadores calculados de la base de datos PostgreSQL sin exponer datos crudos ni personales, generando diagnósticos ejecutivos instantáneos para el caso de estudio de Poseidón SRL.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 backdrop-blur-sm">
            <BrainCircuit className="h-12 w-12 text-brand-400 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Automated Diagnostic Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Cargando diagnóstico inteligente...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Quality / Relavado Diagnosis */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Control de Calidad</span>
              {relavadoRatio > 0.05 ? (
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle className="h-4 w-4" />
                </div>
              )}
            </div>
            <h3 className="text-base font-bold text-white mb-2">Tasa de Relavado ({formatPercent(relavadoRatio)})</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {relavadoRatio > 0.05 ? (
                <span className="text-rose-300">
                  El reproceso supera el umbral óptimo del 5%. Se recomienda auditar los lotes de toallería y dosificación química de blanqueadores.
                </span>
              ) : (
                <span className="text-emerald-300">
                  El porcentaje de relavado se encuentra dentro del rango óptimo industrial (menor al 5%), minimizando el sobrecosto de agua y energía.
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="font-semibold text-slate-400">Total reprocesado:</span>
            <span>{formatNumber(resumen?.cantidad_relavado || 0)} prendas</span>
          </div>
        </div>

        {/* Client Concentration Analysis */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Concentración de Demanda</span>
              <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Building className="h-4 w-4" />
              </div>
            </div>
            <h3 className="text-base font-bold text-white mb-2">Top Clientes Activos</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {ranking.length > 0 ? (
                <span>
                  El cliente principal es <strong className="text-brand-300">{ranking[0]?.hotel}</strong> con{' '}
                  {formatNumber(ranking[0]?.cantidad_total)} prendas registradas.
                </span>
              ) : (
                'Sin datos suficientes aún para calcular la matriz de concentración.'
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="font-semibold text-slate-400">Líderes de volumen:</span>
            <span className="truncate">{ranking.map((r) => r.hotel).slice(0, 2).join(', ')}</span>
          </div>
        </div>

        {/* Pricing / Revenue Optimization */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completitud Tarifaria</span>
              {unpricedItems.length > 0 ? (
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              ) : (
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle className="h-4 w-4" />
                </div>
              )}
            </div>
            <h3 className="text-base font-bold text-white mb-2">
              {unpricedItems.length === 0 ? 'Tarifario 100% Configurado' : `${unpricedItems.length} Prendas sin Precio`}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {unpricedItems.length > 0 ? (
                <span className="text-amber-300">
                  Hay {unpricedItems.length} prendas facturables sin precio unitario definido. La facturación estimada aumentará al fijar sus tarifas en Catálogos.
                </span>
              ) : (
                <span className="text-emerald-300">
                  Todas las prendas facturables tienen precio asignado, permitiendo cálculos de facturación precisos.
                </span>
              )}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="font-semibold text-slate-400">Facturación calculada:</span>
            <span className="text-cyan-400 font-bold">{formatCurrency(resumen?.facturacion_estimada || 0)}</span>
          </div>
        </div>
      </div>
    )}

      {/* LLM Prompt Generator & Integration Sandbox */}
      <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="h-5 w-5 text-brand-400" />
            <h3 className="font-bold text-slate-100">Prompt Estructurado para Consulta a LLM</h3>
          </div>
          <button
            onClick={() => handleCopy(executivePrompt, 'exec')}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            {copiedPrompt === 'exec' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copiado al portapapeles</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span>Copiar Prompt Resumido</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
          {executivePrompt}
        </div>
      </div>
    </div>
  );
};
