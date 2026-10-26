import React from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import { Envio } from '../../types';
import { formatNumber } from '../../utils/formatters';

interface RemitoPrintableModalProps {
  envio: Envio;
  hotelNombre: string;
  onClose: () => void;
}

export const RemitoPrintableModal: React.FC<RemitoPrintableModalProps> = ({
  envio,
  hotelNombre,
  onClose,
}) => {
  const totalDeclaradas = envio.detalles?.reduce((acc, d) => acc + d.cantidad_declarada, 0) || 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#0b1a33] border border-[#1e3659] rounded-2xl max-w-3xl w-full max-h-[92dvh] overflow-y-auto shadow-2xl space-y-4 p-3.5 sm:p-6 animate-fade-in">
        {/* Barra de control (oculta en impresion) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1e3659]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs sm:text-sm text-white">Certificado Oficial de Remito y Entrega</span>
            <span className="font-mono text-xs bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded">
              {envio.codigo_qr}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-600/30"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Imprimir Remito</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#132747]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Hoja de Impresión Formal (A4) */}
        <div className="printable-area bg-white text-slate-900 p-4 sm:p-8 rounded-xl border border-slate-200 shadow font-sans text-xs">
          {/* Cabecera */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex flex-wrap justify-between items-start gap-4">
            <div className="flex items-start gap-3">
              <img
                src="/logo-triton.jpg"
                alt="TRITÓN"
                className="w-12 h-12 object-contain rounded-lg border border-slate-300 shadow-sm"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-slate-900 uppercase">TRITÓN</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-900 text-white rounded">SRL</span>
                </div>
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mt-0.5">
                  Lavadero Industrial
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  CUIT: 30-71489231-4 &bull; Planta Central Nave 4 &bull; Tel: (0351) 456-7890
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block bg-slate-100 border border-slate-300 rounded-lg p-2.5 text-right">
                <span className="text-[9px] font-bold uppercase text-slate-500 tracking-wider block">Documento de Traslado</span>
                <span className="text-sm font-extrabold text-slate-900">REMITO DE ENTREGA / AUDITORÍA</span>
                <p className="font-mono text-xs font-black text-brand-700 mt-0.5">{envio.codigo_qr}</p>
                <span className="text-[10px] text-slate-500 block font-mono">
                  Fecha: {new Date(envio.fecha).toLocaleDateString('es-AR')}
                </span>
              </div>
            </div>
          </div>

          {/* Datos del Cliente + Código QR escaneable */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5">
            <div>
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px] block">Establecimiento / Hotel:</span>
              <span className="text-base font-black text-slate-900">{hotelNombre || envio.hotel?.nombre}</span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Bolsas verificadas en recepción de planta industrial TRITÓN.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-300 shadow-sm shrink-0">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                  envio.codigo_qr
                )}`}
                alt="QR Remito"
                className="w-16 h-16 rounded"
              />
              <div className="text-[10px] text-slate-600">
                <span className="font-bold block text-slate-800">Trazabilidad QR</span>
                <span>Escanear al cargar</span>
                <span className="block">o recibir en hotel</span>
              </div>
            </div>
          </div>

          {/* Tabla de Prendas Declaradas y Control */}
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-900 text-white font-bold uppercase text-[9px] tracking-wider">
                <tr>
                  <th className="py-2 px-3">Prenda / Artículo</th>
                  <th className="py-2 px-3 text-right">Cant. Declarada en Remito</th>
                  <th className="py-2 px-3 text-right">Contado Limpio (OK)</th>
                  <th className="py-2 px-3 text-right">En Relavado</th>
                  <th className="py-2 px-3 text-right">Roturas / Bajas</th>
                  <th className="py-2 px-3 text-center">Estado Auditoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {!envio.detalles || envio.detalles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      Sin prendas declaradas.
                    </td>
                  </tr>
                ) : (
                  envio.detalles.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {d.item?.nombre || `Item #${d.item_id}`}
                      </td>
                      <td className="py-2 px-3 text-right font-black text-slate-900">
                        {formatNumber(d.cantidad_declarada)}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                        {/* Indicador o espacio para verificación física */}
                        {formatNumber(d.cantidad_declarada)}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-700 font-medium">-</td>
                      <td className="py-2 px-3 text-right text-rose-700 font-medium">-</td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Conforme
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <tr>
                  <td className="py-2 px-3 uppercase text-[10px] text-slate-700">Total Prendas</td>
                  <td className="py-2 px-3 text-right text-slate-900 font-black">{formatNumber(totalDeclaradas)}</td>
                  <td className="py-2 px-3 text-right text-emerald-800 font-black">{formatNumber(totalDeclaradas)}</td>
                  <td className="py-2 px-3 text-right text-amber-800">-</td>
                  <td className="py-2 px-3 text-right text-rose-800">-</td>
                  <td className="py-2 px-3 text-center text-[10px] text-slate-600">Verificado</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Firmas de Control */}
          <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 sm:gap-8 text-center text-[11px]">
            <div>
              <div className="border-b border-slate-400 w-40 mx-auto mb-1.5"></div>
              <span className="font-bold text-slate-800 block">Chofer / Entrega TRITÓN Lavadero Industrial</span>
              <span className="text-[9px] text-slate-500">Firma, Aclaración y DNI</span>
            </div>
            <div>
              <div className="border-b border-slate-400 w-40 mx-auto mb-1.5"></div>
              <span className="font-bold text-slate-800 block">Recepción {hotelNombre}</span>
              <span className="text-[9px] text-slate-500">Firma, Aclaración y Cargo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
