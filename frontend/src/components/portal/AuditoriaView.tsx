import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Hotel, AuditoriaItem, Envio } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  ClipboardCheck,
  Search,
  QrCode,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Clock,
  HelpCircle,
  Filter,
  X,
  Edit3,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const AuditoriaView: React.FC = () => {
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [hotelFiltro, setHotelFiltro] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Escáner / Búsqueda QR
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [scannedEnvio, setScannedEnvio] = useState<Envio | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Modal para cargar conteo de salida (Limpias, Relavados, Rotas)
  const [selectedItemForConteo, setSelectedItemForConteo] = useState<AuditoriaItem | null>(null);
  const [limpiasInput, setLimpiasInput] = useState<number>(0);
  const [relavadoInput, setRelavadoInput] = useState<number>(0);
  const [rotasInput, setRotasInput] = useState<number>(0);
  const [savingConteo, setSavingConteo] = useState(false);

  useEffect(() => {
    cargarHoteles();
  }, []);

  useEffect(() => {
    cargarAuditoria();
  }, [fechaFiltro, hotelFiltro]);

  const cargarHoteles = async () => {
    try {
      const data = await api.getHoteles();
      setHoteles(data);
    } catch (err) {
      console.error('Error cargando hoteles:', err);
    }
  };

  const cargarAuditoria = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditoria({
        fecha: fechaFiltro || undefined,
        hotel_id: hotelFiltro ? parseInt(hotelFiltro, 10) : undefined,
      });
      setItems(data);
    } catch (err) {
      console.error('Error cargando auditoria:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscarQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrCodeInput.trim()) return;

    setScanning(true);
    setScanError(null);
    try {
      const envio = await api.getEnvioByQR(qrCodeInput.trim());
      setScannedEnvio(envio);
      setQrCodeInput('');
    } catch (err: any) {
      setScanError(err.message || 'No se encontró ningún remito con ese código QR.');
      setScannedEnvio(null);
    } finally {
      setScanning(false);
    }
  };

  const openConteoModal = (item: AuditoriaItem) => {
    setSelectedItemForConteo(item);
    setLimpiasInput(item.cantidad_limpia || 0);
    setRelavadoInput(item.cantidad_relavado || 0);
    setRotasInput(item.cantidad_rota || 0);
  };

  const handleSaveConteo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForConteo) return;

    setSavingConteo(true);
    try {
      await api.registrarConteo({
        fecha: selectedItemForConteo.fecha,
        hotel_id: selectedItemForConteo.hotel_id,
        item_id: selectedItemForConteo.item_id,
        cantidad_limpia: limpiasInput,
        cantidad_relavado: relavadoInput,
        cantidad_rota: rotasInput,
      });
      setSelectedItemForConteo(null);
      await cargarAuditoria();
    } catch (err: any) {
      alert(err.message || 'Error guardando conteo');
    } finally {
      setSavingConteo(false);
    }
  };

  // Resumen
  const totalOK = items.filter((i) => i.estado === 'OK').length;
  const totalFaltantes = items.filter((i) => i.estado === 'FALTANTE').length;
  const totalSobrantes = items.filter((i) => i.estado === 'SOBRANTE').length;
  const totalPendientes = items.filter((i) => i.estado === 'PENDIENTE_LAVADERO').length;

  const totalCalculado = limpiasInput + relavadoInput + rotasInput;
  const difCalculada = selectedItemForConteo
    ? totalCalculado - selectedItemForConteo.cantidad_declarada
    : 0;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Auditoría, Cruce y Control de Prendas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Conteo de salida en tiempo real: prendas limpias, separadas para relavar y roturas.
          </p>
        </div>

        {/* Lector de QR para el Operario */}
        <form onSubmit={handleBuscarQR} className="flex items-center gap-2 max-w-md w-full md:w-auto">
          <div className="relative flex-1">
            <QrCode className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Escanear / Código QR (ENV-...)"
              value={qrCodeInput}
              onChange={(e) => setQrCodeInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={scanning}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Search className="w-4 h-4" />
            Consultar
          </button>
        </form>
      </div>

      {/* MENSAJE DE ERROR QR */}
      {scanError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 flex-shrink-0" />
            <span>{scanError}</span>
          </div>
          <button onClick={() => setScanError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MODAL DETALLES REMITO ESCANEADO */}
      {scannedEnvio && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-md flex flex-col md:flex-row items-start justify-between gap-4 animate-fade-in">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-600 text-white font-bold px-2 py-0.5 rounded">
                REMITO VERIFICADO
              </span>
              <span className="font-mono text-xs font-bold text-blue-900">{scannedEnvio.codigo_qr}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              Hotel: {scannedEnvio.hotel?.nombre || `Hotel #${scannedEnvio.hotel_id}`}
            </h3>
            <p className="text-xs text-slate-500">
              Fecha de envío: {new Date(scannedEnvio.fecha).toLocaleDateString('es-AR')}
            </p>

            <div className="pt-2">
              <p className="text-xs font-semibold uppercase text-slate-600 tracking-wider mb-1.5">
                Prendas declaradas por el hotel para procesar:
              </p>
              <div className="flex flex-wrap gap-2">
                {scannedEnvio.detalles && scannedEnvio.detalles.length > 0 ? (
                  scannedEnvio.detalles.map((d) => (
                    <div
                      key={d.id}
                      className="bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm text-sm"
                    >
                      <span className="font-medium text-slate-700">{d.item?.nombre}: </span>
                      <span className="font-bold text-blue-700">{d.cantidad_declarada} unidades</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">Sin prendas especificadas</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setScannedEnvio(null)}
            className="text-slate-400 hover:text-slate-600 self-start p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* MODAL REGISTRAR CONTEO DE SALIDA (LIMPIAS / RELAVADO / ROTAS) */}
      {selectedItemForConteo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedItemForConteo(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-slate-100 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                Registro de Salida y Empaquetado
              </span>
              <h3 className="text-lg font-bold text-slate-800 mt-1">
                {selectedItemForConteo.item_nombre} — {selectedItemForConteo.hotel_nombre}
              </h3>
              <p className="text-xs text-slate-500">
                Fecha del lote: {selectedItemForConteo.fecha} | Declarado por el hotel:{' '}
                <span className="font-bold text-slate-800">
                  {selectedItemForConteo.cantidad_declarada} prendas
                </span>
              </p>
            </div>

            <form onSubmit={handleSaveConteo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                  1. Prendas Limpias (Devueltas OK)
                </label>
                <input
                  type="number"
                  min="0"
                  value={limpiasInput}
                  onChange={(e) => setLimpiasInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Ropa limpia doblada para entregar al hotel.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-amber-700 mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  2. Prendas para Relavado (Quedan en Lavadero)
                </label>
                <input
                  type="number"
                  min="0"
                  value={relavadoInput}
                  onChange={(e) => setRelavadoInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-amber-50/50 border border-amber-200 rounded-lg text-sm font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[11px] text-amber-600 mt-0.5">
                  Prendas manchadas que quedan en el lavadero para un segundo ciclo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-red-700 mb-1">
                  3. Prendas Rotas / Dadas de Baja
                </label>
                <input
                  type="number"
                  min="0"
                  value={rotasInput}
                  onChange={(e) => setRotasInput(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-red-50/50 border border-red-200 rounded-lg text-sm font-bold text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <p className="text-[11px] text-red-600 mt-0.5">Ropa que se descarta o se separa por rotura.</p>
              </div>

              {/* Resumen del conteo */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Contado (Limpias + Relavado + Rotas):</span>
                  <span className="font-bold text-sm text-slate-800">{totalCalculado}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Diferencia vs lo que mandó el Hotel:</span>
                  <span
                    className={`font-bold text-sm ${
                      difCalculada === 0
                        ? 'text-emerald-600'
                        : difCalculada < 0
                        ? 'text-red-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {difCalculada > 0 ? `+${difCalculada}` : difCalculada}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItemForConteo(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingConteo}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {savingConteo ? 'Guardando...' : 'Guardar y Actualizar Auditoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Coincidencias</span>
            <CheckCircle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalOK}</p>
          <p className="text-xs text-slate-400">Total contabilizado exacto</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-red-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Faltantes</span>
            <AlertOctagon className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-red-600">{totalFaltantes}</p>
          <p className="text-xs text-slate-400">Prendas sin justificar</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Sobrantes</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-amber-600">{totalSobrantes}</p>
          <p className="text-xs text-slate-400">Contadas de más</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Pendientes</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold text-blue-600">{totalPendientes}</p>
          <p className="text-xs text-slate-400">En proceso de lavado</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-slate-400" />
          Filtros:
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Fecha:</span>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {fechaFiltro && (
            <button
              onClick={() => setFechaFiltro('')}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Ver todas
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Hotel:</span>
          <select
            value={hotelFiltro}
            onChange={(e) => setHotelFiltro(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los hoteles</option>
            {hoteles.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={cargarAuditoria}
          className="ml-auto px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          Refrescar datos
        </button>
      </div>

      {/* TABLA PRINCIPAL DE CRUCE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Hotel</th>
                <th className="px-4 py-3">Prenda</th>
                <th className="px-3 py-3 text-right">Declarado</th>
                <th className="px-3 py-3 text-right text-emerald-700">Limpias (OK)</th>
                <th className="px-3 py-3 text-right text-amber-700">En Relavado</th>
                <th className="px-3 py-3 text-right text-red-700">Rotas</th>
                <th className="px-3 py-3 text-right font-bold text-slate-900">Total Contado</th>
                <th className="px-3 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    Calculando auditoría y diferencias en tiempo real...
                  </td>
                </tr>
              ) : items.length > 0 ? (
                items.map((row, idx) => (
                  <tr key={`${row.fecha}-${row.hotel_id}-${row.item_id}-${idx}`} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-700">{row.fecha}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.hotel_nombre}</td>
                    <td className="px-4 py-3 text-slate-700">{row.item_nombre}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">
                      {formatNumber(row.cantidad_declarada)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                      {formatNumber(row.cantidad_limpia)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-700">
                      {row.cantidad_relavado > 0 ? (
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-xs">
                          {row.cantidad_relavado}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-red-700">
                      {row.cantidad_rota > 0 ? (
                        <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs">
                          {row.cantidad_rota}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900">
                      {formatNumber(row.total_contado)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold">
                      {row.diferencia > 0 ? (
                        <span className="text-amber-600">+{row.diferencia}</span>
                      ) : row.diferencia < 0 ? (
                        <span className="text-red-600">{row.diferencia}</span>
                      ) : (
                        <span className="text-emerald-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.estado === 'OK' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Coincide (OK)
                        </span>
                      )}
                      {row.estado === 'FALTANTE' && (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                          <AlertOctagon className="w-3 h-3" />
                          Faltante ({row.diferencia})
                        </span>
                      )}
                      {row.estado === 'SOBRANTE' && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          Sobrante (+{row.diferencia})
                        </span>
                      )}
                      {row.estado === 'PENDIENTE_LAVADERO' && (
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          Pendiente
                        </span>
                      )}
                      {row.estado === 'SIN_REMITO' && (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          <HelpCircle className="w-3 h-3" />
                          Sin Remito
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openConteoModal(row)}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded inline-flex items-center gap-1 transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        Cargar Conteo
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    No se encontraron registros de auditoría para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
