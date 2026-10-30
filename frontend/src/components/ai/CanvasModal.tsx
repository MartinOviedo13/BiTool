import React, { useEffect, useRef, useState, useId } from 'react';
import {
  X,
  Sparkles,
  Maximize2,
  Columns,
  Layers,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  Loader2,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { IAArtifact } from '../../types';
import { ArtifactRenderer } from './ArtifactRenderer';

interface CanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeArtifact: IAArtifact | null;
  allArtifacts: IAArtifact[];
  onSelectArtifact: (art: IAArtifact | null) => void;
  chatChildren: React.ReactNode;
  onSendMessage?: (prompt: string) => void;
  loading?: boolean;
}

const QUICK_ACTIONS = [
  {
    id: 'rentabilidad',
    icon: BarChart3,
    color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60 hover:border-emerald-500',
    iconBg: 'bg-emerald-500/10 text-emerald-400',
    title: 'Unit Economics & Margen Neto',
    desc: 'Facturación Bruta vs Costos (Químicos, Gas/Energía, Mano de Obra) y margen % por hotel.',
    prompt: 'Generame el análisis de rentabilidad y margen neto de los hoteles en un gráfico',
  },
  {
    id: 'excel_rentabilidad',
    icon: FileSpreadsheet,
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60 hover:border-cyan-500',
    iconBg: 'bg-cyan-500/10 text-cyan-400',
    title: 'Excel de Rentabilidad & Costos',
    desc: 'Libro .xlsx completo con fórmulas de margen, desglose de costos y clasificación estratégica.',
    prompt: 'Generame el reporte de rentabilidad y costos operativos en Excel para descargar',
  },
  {
    id: 'heatmap',
    icon: TrendingUp,
    color: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/60 hover:border-indigo-500',
    iconBg: 'bg-indigo-500/10 text-indigo-400',
    title: 'Mapa de Carga de Planta (Heatmap)',
    desc: 'Matriz semanal de intensidad por día y sector físico (Calandras vs Secadoras).',
    prompt: 'Generame el mapa de calor de carga e intensidad semanal de la planta',
  },
  {
    id: 'prevision_demanda',
    icon: Users,
    color: 'text-amber-400 bg-amber-950/60 border-amber-800/60 hover:border-amber-500',
    iconBg: 'bg-amber-500/10 text-amber-400',
    title: 'Previsión de Temporada a 15 Días',
    desc: 'Curva predictiva de prendas, kilos procesados y litros de insumos químicos requeridos.',
    prompt: 'Generame la curva predictiva de demanda y previsión de insumos químicos a 15 días',
  },
  {
    id: 'cuadrantes',
    icon: FileText,
    color: 'text-teal-400 bg-teal-950/60 border-teal-800/60 hover:border-teal-500',
    iconBg: 'bg-teal-500/10 text-teal-400',
    title: 'Cuadrante Margen vs Volumen',
    desc: 'Matriz de dispersión estratégica clasificando clientes Estrella, Estables y en Riesgo.',
    prompt: 'Generame el gráfico de cuadrantes de clientes comparando margen neto vs volumen',
  },
  {
    id: 'ranking',
    icon: BarChart3,
    color: 'text-sky-400 bg-sky-950/60 border-sky-800/60 hover:border-sky-500',
    iconBg: 'bg-sky-500/10 text-sky-400',
    title: 'Ranking de Facturación Comercial',
    desc: 'Gráfico interactivo con el top de hoteles por facturación del período con porcentajes.',
    prompt: 'Generame un gráfico del ranking de facturación por hotel',
  },
];

export const CanvasModal: React.FC<CanvasModalProps> = ({
  isOpen,
  onClose,
  activeArtifact,
  allArtifacts,
  onSelectArtifact,
  chatChildren,
  onSendMessage,
  loading = false,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [fullscreenCanvas, setFullscreenCanvas] = useState<boolean>(false);
  const [showLaunchpad, setShowLaunchpad] = useState<boolean>(false);

  // Abrir y cerrar el modal nativo usando la API estándar showModal()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Manejo de cierre por tecla Esc y evento cancel nativo
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    // Fallback de click outside para navegadores sin closedby nativo
    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        onClose();
      }
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onClose]);

  if (!isOpen) return null;

  const currentArtifact = showLaunchpad ? null : activeArtifact;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="canvas-dialog fixed inset-2 sm:inset-6 md:inset-8 z-50 max-w-[96vw] max-h-[94vh] w-full h-full p-0 bg-slate-950 text-slate-100 rounded-3xl border border-triton-teal/50 shadow-2xl flex flex-col overflow-hidden backdrop-blur-md"
    >
      {/* Header Superior del Workspace */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-triton-teal/20 text-triton-aqua border border-triton-teal/40">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 id={titleId} className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Workspace Analítico • TRITÓN Canvas
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                Gemini 3.8 + MCP Generativo
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Generación de gráficos interactivos, proyecciones y planillas Excel en vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternar pantalla completa para el lienzo */}
          {currentArtifact && (
            <button
              type="button"
              onClick={() => setFullscreenCanvas((v) => !v)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors hidden md:flex items-center gap-1.5 text-xs font-medium"
              title={fullscreenCanvas ? 'Vista dividida Chat + Lienzo' : 'Maximizar lienzo'}
            >
              {fullscreenCanvas ? (
                <>
                  <Columns className="h-4 w-4" />
                  <span>Vista Dividida</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  <span>Solo Lienzo</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-400 transition-colors"
            aria-label="Cerrar espacio de trabajo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contenido Principal Dividido */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-800">
        {/* Panel Izquierdo: Chat Integrado */}
        <div
          className={`${
            fullscreenCanvas ? 'hidden' : 'flex'
          } flex-col w-full md:w-[42%] lg:w-[38%] h-full overflow-hidden bg-slate-900/60`}
        >
          {chatChildren}
        </div>

        {/* Panel Derecho: Lienzo de Artefactos (Gráficos, Tablas, Descargas) */}
        <div
          className={`${
            fullscreenCanvas ? 'w-full' : 'flex-1'
          } flex flex-col h-full overflow-y-auto p-4 sm:p-6 bg-slate-950/80 min-w-0`}
        >
          {/* Barra superior de pestañas de artefactos */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                <Layers className="h-3.5 w-3.5 text-triton-aqua" /> Artefactos ({allArtifacts.length}):
              </span>
              {allArtifacts.map((art, idx) => (
                <button
                  key={art.id || idx}
                  type="button"
                  onClick={() => {
                    setShowLaunchpad(false);
                    onSelectArtifact(art);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    !showLaunchpad && currentArtifact?.id === art.id
                      ? 'bg-triton-teal text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {art.type === 'excel' ? (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  )}
                  <span>{art.title}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowLaunchpad((v) => !v);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                showLaunchpad
                  ? 'bg-triton-teal text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
              title="Ver generador de acciones rápidas"
            >
              <Plus className="h-3.5 w-3.5 text-triton-aqua" />
              <span>Plantillas Rápidas</span>
            </button>
          </div>

          {/* Banner si hay una consulta ejecutándose en segundo plano */}
          {loading && (
            <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-cyan-950/50 border border-cyan-800/60 text-cyan-200 text-xs shadow-md animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-triton-aqua shrink-0" />
              <span>Ejecutando herramientas MCP y generando nuevo artefacto interactivo…</span>
            </div>
          )}

          {/* Estado A: Artefacto Activo */}
          {currentArtifact ? (
            <div className="space-y-4">
              <ArtifactRenderer artifact={currentArtifact} isExpanded={true} />
            </div>
          ) : loading ? (
            /* Estado B: Cargando sin artefacto previo */
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="p-4 rounded-3xl bg-slate-900 border border-triton-teal/40 mb-4 shadow-lg shadow-triton-aqua/10">
                <Loader2 className="h-10 w-10 text-triton-aqua animate-spin" />
              </div>
              <h3 className="text-base font-bold text-white">
                Generando análisis interactivo en tiempo real…
              </h3>
              <p className="text-xs text-slate-400 max-w-md mt-2 leading-relaxed">
                Gemini 3.8 está ejecutando herramientas del servidor MCP de TRITÓN, consultando las bases de datos y proyectando el lienzo.
              </p>
            </div>
          ) : (
            /* Estado C: Panel de Lanzamiento Rápido con 6 Acciones Interactivas */
            <div className="flex-1 flex flex-col justify-start py-4">
              <div className="text-center max-w-2xl mx-auto mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-triton-teal/40 text-triton-aqua text-xs font-semibold mb-3">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Lienzo Analítico Multimodal</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                  ¿Qué análisis o reporte querés proyectar?
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Hacé clic en cualquiera de las acciones recomendadas a continuación para generarla al instante, o realizá cualquier consulta personalizada en el chat:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-w-5xl mx-auto w-full">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        setShowLaunchpad(false);
                        onSendMessage?.(action.prompt);
                      }}
                      className={`text-left p-4 rounded-2xl bg-slate-900/90 border transition-all duration-200 hover:scale-[1.02] hover:shadow-xl flex flex-col justify-between group ${action.color}`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className={`p-2 rounded-xl ${action.iconBg}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className="text-[10px] uppercase font-mono tracking-wider opacity-60 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            Generar <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                        <h4 className="font-bold text-white text-sm mb-1 group-hover:text-triton-aqua transition-colors">
                          {action.title}
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {action.desc}
                        </p>
                      </div>
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono text-[10px] text-slate-500">MCP Tool</span>
                        <span className="font-bold text-triton-aqua">1 Clic</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};
