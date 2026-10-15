import React from 'react';
import { Printer, Download, X } from 'lucide-react';
import { ItemConsumoDetalle } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/formatters';

interface LiquidacionPrintableProps {
  hotelId: number;
  hotelNombre: string;
  fechaDesde: string;
  fechaHasta: string;
  items: ItemConsumoDetalle[];
  facturacionTotal: number;
  onExportCSV?: () => void;
  onClose?: () => void;
}

export const LiquidacionPrintable: React.FC<LiquidacionPrintableProps> = ({
  hotelNombre,
  fechaDesde,
  fechaHasta,
  items,
  facturacionTotal,
  onExportCSV,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  const totalPrendasFacturables = items.reduce((acc, i) => acc + i.cantidad_facturable, 0);
  const totalRelavados = items.reduce((acc, i) => acc + i.cantidad_relavado, 0);
  const totalRoturas = items.reduce((acc, i) => acc + i.cantidad_rota, 0);

  // Estimación de IVA (21%) y Total Bruto
  const subtotalNeto = facturacionTotal;
  const iva = subtotalNeto * 0.21;
  const totalConIva = subtotalNeto + iva;

  return (
    <div className="space-y-4">
      {/* Botonera de control (oculta al imprimir) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="text-xs text-slate-300">
          Vista previa del <span className="font-semibold text-brand-400">Resumen Oficial de Facturación</span> listo para imprimir o enviar.
        </div>
        <div className="flex items-center gap-2">
          {onExportCSV && (
            <button
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Exportar CSV</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-600/30"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Imprimir / Guardar PDF</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Documento Formal Imprimible */}
      <div className="printable-area bg-white text-slate-900 p-6 sm:p-10 rounded-2xl shadow-xl border border-slate-200 font-sans">
        {/* Encabezado Membretado */}
        <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-wrap justify-between items-start gap-4">
          <div className="flex items-center gap-3.5">
            <img src="/logo-triton.jpg" alt="Tritón" className="w-14 h-14 rounded-xl object-contain border border-slate-300 shadow-sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight text-slate-900 uppercase">TRITÓN</span>
                <span className="text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">SRL</span>
              </div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mt-0.5">
                Lavadero Industrial
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                CUIT: 30-71489231-4 &bull; IVA Responsable Inscripto &bull; Planta Central Nave 4
              </p>
              <p className="text-[11px] text-slate-500">
                Tel: (0351) 456-7890 &bull; contacto@tritonlavadero.com.ar
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block bg-slate-100 border border-slate-300 rounded-lg px-4 py-2 text-right">
              <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Documento</span>
              <span className="text-base font-extrabold text-slate-900">LIQUIDACIÓN DE SERVICIOS</span>
              <span className="text-xs text-slate-600 block font-mono mt-0.5">
                Emisión: {new Date().toLocaleDateString('es-AR')}
              </span>
            </div>
          </div>
        </div>

        {/* Datos del Cliente y Período */}
        <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-xs">
          <div>
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Cliente / Establecimiento:</span>
            <span className="text-sm font-black text-slate-900">{hotelNombre}</span>
            <span className="text-slate-600 block mt-0.5">Cuenta Corriente B2B Habilitada</span>
          </div>
          <div className="text-right">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">Período de Liquidación:</span>
            <span className="text-xs font-bold text-slate-900">{fechaDesde} al {fechaHasta}</span>
            <span className="text-slate-600 block mt-0.5">Modalidad: Procesamiento por Unidad</span>
          </div>
        </div>

        {/* Tabla Detallada de Prendas */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-left text-xs border border-slate-300">
            <thead className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Prenda / Tipo de Ropa</th>
                <th className="py-2.5 px-3 text-right">Cant. Limpias Facturable</th>
                <th className="py-2.5 px-3 text-right">Precio Unit. ($)</th>
                <th className="py-2.5 px-3 text-right">Relavados (s/cargo)</th>
                <th className="py-2.5 px-3 text-right">Roturas / Bajas</th>
                <th className="py-2.5 px-3 text-right">Subtotal ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No se registraron movimientos en el período seleccionado.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.item_id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {item.item_nombre}
                      {!item.se_factura && <span className="ml-1 text-[10px] text-amber-600 font-bold">(Exento)</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">
                      {formatNumber(item.cantidad_facturable)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700">
                      {item.precio_unitario != null ? formatCurrency(item.precio_unitario) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-600 font-medium">
                      {item.cantidad_relavado > 0 ? formatNumber(item.cantidad_relavado) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right text-rose-600 font-medium">
                      {item.cantidad_rota > 0 ? formatNumber(item.cantidad_rota) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-black text-slate-900">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <tr>
                  <td className="py-2.5 px-3 uppercase text-[11px] text-slate-700">Totales Procesados</td>
                  <td className="py-2.5 px-3 text-right text-slate-900 font-extrabold">{formatNumber(totalPrendasFacturables)}</td>
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-3 text-right text-amber-700">{formatNumber(totalRelavados)}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700">{formatNumber(totalRoturas)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-900 font-extrabold">{formatCurrency(subtotalNeto)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Resumen Económico al pie */}
        <div className="flex flex-wrap justify-between items-start gap-6 border-t border-slate-200 pt-5">
          <div className="max-w-md text-[11px] text-slate-600 space-y-1">
            <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Términos y Condiciones:</p>
            <p>&bull; Las prendas de relavado fueron procesadas sin costo adicional bajo la garantía de calidad TRITÓN.</p>
            <p>&bull; Las roturas corresponden a desgaste natural verificado o prendas dadas de baja en auditoría de planta.</p>
            <p>&bull; Plazo de pago: 15 días fecha de emisión según convenio de cuenta corriente.</p>
          </div>

          <div className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Neto:</span>
              <span className="font-bold text-slate-900">{formatCurrency(subtotalNeto)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>IVA (21% estimado):</span>
              <span className="font-bold text-slate-900">{formatCurrency(iva)}</span>
            </div>
            <div className="border-t border-slate-300 pt-2 mt-1 flex justify-between text-sm font-black text-slate-900">
              <span>TOTAL A COBRAR:</span>
              <span className="text-brand-600">{formatCurrency(totalConIva)}</span>
            </div>
          </div>
        </div>

        {/* Bloque de Firmas para Conformidad */}
        <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-44 mx-auto mb-2"></div>
            <span className="font-bold text-slate-800 block">TRITÓN Lavadero Industrial SRL</span>
            <span className="text-[10px] text-slate-500">Administración y Facturación</span>
          </div>
          <div>
            <div className="border-b border-slate-400 w-44 mx-auto mb-2"></div>
            <span className="font-bold text-slate-800 block">{hotelNombre}</span>
            <span className="text-[10px] text-slate-500">Conforme Recepción / Gerencia</span>
          </div>
        </div>
      </div>
    </div>
  );
};
