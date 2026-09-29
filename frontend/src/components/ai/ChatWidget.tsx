import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Calendar,
  Bot,
} from 'lucide-react';
import { api } from '../../api/client';
import { PeriodOption } from '../../types';
import { getDateRange, getTodayDateString, formatDateDisplay } from '../../utils/date';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '¿Qué hotel facturó menos este mes?',
  '¿Cómo venimos comparado con el mes pasado?',
  '¿Cuál es la tasa de relavado y está alta?',
  '¿Quién es nuestro top cliente por volumen?',
  '¿Cuánto facturamos en total en el período?',
];

const WELCOME =
  'Hola. Soy tu asistente de Business Intelligence. Preguntame sobre volumen, facturación, ranking de hoteles o tasas de relavado. Uso los datos agregados del sistema, nunca invento números.';

export const ChatWidget: React.FC = () => {
  const [period, setPeriod] = useState<PeriodOption>('month');
  const [customFrom, setCustomFrom] = useState<string>(getTodayDateString());
  const [customTo, setCustomTo] = useState<string>(getTodayDateString());
  const [mensajes, setMensajes] = useState<Message[]>([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading]);

  const rango = getDateRange(period, customFrom, customTo);

  const enviar = async (texto?: string) => {
    const pregunta = (texto ?? input).trim();
    if (!pregunta || loading) return;
    setInput('');
    setMensajes((m) => [...m, { role: 'user', content: pregunta }]);
    setLoading(true);
    try {
      const res = await api.askIA(pregunta, { fecha_desde: rango.from, fecha_hasta: rango.to });
      setMensajes((m) => [...m, { role: 'assistant', content: res.respuesta }]);
    } catch (err: any) {
      setMensajes((m) => [
        ...m,
        { role: 'assistant', content: `No pude responder: ${err.message || 'error desconocido'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = formatDateDisplay(rango.from) + ' → ' + formatDateDisplay(rango.to);

  return (
    <div className="flex flex-col h-full bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
              Asistente IA
              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-brand-950 text-brand-300 border border-brand-800/60">
                Gemini
              </span>
            </h3>
            <p className="text-[10px] text-slate-500">Análisis en lenguaje natural</p>
          </div>
        </div>

        {/* Período selector */}
        <div className="flex flex-wrap items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-slate-500" />
          {(
            [
              { id: 'today', label: 'Hoy' },
              { id: 'last7', label: '7 días' },
              { id: 'month', label: 'Mes' },
              { id: 'custom', label: 'Personalizado' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                period === opt.id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {period === 'custom' && (
            <span className="flex items-center gap-1 ml-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
              />
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Contexto: {periodLabel}</p>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[240px]">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-sm'
                  : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-300 rounded-2xl rounded-bl-sm px-3 py-2 text-xs border border-slate-700 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
              Pensando…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Sugerencias */}
      {mensajes.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              disabled={loading}
              className="px-2.5 py-1 rounded-full text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 text-left"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder="Hacé una pregunta sobre el negocio…"
            disabled={loading}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-50"
          />
          <button
            onClick={() => enviar()}
            disabled={loading || !input.trim()}
            className="p-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
