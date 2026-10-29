import React, { useEffect, useRef, useState, useId } from 'react';
import {
  X,
  Sparkles,
  Maximize2,
  Columns,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { IAArtifact } from '../../types';
import { ArtifactRenderer } from './ArtifactRenderer';

interface CanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeArtifact: IAArtifact | null;
  allArtifacts: IAArtifact[];
  onSelectArtifact: (art: IAArtifact) => void;
  chatChildren: React.ReactNode;
}

export const CanvasModal: React.FC<CanvasModalProps> = ({
  isOpen,
  onClose,
  activeArtifact,
  allArtifacts,
  onSelectArtifact,
  chatChildren,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [fullscreenCanvas, setFullscreenCanvas] = useState<boolean>(false);

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
              Generación de gráficos, reportes interactivos y planillas Excel en vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternar pantalla completa para el lienzo */}
          {activeArtifact && (
            <button
              type="button"
              onClick={() => setFullscreenCanvas((v) => !v)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors hidden md:flex items-center gap-1.5 text-xs"
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
        {/* Panel Izquierdo: Chat */}
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
          } flex flex-col h-full overflow-y-auto p-4 sm:p-6 bg-slate-950/80`}
        >
          {/* Selector de Artefactos Generados si hay más de 1 */}
          {allArtifacts.length > 1 && (
            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                <Layers className="h-3.5 w-3.5 text-triton-aqua" /> Artefactos:
              </span>
              {allArtifacts.map((art, idx) => (
                <button
                  key={art.id || idx}
                  type="button"
                  onClick={() => onSelectArtifact(art)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    activeArtifact?.id === art.id
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
          )}

          {activeArtifact ? (
            <div className="space-y-4">
              <ArtifactRenderer artifact={activeArtifact} isExpanded={true} />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 mb-4">
                <Sparkles className="h-10 w-10 text-triton-aqua/60 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-slate-300">
                Lienzo de Análisis TRITÓN listo
              </h3>
              <p className="text-xs text-slate-400 max-w-md mt-2 leading-relaxed">
                Hacé una pregunta en el chat como: <br />
                <span className="text-triton-aqua font-semibold">
                  "Generame un gráfico del ranking de facturación"
                </span>{' '}
                o <br />
                <span className="text-emerald-400 font-semibold">
                  "Generame el reporte ejecutivo en Excel para descargar"
                </span>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};
