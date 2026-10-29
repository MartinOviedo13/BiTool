import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  Calendar,
  Bot,
  Wrench,
  Sparkles,
  X,
  Columns,
} from 'lucide-react';
import { api } from '../../api/client';
import { PeriodOption, IAArtifact } from '../../types';
import { getDateRange, getTodayDateString, formatDateDisplay } from '../../utils/date';
import { ArtifactRenderer } from './ArtifactRenderer';
import { CanvasModal } from './CanvasModal';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsadas?: string[];
  artifacts?: IAArtifact[];
}

interface ChatWidgetProps {
  onClose?: () => void;
  isEmbeddedInCanvas?: boolean;
}

const SUGGESTIONS = [
  'Generame un gráfico del ranking de facturación por hotel',
  'Generame el reporte ejecutivo completo en Excel para descargar',
  '¿Cuántos operarios y turnos necesitamos la próxima semana?',
  'Generame la liquidación de servicios del Hotel King David en Excel',
  'Mostrame un gráfico con la evolución diaria de producción',
  '¿Hay alertas operativas o de calidad detectadas?',
];

const WELCOME =
  'Hola. Soy tu asistente de Business Intelligence conectado al Servidor MCP de TRITÓN. Puedo generar gráficos interactivos en vivo, emitir reportes Excel (.xlsx) descargables, analizar Fichas 360, proyectar dotación de personal y auditar remitos B2B.';

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  onClose,
  isEmbeddedInCanvas = false,
}) => {
  const [period, setPeriod] = useState<PeriodOption>('month');
  const [customFrom, setCustomFrom] = useState<string>(getTodayDateString());
  const [customTo, setCustomTo] = useState<string>(getTodayDateString());
  const [mensajes, setMensajes] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Estado para el Canvas Modal híbrido
  const [canvasOpen, setCanvasOpen] = useState<boolean>(false);
  const [activeArtifact, setActiveArtifact] = useState<IAArtifact | null>(null);

  // Refs de scroll para evitar que scrollIntoView mueva la ventana principal
  const regularScrollRef = useRef<HTMLDivElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // Recolectar todos los artefactos de la conversación
  const allArtifacts = mensajes.flatMap((m) => m.artifacts || []);

  // Scroll suave exclusivo al interior del contenedor de mensajes
  useEffect(() => {
    const scrollToBottom = (el: HTMLDivElement | null) => {
      if (el) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        });
      }
    };
    scrollToBottom(regularScrollRef.current);
    if (canvasOpen) {
      scrollToBottom(canvasScrollRef.current);
    }
  }, [mensajes, loading, canvasOpen]);

  const rango = getDateRange(period, customFrom, customTo);

  const handleOpenCanvas = (art?: IAArtifact) => {
    if (art) {
      setActiveArtifact(art);
    } else if (!activeArtifact && allArtifacts.length > 0) {
      setActiveArtifact(allArtifacts[allArtifacts.length - 1]);
    }
    setCanvasOpen(true);
  };

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

      const newArtifacts = res.artifacts || [];
      if (newArtifacts.length > 0) {
        setActiveArtifact(newArtifacts[newArtifacts.length - 1]);
      }

      setMensajes((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.respuesta,
          toolsUsadas: res.tools_usadas,
          artifacts: newArtifacts,
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

  // Renderizador unificado del panel de chat (reutilizado tanto en sidebar como en canvas)
  const renderChatPanel = (inCanvas: boolean) => (
    <div className="flex flex-col h-full bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl min-w-0">
      {/* Header */}
      <div className="px-3.5 sm:px-4 py-3 border-b border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-triton-teal/20 text-triton-aqua border border-triton-teal/30">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                Asistente IA
                <span className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> {inCanvas ? 'Gemini 3.8 + Canvas' : 'Gemini 3.8'}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">
                {inCanvas
                  ? 'Consultas y ejecución de herramientas en vivo'
                  : 'Gráficos interactivos & Descarga de Excel'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!inCanvas && (
              <button
                type="button"
                onClick={() => handleOpenCanvas()}
                className="px-2.5 py-1 rounded-xl bg-triton-teal/20 hover:bg-triton-teal/40 text-triton-aqua border border-triton-teal/40 text-[11px] font-bold flex items-center gap-1 transition-all"
                title="Abrir en espacio de trabajo Canvas dividido"
              >
                <Columns className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Canvas</span>
              </button>
            )}

            {!inCanvas && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Cerrar chat"
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
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all ${
                period === opt.id
                  ? 'bg-triton-teal text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
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
        <p className="text-[10px] text-slate-500 mt-1">Contexto temporal: {periodLabel}</p>
      </div>

      {/* Contenedor de Mensajes con ref de scroll interno */}
      <div
        ref={inCanvas ? canvasScrollRef : regularScrollRef}
        className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-4 space-y-3.5 min-h-[240px] min-w-0"
      >
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} min-w-0`}>
            <div
              className={`max-w-[92%] sm:max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed min-w-0 overflow-hidden ${
                m.role === 'user'
                  ? 'bg-triton-aqua text-triton-ink font-semibold rounded-br-sm shadow-md'
                  : 'bg-slate-800/90 text-slate-200 rounded-bl-sm border border-slate-700/80 shadow-md'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>

              {/* Trazabilidad de Herramientas MCP Invocadas */}
              {m.toolsUsadas && m.toolsUsadas.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="font-semibold text-cyan-400 flex items-center gap-1">
                    <Wrench className="h-3 w-3" /> MCP:
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

              {/* Artefactos Visuales y Descargas Inline */}
              {m.artifacts && m.artifacts.length > 0 && (
                <div className="mt-3 space-y-2.5 min-w-0">
                  {m.artifacts.map((art) => (
                    <ArtifactRenderer
                      key={art.id}
                      artifact={art}
                      isExpanded={false}
                      onOpenCanvas={inCanvas ? (selected) => setActiveArtifact(selected) : handleOpenCanvas}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-300 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs border border-slate-700 flex items-center gap-2 shadow-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-triton-aqua" />
              <span>Ejecutando herramientas MCP y generando análisis interactivo…</span>
            </div>
          </div>
        )}
      </div>

      {/* Sugerencias Rápidas */}
      {mensajes.length <= 1 && (
        <div className="px-3.5 sm:px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => enviar(s)}
              disabled={loading}
              className="px-2.5 py-1 rounded-full text-[10px] bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 text-left"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
            placeholder="Pedí un gráfico, reporte Excel, proyecciones o Ficha 360…"
            disabled={loading}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-triton-aqua disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => enviar()}
            disabled={loading || !input.trim()}
            className="p-2 bg-triton-aqua hover:bg-triton-aqua-hover text-triton-ink rounded-xl transition-colors disabled:opacity-40 font-bold"
            title="Enviar consulta"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {renderChatPanel(isEmbeddedInCanvas)}

      {/* Modal Híbrido Canvas con Estado Compartido Unificado */}
      {!isEmbeddedInCanvas && (
        <CanvasModal
          isOpen={canvasOpen}
          onClose={() => setCanvasOpen(false)}
          activeArtifact={activeArtifact}
          allArtifacts={allArtifacts}
          onSelectArtifact={(art) => setActiveArtifact(art)}
          chatChildren={renderChatPanel(true)}
          onSendMessage={(prompt) => enviar(prompt)}
          loading={loading}
        />
      )}
    </>
  );
};
