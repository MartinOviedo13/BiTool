import React, { useEffect, useState, useMemo } from 'react';
import {
  FileUp,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Database,
  Building,
  Shirt,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client';
import { Hotel, Item, ImportRecordPreview } from '../../types';
import { formatDateDisplay } from '../../utils/date';
import { formatNumber } from '../../utils/formatters';

export const ImportView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRecordPreview[]>([]);
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [processingIA, setProcessingIA] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const loadCatalogs = async () => {
      try {
        const [hotelesData, itemsData] = await Promise.all([api.getHoteles(), api.getItems()]);
        setHoteles(hotelesData.filter((h) => h.activo));
        setItems(itemsData);
      } catch (err) {
        console.error('Error cargando catalogos:', err);
      }
    };
    loadCatalogs();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatusMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await api.importPreview(file);
      setPreviewRows(res.registros);
      setStatusMessage({
        type: 'success',
        text: `Previsualizacion cargada. Se leyeron ${res.resumen.total_filas} registros. Reconcilia los pendientes antes de importar.`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al procesar el archivo.' });
    } finally {
      setLoading(false);
    }
  };

  const handleExtractIA = async () => {
    if (!file) return;
    setProcessingIA(true);
    setStatusMessage(null);
    try {
      const res = await api.importExtractIA(file);
      setPreviewRows(res.registros);
      setStatusMessage({
        type: 'success',
        text: `Extraccion con IA completada. Se detectaron ${res.resumen.total_filas} registros. Revisa y confirma antes de importar.`,
      });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al extraer con la IA.' });
    } finally {
      setProcessingIA(false);
    }
  };

  const handleHotelChange = (idx: number, hotelIdStr: string) => {
    const hId = hotelIdStr === '' ? null : parseInt(hotelIdStr, 10);
    setPreviewRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], hotel_id: hId, mapeado: hId !== null && copy[idx].item_id !== null };
      return copy;
    });
  };

  const handleItemChange = (idx: number, itemIdStr: string) => {
    const iId = itemIdStr === '' ? null : parseInt(itemIdStr, 10);
    setPreviewRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], item_id: iId, mapeado: copy[idx].hotel_id !== null && iId !== null };
      return copy;
    });
  };

  const handleCommit = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const commitItems = previewRows
        .filter((r) => r.hotel_id !== null && r.item_id !== null && r.cantidad > 0)
        .map((r) => ({ fecha: r.fecha, hotel_id: r.hotel_id!, item_id: r.item_id!, cantidad: r.cantidad }));

      if (commitItems.length === 0) {
        setStatusMessage({ type: 'error', text: 'No hay registros validos mapeados para guardar.' });
        setSaving(false);
        return;
      }

      const res = await api.createRegistrosBatch(commitItems);
      setStatusMessage({ type: 'success', text: `Importacion completada. Se guardaron ${res.count} registros.` });
      setPreviewRows([]);
      setFile(null);
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al persistir los registros.' });
    } finally {
      setSaving(false);
    }
  };

  const resumen = useMemo(() => {
    const total = previewRows.length;
    const mapeados = previewRows.filter((r) => r.mapeado).length;
    return { total, mapeados, pendientes: total - mapeados };
  }, [previewRows]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-6 w-6 text-brand-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">Importacion desde Excel o CSV</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Subi tu planilla operativa: Excel (.xlsx), CSV, PDF o una <strong className="text-slate-200">foto de la planilla de papel</strong> (.jpg/.png).
          El sistema detecta las columnas de fecha, hotel, prenda y cantidad con el importador clasico, o extrae los datos con IA desde imagenes y archivos.
          Despues de extraer, podras corregir diferencias con el catalogo oficial antes de guardar.
        </p>

        {previewRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-8 bg-slate-950/40">
            <FileUp className="h-10 w-10 text-slate-500 mb-3" />
            <span className="text-xs font-semibold text-slate-300 mb-2">Selecciona tu archivo operativo</span>
            <span className="text-[10px] text-slate-500 mb-4">Formatos: .xlsx, .csv, .pdf y fotos (.jpg/.png)</span>
            <div className="flex items-center gap-3">
              <input type="file" accept=".xlsx,.csv,.pdf,image/*" onChange={handleFileChange} className="hidden" id="file-upload-input" />
              <label htmlFor="file-upload-input" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors">
                Buscar Archivo
              </label>
              {file && (
                <>
                  <button onClick={handleUpload} disabled={loading || processingIA} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{loading ? 'Procesando...' : 'Procesar (Clasico)'}</span>
                  </button>
                  <button onClick={handleExtractIA} disabled={loading || processingIA} className="px-4 py-2 bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-brand-600/20">
                    <Sparkles className={`h-3.5 w-3.5 ${processingIA ? 'animate-pulse' : ''}`} />
                    <span>{processingIA ? 'Extrayendo con IA...' : 'Extraer con IA'}</span>
                  </button>
                </>
              )}
            </div>
            {file && <span className="text-xs font-bold text-brand-400 mt-4">Archivo: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => { setPreviewRows([]); setFile(null); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors">
              Cargar otro archivo
            </button>
            <button onClick={handleCommit} disabled={saving} className="px-5 py-2 bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
              <span>{saving ? 'Importando...' : 'Confirmar e Importar a DB'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl text-xs font-medium border flex items-center gap-2.5 ${statusMessage.type === 'success' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'}`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {previewRows.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Filas Detectadas</span>
              <div className="text-2xl font-black text-white mt-1">{formatNumber(resumen.total)}</div>
            </div>
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Mapeadas OK</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">{formatNumber(resumen.mapeados)}</div>
            </div>
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Pendientes</span>
              <div className="text-2xl font-black text-amber-400 mt-1">{formatNumber(resumen.pendientes)}</div>
            </div>
          </div>

          {resumen.pendientes > 0 && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl text-xs text-amber-300 flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
              <span><strong>Atencion:</strong> Hay nombres que no coinciden exactamente con el catalogo. Selecciona el correcto del desplegable antes de importar.</span>
            </div>
          )}

          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950 sticky top-0 z-20">
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Hotel Leido</th>
                    <th className="px-4 py-3 min-w-[200px]">Hotel Catalogo</th>
                    <th className="px-4 py-3">Prenda Leida</th>
                    <th className="px-4 py-3 min-w-[200px]">Prenda Catalogo</th>
                    <th className="px-4 py-3 text-right">Cant.</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className={`hover:bg-slate-800/40 transition-colors ${!row.mapeado ? 'bg-amber-950/10' : ''}`}>
                      <td className="px-4 py-2 font-mono text-slate-400">{formatDateDisplay(row.fecha)}</td>
                      <td className="px-4 py-2 font-bold text-slate-300">{row.hotel_nombre_leido}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <select value={row.hotel_id ?? ''} onChange={(e) => handleHotelChange(idx, e.target.value)} className={`w-full bg-slate-950 border rounded-lg px-2 py-1 text-xs text-white focus:outline-none ${row.hotel_id === null ? 'border-amber-700' : 'border-slate-800'}`}>
                            <option value="">-- Seleccionar Hotel --</option>
                            {hoteles.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-bold text-slate-300">{row.item_nombre_leido}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <Shirt className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <select value={row.item_id ?? ''} onChange={(e) => handleItemChange(idx, e.target.value)} className={`w-full bg-slate-950 border rounded-lg px-2 py-1 text-xs text-white focus:outline-none ${row.item_id === null ? 'border-amber-700' : 'border-slate-800'}`}>
                            <option value="">-- Seleccionar Prenda --</option>
                            {items.map((i) => <option key={i.id} value={i.id}>{i.nombre}{!i.se_factura ? ' (relav)' : ''}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-extrabold text-slate-200">{formatNumber(row.cantidad)}</td>
                      <td className="px-4 py-2 text-center">
                        {row.mapeado
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">Mapeado</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">Reconciliar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};