import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Loader2,
  Save,
  Check,
  X,
  FileCheck2,
  Building2,
  Calendar,
  Hash,
  AlertCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  Hotel,
  Item,
  LoteProcesamientoResponse,
  UpdateRemitoBorradorItemDTO,
  RemitoBorradorItem,
} from '../../types';
import { compressImageBatch } from '../../utils/imageCompressor';

export interface ConfirmadoRemitoInfo {
  envio_id: number;
  hotel_id?: number;
  fecha?: string;
  numero_remito?: string;
}

interface CargaRemitosIAViewProps {
  onRemitoConfirmado?: (info: ConfirmadoRemitoInfo) => void;
  onCerrar?: () => void;
}

export const CargaRemitosIAView: React.FC<CargaRemitosIAViewProps> = ({
  onRemitoConfirmado,
  onCerrar,
}) => {
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [itemsCatalogo, setItemsCatalogo] = useState<Item[]>([]);
  const [loadingCatalogos, setLoadingCatalogos] = useState(true);

  // Estados de carga y lote
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState({ current: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [loteActual, setLoteActual] = useState<LoteProcesamientoResponse | null>(null);
  const [pollingLote, setPollingLote] = useState(false);

  // Remito seleccionado para revisión
  const [selectedBorradorIndex, setSelectedBorradorIndex] = useState<number>(0);
  const [editHotelId, setEditHotelId] = useState<number>(0);
  const [editFecha, setEditFecha] = useState<string>('');
  const [editNumeroRemito, setEditNumeroRemito] = useState<string>('');
  const [editObservaciones, setEditObservaciones] = useState<string>('');

  // Cantidades precargadas por prenda (formato idéntico a la carga manual)
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  // Prendas detectadas por la IA que no pudieron mapearse automáticamente
  const [unassignedItems, setUnassignedItems] = useState<RemitoBorradorItem[]>([]);
  const [filtroPrenda, setFiltroPrenda] = useState<string>('');
  const [sectorFiltro, setSectorFiltro] = useState<'all' | 'planchado' | 'secadora'>('all');

  // Estados visuales de la foto (zoom, rotación)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [confirmingSingle, setConfirmingSingle] = useState<boolean>(false);
  const [confirmingAllOK, setConfirmingAllOK] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modo de visualización en móvil: 'foto' o 'datos'
  const [mobileTab, setMobileTab] = useState<'foto' | 'datos'>('datos');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 1. Cargar catálogos iniciales
  useEffect(() => {
    Promise.all([api.getHoteles(), api.getItems()])
      .then(([hotelesData, itemsData]) => {
        setHoteles(hotelesData.filter((h) => h.activo));
        setItemsCatalogo(itemsData.filter((it) => it.activo));
      })
      .finally(() => setLoadingCatalogos(false));
  }, []);

  // 2. Polling activo mientras el lote tenga fotos procesándose en background
  useEffect(() => {
    if (!loteActual || loteActual.completado || !pollingLote) return;

    const timer = setInterval(async () => {
      try {
        const data = await api.getLoteStatus(loteActual.lote_id);
        setLoteActual(data);
        if (data.completado) {
          setPollingLote(false);
          setStatusMsg({
            type: 'success',
            text: `¡Análisis completado! Se procesaron las ${data.total} fotos de remitos.`,
          });
        }
      } catch (err) {
        // Silencioso en polling
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [loteActual?.lote_id, loteActual?.completado, pollingLote]);

  // 3. Sincronizar formulario editable cuando cambia el borrador o cuando el polling actualiza sus datos
  const borradorActual = loteActual?.borradores[selectedBorradorIndex] || null;

  useEffect(() => {
    if (!borradorActual) return;

    setEditHotelId(borradorActual.hotel_id || 0);
    setEditFecha(borradorActual.fecha || new Date().toISOString().split('T')[0]);
    setEditNumeroRemito(borradorActual.numero_remito || '');
    setEditObservaciones(borradorActual.observaciones || '');

    // Precargar cantidades leídas por Gemini en los casilleros de las prendas
    const prefilledCantidades: Record<number, number> = {};
    const unassigned: RemitoBorradorItem[] = [];

    (borradorActual.items || []).forEach((it) => {
      if (it.item_id && it.item_id > 0) {
        prefilledCantidades[it.item_id] = it.cantidad;
      } else {
        unassigned.push(it);
      }
    });

    setCantidades(prefilledCantidades);
    setUnassignedItems(unassigned);
    setZoomLevel(1);
    setRotation(0);
  }, [
    borradorActual?.id,
    borradorActual?.estado,
    borradorActual?.items?.length,
    borradorActual?.actualizado_en,
  ]);

  // Manejador de selección de archivos
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  // Disparar procesamiento del lote
  const handleIniciarLote = async () => {
    if (selectedFiles.length === 0) return;
    setStatusMsg(null);
    setCompressing(true);
    setCompressProgress({ current: 0, total: selectedFiles.length });

    try {
      const compressedFiles = await compressImageBatch(selectedFiles, (curr, total) => {
        setCompressProgress({ current: curr, total });
      });

      setCompressing(false);
      setUploading(true);

      const resp = await api.uploadRemitosLote(compressedFiles);
      setUploading(false);
      setSelectedFiles([]);

      const loteData = await api.getLoteStatus(resp.lote_id);
      setLoteActual(loteData);
      setSelectedBorradorIndex(0);
      setPollingLote(!loteData.completado);
      setStatusMsg({
        type: 'info',
        text: `Subida exitosa (${loteData.total} fotos). Gemini está analizando cada remito en segundo plano...`,
      });
    } catch (err: any) {
      setCompressing(false);
      setUploading(false);
      setStatusMsg({
        type: 'error',
        text: err.message || 'Ocurrió un error al subir el lote de remitos.',
      });
    }
  };

  // Ajuste táctil de cantidad de prenda (igual que en carga manual)
  const ajustarCantidad = (itemId: number, delta: number) => {
    setCantidades((prev) => {
      const actual = prev[itemId] || 0;
      const nuevo = Math.max(0, actual + delta);
      if (nuevo === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: nuevo };
    });
  };

  const setCantidadDirecta = (itemId: number, valor: string) => {
    const parsed = parseInt(valor, 10);
    const cant = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setCantidades((prev) => {
      if (cant === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: cant };
    });
  };

  // Asignar un ítem dudoso/no reconocido a una prenda del catálogo
  const handleAsignarItemNoReconocido = (unassignedIdx: number, targetItemId: number) => {
    if (targetItemId <= 0) return;
    const itemTarget = unassignedItems[unassignedIdx];
    ajustarCantidad(targetItemId, itemTarget.cantidad);
    setUnassignedItems((prev) => prev.filter((_, idx) => idx !== unassignedIdx));
  };

  // Convertir cantidades a DTO para enviar al backend
  const generarItemsDTO = (): UpdateRemitoBorradorItemDTO[] => {
    const result: UpdateRemitoBorradorItemDTO[] = [];
    Object.entries(cantidades).forEach(([itemIdStr, cant]) => {
      if (cant > 0) {
        const itemId = parseInt(itemIdStr, 10);
        const itemCat = itemsCatalogo.find((it) => it.id === itemId);
        result.push({
          item_id: itemId,
          item_nombre_detectado: itemCat?.nombre || `Prenda ${itemId}`,
          cantidad: cant,
          cantidad_relavado: 0,
          cantidad_rota: 0,
          confianza: 1.0,
          dudoso: false,
        });
      }
    });
    // Incluir prendas no asignadas si las hubiera
    unassignedItems.forEach((un) => {
      result.push({
        item_id: null,
        item_nombre_detectado: un.item_nombre_detectado,
        cantidad: un.cantidad,
        cantidad_relavado: 0,
        cantidad_rota: 0,
        confianza: un.confianza,
        dudoso: true,
        nota: un.nota,
      });
    });
    return result;
  };

  // Total de prendas declaradas
  const totalPrendas = useMemo(() => {
    const cantCatalog = Object.values(cantidades).reduce((acc, curr) => acc + (curr || 0), 0);
    const cantUnassigned = unassignedItems.reduce((acc, curr) => acc + (curr.cantidad || 0), 0);
    return cantCatalog + cantUnassigned;
  }, [cantidades, unassignedItems]);

  // Ítems del catálogo filtrados
  const itemsFiltrados = useMemo(() => {
    let result = itemsCatalogo;
    if (sectorFiltro !== 'all') {
      result = result.filter((it) => it.sector === sectorFiltro);
    }
    if (filtroPrenda.trim()) {
      const q = filtroPrenda.toLowerCase();
      result = result.filter((it) => it.nombre.toLowerCase().includes(q));
    }
    return result;
  }, [itemsCatalogo, sectorFiltro, filtroPrenda]);

  // Guardar cambios en el borrador
  const handleGuardarCambiosBorrador = async () => {
    if (!borradorActual) return;
    setSavingEdit(true);
    setStatusMsg(null);

    try {
      const updated = await api.updateRemitoBorrador(borradorActual.id, {
        hotel_id: editHotelId > 0 ? editHotelId : null,
        fecha: editFecha || null,
        numero_remito: editNumeroRemito || null,
        observaciones: editObservaciones || null,
        items: generarItemsDTO(),
      });

      if (loteActual) {
        const nuevosBorradores = [...loteActual.borradores];
        nuevosBorradores[selectedBorradorIndex] = updated;
        setLoteActual({ ...loteActual, borradores: nuevosBorradores });
      }

      setStatusMsg({ type: 'success', text: 'Cambios guardados correctamente en el borrador.' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'No se pudieron guardar los cambios.' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Confirmar remito individual
  const handleConfirmarBorradorActual = async () => {
    if (!borradorActual) return;
    if (editHotelId <= 0) {
      setStatusMsg({ type: 'error', text: 'Seleccione un hotel antes de confirmar.' });
      return;
    }
    if (!editFecha) {
      setStatusMsg({ type: 'error', text: 'Indique una fecha válida.' });
      return;
    }
    if (totalPrendas === 0) {
      setStatusMsg({ type: 'error', text: 'Debe haber al menos una prenda con cantidad mayor a 0.' });
      return;
    }

    setConfirmingSingle(true);
    setStatusMsg(null);

    try {
      // 1. Guardar cambios en BD
      await api.updateRemitoBorrador(borradorActual.id, {
        hotel_id: editHotelId,
        fecha: editFecha,
        numero_remito: editNumeroRemito,
        observaciones: editObservaciones,
        items: generarItemsDTO(),
      });

      // 2. Confirmar remito
      const res = await api.confirmarRemitoBorrador(borradorActual.id);

      if (loteActual) {
        const nuevosBorradores = [...loteActual.borradores];
        nuevosBorradores[selectedBorradorIndex] = {
          ...nuevosBorradores[selectedBorradorIndex],
          estado: 'confirmado',
          envio_id: res.envio_id,
        };
        setLoteActual({ ...loteActual, borradores: nuevosBorradores });
      }

      setStatusMsg({
        type: 'success',
        text: `Remito ${res.codigo_qr} confirmado con éxito (${res.total_prendas} prendas). Foto temporal eliminada.`,
      });

      if (onRemitoConfirmado) {
        onRemitoConfirmado({
          envio_id: res.envio_id,
          hotel_id: res.hotel_id || editHotelId,
          fecha: res.fecha || editFecha,
          numero_remito: res.numero_remito || editNumeroRemito,
        });
      }

      // Si quedan pendientes en el lote, avanzar al siguiente remito
      if (
        loteActual &&
        loteActual.borradores.some(
          (b, idx) =>
            idx !== selectedBorradorIndex &&
            b.estado !== 'confirmado' &&
            b.estado !== 'descartado'
        )
      ) {
        avanzarSiguientePendiente();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error al confirmar el remito.' });
    } finally {
      setConfirmingSingle(false);
    }
  };

  // Confirmar masivamente los 100% claros
  const handleConfirmarTodosOK = async () => {
    if (!loteActual) return;
    setConfirmingAllOK(true);
    setStatusMsg(null);

    try {
      const res = await api.confirmarTodosOKLote(loteActual.lote_id);
      const refreshed = await api.getLoteStatus(loteActual.lote_id);
      setLoteActual(refreshed);
      setStatusMsg({
        type: 'success',
        text: `${res.mensaje}`,
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error en confirmación masiva.' });
    } finally {
      setConfirmingAllOK(false);
    }
  };

  const handleDescartarBorradorActual = async () => {
    if (!borradorActual) return;
    if (!window.confirm('¿Desea descartar este remito? Se eliminará la foto temporal.')) return;

    try {
      await api.deleteRemitoBorrador(borradorActual.id);
      if (loteActual) {
        const nuevosBorradores = [...loteActual.borradores];
        nuevosBorradores[selectedBorradorIndex] = {
          ...nuevosBorradores[selectedBorradorIndex],
          estado: 'descartado',
        };
        setLoteActual({ ...loteActual, borradores: nuevosBorradores });
      }
      avanzarSiguientePendiente();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'No se pudo descartar el borrador.' });
    }
  };

  const avanzarSiguientePendiente = () => {
    if (!loteActual) return;
    const nextIdx = loteActual.borradores.findIndex(
      (b, idx) => idx > selectedBorradorIndex && b.estado === 'pendiente_revision'
    );
    if (nextIdx !== -1) {
      setSelectedBorradorIndex(nextIdx);
    } else {
      const firstPend = loteActual.borradores.findIndex(
        (b) => b.estado === 'pendiente_revision'
      );
      if (firstPend !== -1) {
        setSelectedBorradorIndex(firstPend);
      }
    }
  };

  if (loadingCatalogos) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-400" />
        Cargando catálogos del lavadero...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-7xl mx-auto p-2 sm:p-4 gap-3 text-slate-100">
      {/* ── Encabezado Principal ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-lg backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 rounded-lg text-cyan-400">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Digitalización de Remitos con Gemini
              <span className="text-xs px-2 py-0.5 bg-cyan-950 border border-cyan-800 text-cyan-300 rounded-full font-mono">
                IA Multimodal
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Sube fotos o toma fotos de remitos en papel; Gemini precarga la planilla con las cantidades detectadas para que las verifiques y corrijas.
            </p>
          </div>
        </div>

        {onCerrar && (
          <button
            onClick={onCerrar}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Mensajes de Alerta / Estado ── */}
      {statusMsg && (
        <div
          className={`flex items-center justify-between p-3 rounded-lg border text-xs sm:text-sm transition animate-in fade-in ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
              : statusMsg.type === 'error'
              ? 'bg-rose-950/70 border-rose-800 text-rose-200'
              : 'bg-cyan-950/70 border-cyan-800 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs underline opacity-80 hover:opacity-100 ml-4"
          >
            Descartar
          </button>
        </div>
      )}

      {/* ── SECCIÓN 1: Selección y Subida de Fotos (Si no hay lote activo) ── */}
      {!loteActual && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-lg">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFilesSelected}
            multiple
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFilesSelected}
            capture="environment"
            accept="image/*"
            className="hidden"
          />

          <div className="max-w-md mx-auto flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-700/50 flex items-center justify-center text-cyan-400 shadow-inner">
              <Upload className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-white">Subir o Fotografiar Remitos</h2>
              <p className="text-xs text-slate-400 mt-1">
                Puedes cargar hasta 50 remitos juntos. Las fotos se optimizan y comprimen en tu celular antes de enviarse.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 justify-center w-full mt-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-cyan-900/30 transition active:scale-95"
              >
                <Camera className="w-4 h-4" />
                Usar Cámara
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-sm rounded-xl transition active:scale-95"
              >
                <Upload className="w-4 h-4" />
                Elegir Archivos
              </button>
            </div>

            {selectedFiles.length > 0 && (
              <div className="w-full mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-cyan-400">
                    {selectedFiles.length} foto(s) lista(s) para procesar
                  </span>
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Limpiar selección
                  </button>
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 text-xs text-slate-300 font-mono">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-slate-900">
                      <span className="truncate max-w-[200px]">{f.name}</span>
                      <span className="text-slate-500">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleIniciarLote}
                  disabled={compressing || uploading}
                  className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {compressing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Comprimiendo {compressProgress.current} de {compressProgress.total}...
                    </>
                  ) : uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Subiendo fotos al servidor...
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      Comenzar Análisis con Gemini ({selectedFiles.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECCIÓN 2: Lote en curso y Barra de Progreso ── */}
      {loteActual && (
        <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-xl shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded">
                Lote: {loteActual.lote_id}
              </span>
              {pollingLote && (
                <span className="flex items-center gap-1.5 text-xs text-cyan-400 animate-pulse font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analizando en paralelo...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmarTodosOK}
                disabled={confirmingAllOK || loteActual.pendientes > 0}
                className="px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-40"
                title="Confirma automáticamente los remitos que tengan alta confianza y ningún dato dudoso"
              >
                {confirmingAllOK ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Confirmar Todos los 100% Claros
              </button>

              <button
                onClick={() => {
                  if (window.confirm('¿Desea cerrar el visor del lote y cargar fotos nuevas?')) {
                    setLoteActual(null);
                  }
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition"
              >
                Nuevo Lote
              </button>
            </div>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800 flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{
                width: `${(loteActual.borradores.filter((b) => b.estado === 'confirmado').length / (loteActual.total || 1)) * 100}%`,
              }}
              title="Confirmados"
            />
            <div
              className="bg-cyan-500 transition-all duration-500"
              style={{
                width: `${(loteActual.borradores.filter((b) => b.estado === 'pendiente_revision').length / (loteActual.total || 1)) * 100}%`,
              }}
              title="Listos para revisar"
            />
            <div
              className="bg-amber-500 animate-pulse"
              style={{
                width: `${(loteActual.pendientes / (loteActual.total || 1)) * 100}%`,
              }}
              title="Analizando"
            />
          </div>

          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span>
              Total: {loteActual.total} | Procesados: {loteActual.procesados} | En cola:{' '}
              {loteActual.pendientes}
            </span>
            <span>
              Confirmados:{' '}
              {loteActual.borradores.filter((b) => b.estado === 'confirmado').length} / {loteActual.total}
            </span>
          </div>

          {/* Carrusel de remitos del lote */}
          <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            {loteActual.borradores.map((b, idx) => {
              const isSelected = idx === selectedBorradorIndex;
              const tieneDudoso = (b.items || []).some((it) => it.dudoso);
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBorradorIndex(idx)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
                    isSelected
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-200 ring-1 ring-cyan-500'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-mono">#{idx + 1}</span>
                  {b.estado === 'procesando' ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                  ) : b.estado === 'confirmado' ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : b.estado === 'descartado' ? (
                    <X className="w-3 h-3 text-slate-500" />
                  ) : tieneDudoso ? (
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                  ) : (
                    <FileCheck2 className="w-3 h-3 text-cyan-400" />
                  )}
                  <span className="truncate max-w-[110px]">
                    {b.hotel?.nombre || b.hotel_nombre_detectado || 'Sin Hotel'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: Vista de Edición y Foto (Lado a Lado / Mobile Tabs) ── */}
      {borradorActual && (
        <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {/* Barra superior de navegación */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedBorradorIndex((prev) => Math.max(0, prev - 1))}
                disabled={selectedBorradorIndex === 0}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-slate-300">
                Remito {selectedBorradorIndex + 1} de {loteActual?.borradores.length || 1}
              </span>
              <button
                onClick={() =>
                  setSelectedBorradorIndex((prev) =>
                    Math.min((loteActual?.borradores.length || 1) - 1, prev + 1)
                  )
                }
                disabled={selectedBorradorIndex === (loteActual?.borradores.length || 1) - 1}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span
                className={`ml-2 px-2 py-0.5 rounded text-[11px] font-medium uppercase ${
                  borradorActual.estado === 'confirmado'
                    ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                    : borradorActual.estado === 'procesando'
                    ? 'bg-amber-950 border border-amber-700 text-amber-300'
                    : 'bg-cyan-950 border border-cyan-800 text-cyan-300'
                }`}
              >
                {borradorActual.estado.replace('_', ' ')}
              </span>

              {borradorActual.confianza_promedio > 0 && (
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                    borradorActual.confianza_promedio >= 0.85
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : borradorActual.confianza_promedio >= 0.7
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  Legibilidad: {(borradorActual.confianza_promedio * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {/* Selector de pestañas para móviles */}
            <div className="flex md:hidden border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setMobileTab('foto')}
                className={`px-3 py-1 font-medium ${
                  mobileTab === 'foto' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Ver Foto
              </button>
              <button
                onClick={() => setMobileTab('datos')}
                className={`px-3 py-1 font-medium ${
                  mobileTab === 'datos' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Editar Tabla
              </button>
            </div>
          </div>

          {/* Área principal: Split Screen */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 min-h-[500px]">
            {/* ── COLUMNA 1: Foto del Remito con Zoom / Rotación ── */}
            <div
              className={`flex flex-col bg-slate-950 relative overflow-hidden ${
                mobileTab === 'foto' ? 'flex' : 'hidden md:flex'
              }`}
            >
              <div className="absolute top-2 right-2 z-10 flex gap-1.5 bg-slate-900/90 border border-slate-700 p-1 rounded-lg backdrop-blur shadow">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded"
                  title="Acercar (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.75))}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded"
                  title="Alejar (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded"
                  title="Rotar 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center p-4 overflow-auto max-h-[640px] select-none">
                {borradorActual.estado === 'confirmado' ? (
                  <div className="text-center p-8 text-slate-500">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-60" />
                    <p className="text-sm font-medium text-slate-400">Remito ya confirmado</p>
                    <p className="text-xs text-slate-600 mt-1">
                      La foto temporal ha sido eliminada del disco para no ocupar espacio en el servidor.
                    </p>
                  </div>
                ) : (
                  <img
                    src={api.getRemitoBorradorImagenUrl(borradorActual.id)}
                    alt="Foto del remito"
                    className="max-w-full max-h-full object-contain transition-transform duration-200 rounded shadow-md"
                    style={{
                      transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                    }}
                  />
                )}
              </div>
            </div>

            {/* ── COLUMNA 2: Formulario idéntico a la carga manual con cantidades precargadas ── */}
            <div
              className={`flex flex-col p-4 overflow-y-auto space-y-4 max-h-[640px] ${
                mobileTab === 'datos' ? 'flex' : 'hidden md:flex'
              }`}
            >
              {/* Cabecera editable (Hotel, Fecha, Número) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                    Hotel / Cliente *
                  </label>
                  <select
                    value={editHotelId}
                    onChange={(e) => setEditHotelId(Number(e.target.value))}
                    disabled={borradorActual.estado === 'confirmado'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value={0}>-- Seleccionar Hotel --</option>
                    {hoteles.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.nombre}
                      </option>
                    ))}
                  </select>
                  {borradorActual.hotel_nombre_detectado && (
                    <span className="text-[11px] text-cyan-400/90 mt-1 block">
                      Detectado en foto: <strong>"{borradorActual.hotel_nombre_detectado}"</strong>
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={editFecha}
                    onChange={(e) => setEditFecha(e.target.value)}
                    disabled={borradorActual.estado === 'confirmado'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-cyan-400" />
                    N° Remito Papel *
                  </label>
                  <input
                    type="text"
                    value={editNumeroRemito}
                    onChange={(e) => setEditNumeroRemito(e.target.value)}
                    disabled={borradorActual.estado === 'confirmado'}
                    placeholder="Ej: 0001-0004523"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Alerta de prendas leídas que no están en el catálogo cerrado */}
              {unassignedItems.length > 0 && (
                <div className="p-3 bg-amber-950/60 border border-amber-700/80 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Conceptos detectados en el remito pendientes de asignar ({unassignedItems.length}):</span>
                  </div>
                  <div className="space-y-1.5">
                    {unassignedItems.map((un, idx) => (
                      <div key={idx} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/80 rounded border border-amber-900/50 text-xs">
                        <div>
                          <span className="font-bold text-white">"{un.item_nombre_detectado}"</span>
                          <span className="text-cyan-300 font-mono ml-2">({un.cantidad} u.)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">Asignar a:</span>
                          <select
                            onChange={(e) => handleAsignarItemNoReconocido(idx, Number(e.target.value))}
                            defaultValue={0}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                          >
                            <option value={0}>-- Elegir prenda --</option>
                            {itemsCatalogo.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.nombre} ({it.sector})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtro y Barra de búsqueda de prendas */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSectorFiltro('all')}
                    className={`px-2.5 py-1 rounded font-medium ${
                      sectorFiltro === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas ({itemsCatalogo.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectorFiltro('planchado')}
                    className={`px-2.5 py-1 rounded font-medium ${
                      sectorFiltro === 'planchado' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Planchado
                  </button>
                  <button
                    type="button"
                    onClick={() => setSectorFiltro('secadora')}
                    className={`px-2.5 py-1 rounded font-medium ${
                      sectorFiltro === 'secadora' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Secadoras
                  </button>
                </div>

                <div className="relative flex-1 max-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                  <input
                    type="text"
                    value={filtroPrenda}
                    onChange={(e) => setFiltroPrenda(e.target.value)}
                    placeholder="Buscar prenda..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Lista idéntica a la Carga Manual con Cantidades Precargadas */}
              <div className="space-y-1.5">
                {itemsFiltrados.map((it) => {
                  const cant = cantidades[it.id] || 0;
                  const itemLeidoPorGemini = (borradorActual.items || []).find((bItem) => bItem.item_id === it.id);

                  return (
                    <div
                      key={it.id}
                      className={`flex items-center justify-between p-2 rounded-xl border transition ${
                        cant > 0
                          ? 'bg-slate-900 border-cyan-500/80 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold truncate ${cant > 0 ? 'text-white' : 'text-slate-300'}`}>
                            {it.nombre}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {it.sector}
                          </span>
                          {itemLeidoPorGemini && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1 font-bold">
                              <Sparkles className="w-2.5 h-2.5" />
                              IA: {itemLeidoPorGemini.cantidad}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Controles de cantidad táctil (+ / - / +10 / direct) */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => ajustarCantidad(it.id, -1)}
                          disabled={borradorActual.estado === 'confirmado' || cant === 0}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 font-black text-xs flex items-center justify-center active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min={0}
                          value={cant === 0 ? '' : cant}
                          placeholder="0"
                          onChange={(e) => setCantidadDirecta(it.id, e.target.value)}
                          disabled={borradorActual.estado === 'confirmado'}
                          className={`w-14 text-center py-1 rounded-lg border text-xs font-black font-mono focus:outline-none transition ${
                            cant > 0
                              ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => ajustarCantidad(it.id, 1)}
                          disabled={borradorActual.estado === 'confirmado'}
                          className="w-7 h-7 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-black text-xs border border-cyan-800 flex items-center justify-center active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => ajustarCantidad(it.id, 10)}
                          disabled={borradorActual.estado === 'confirmado'}
                          className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700"
                          title="+10"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barra de Totales y Confirmación Fija */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2 items-center justify-between sticky bottom-0 bg-slate-900/95 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-extrabold text-slate-400">Total Leído:</span>
                  <span className="text-base font-black text-cyan-300 px-3 py-0.5 rounded-lg bg-slate-950 border border-slate-800 font-mono">
                    {totalPrendas.toLocaleString()} u.
                  </span>
                </div>

                {borradorActual.estado === 'confirmado' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/70 border border-emerald-800 rounded-lg">
                      <Check className="w-4 h-4 text-emerald-400" />
                      Remito Confirmado en Sistema
                    </span>
                    {onCerrar && (
                      <button
                        type="button"
                        onClick={onCerrar}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-1.5 transition active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Ver en Historial
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDescartarBorradorActual}
                      className="px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                    >
                      Descartar
                    </button>

                    <button
                      type="button"
                      onClick={handleGuardarCambiosBorrador}
                      disabled={savingEdit}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      {savingEdit ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Guardar
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmarBorradorActual}
                      disabled={confirmingSingle || totalPrendas === 0 || editHotelId <= 0}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950 flex items-center gap-1.5 transition disabled:opacity-40 active:scale-95"
                    >
                      {confirmingSingle ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Confirmar Remito
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
