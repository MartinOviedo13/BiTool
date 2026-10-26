import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Calendar,
  Bot,
  Wrench,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { PeriodOption } from '../../types';
import { getDateRange, getTodayDateString, formatDateDisplay } from '../../utils/date';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolsUsadas?: string[];
}

interface ChatWidgetProps {
  onClose?: () => void;
}

const SUGGESTIONS = [
  '¿Qué hotel facturó menos en el período?',
  '¿Cuántos operarios y turnos necesitamos la próxima semana?',
  '¿Hay alertas operativas o de calidad detectadas?',
  '¿Cómo está la Ficha 360 del Hotel King David?',
  '¿Qué remitos se validaron con diferencias?',
  '¿Quién es nuestro cliente líder por volumen?',
];

const WELCOME =
  'Hola. Soy tu asistente de Business Intelligence conectado al Servidor MCP de Lavadero BI. Puedo consultar en tiempo real rankings, Fichas 360 de hoteles, alertas de planta, estado de remitos B2B y proyecciones de demanda de personal. NUNCA invento números.';

export const ChatWidget: React.FC<ChatWidgetProps> = ({ onClose }) => {
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

    // Preparar historial multi-turno reciente (últimos 6 turnos)
    const historial = mensajes
      .filter((m) => m.content !== WELCOME)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await api.askIA(
        pregunta,
        { fecha_desde: rango.from, fecha_hasta: rango.to },
        historial
      );
      setMensajes((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.respuesta,
          toolsUsadas: res.tools_usadas,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error desconocido';
      setMensajes((m) => [
        ...m,
        { role: 'assistant', content: `No pude responder: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = formatDateDisplay(rango.from) + ' → ' + formatDateDisplay(rango.to);

  return (
    <div className="flex flex-col h-full bg-triton-navy/95 sm:bg-triton-navy/90 sm:rounded-2xl border-0 sm:border border-triton-slate/50 overflow-hidden shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-triton-slate/50 bg-triton-deep/90">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-triton-teal/20 text-triton-aqua border border-triton-teal/40 shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 flex-wrap">
                <span>Asistente IA</span>
                <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> Gemini 3.8 + MCP
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 truncate">
                Conectado al servidor Model Context Protocol de TRITÓN
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              9 MCP Tools Activas
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl bg-triton-deep/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                aria-label="Cerrar asistente"
              >
                <X className="h-4 w-4" />
              </button>
            )}
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
                  ? 'bg-triton-aqua text-triton-navy font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-triton-deep'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {period === 'custom' && (
            <span className="flex flex-wrap items-center gap-1 mt-1 sm:mt-0 sm:ml-1 w-full sm:w-auto">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-triton-deep border border-triton-slate/50 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-triton-deep border border-triton-slate/50 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
              />
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Contexto temporal: {periodLabel}</p>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[240px]">
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-triton-aqua text-triton-navy font-bold rounded-br-sm'
                  : 'bg-triton-deep/90 text-slate-200 rounded-bl-sm border border-slate-700/80 shadow-md'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>

              {/* Trazabilidad de Herramientas MCP Invocadas */}
              {m.toolsUsadas && m.toolsUsadas.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="font-semibold text-cyan-400 flex items-center gap-1">
                    <Wrench className="h-3 w-3" /> MCP Tools:
                  </span>
                  {m.toolsUsadas.map((tool) => (
                    <span
                      key={tool}
                      className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-[9px] shadow-inner"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-triton-deep text-slate-300 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs border border-slate-700 flex items-center gap-2 shadow-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              <span>Consultando herramientas MCP y generando análisis…</span>
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
              className="px-2.5 py-1 rounded-full text-[10px] bg-triton-deep/90 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 text-left"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-triton-slate/50 bg-triton-deep/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder="Hacé una pregunta sobre clientes, remitos, calidad o personal…"
            disabled={loading}
            className="flex-1 bg-triton-deep border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-50"
          />
          <button
            onClick={() => enviar()}
            disabled={loading || !input.trim()}
            className="p-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors disabled:opacity-40 shrink-0"
            title="Enviar consulta"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
