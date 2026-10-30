import React, { useState, useId } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
} from 'recharts';
import {
  Download,
  FileSpreadsheet,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  Table as TableIcon,
  Maximize2,
  Check,
  Printer,
} from 'lucide-react';
import { IAArtifact } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/formatters';

interface ArtifactRendererProps {
  artifact: IAArtifact;
  isExpanded?: boolean;
  onOpenCanvas?: (artifact: IAArtifact) => void;
}

const PIE_COLORS = ['#48c0b0', '#108080', '#007888', '#38bdf8', '#818cf8', '#f59e0b', '#ec4899', '#10b981'];

export const ArtifactRenderer: React.FC<ArtifactRendererProps> = ({
  artifact,
  isExpanded = false,
  onOpenCanvas,
}) => {
  const [activeTab, setActiveTab] = useState<'chart' | 'table'>('chart');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'heatmap'>(
    artifact.chart_type || 'bar'
  );
  const [selectedSheetIdx, setSelectedSheetIdx] = useState<number>(0);
  const [downloaded, setDownloaded] = useState<boolean>(false);

  const captionId = useId();

  const handleDownload = () => {
    if (!artifact.file_base64) return;
    try {
      const byteCharacters = atob(artifact.file_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type:
          artifact.mime_type ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.filename || 'reporte_triton.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (e) {
      console.error('Error al descargar archivo desde base64:', e);
    }
  };

  const renderKPIs = () => {
    if (!artifact.kpis || artifact.kpis.length === 0) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-2">
        {artifact.kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between"
          >
            <span className="text-[10px] text-slate-400 font-medium truncate">
              {kpi.label}
            </span>
            <span className="text-xs sm:text-sm font-bold text-triton-aqua mt-0.5 truncate">
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const currentSheet =
    artifact.sheets_preview && artifact.sheets_preview.length > 0
      ? artifact.sheets_preview[selectedSheetIdx] || artifact.sheets_preview[0]
      : null;

  const renderTablePreview = () => {
    if (!currentSheet) return null;

    return (
      <div className="space-y-2 mt-2">
        {artifact.sheets_preview && artifact.sheets_preview.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-2">
            {artifact.sheets_preview.map((sh, sIdx) => (
              <button
                key={sIdx}
                type="button"
                onClick={() => setSelectedSheetIdx(sIdx)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  selectedSheetIdx === sIdx
                    ? 'bg-triton-teal text-white shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {sh.name}
              </button>
            ))}
          </div>
        )}

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
          className="ai-table-wrapper max-h-[360px] rounded-xl border border-slate-800 bg-slate-950/70"
        >
          <table className="w-full text-left text-xs text-slate-300">
            <caption id={captionId} className="sr-only">
              {artifact.title} - {currentSheet.name}
            </caption>
            <thead className="bg-slate-900/95 text-[11px] font-bold text-slate-200 border-b border-slate-800">
              <tr>
                {currentSheet.headers.map((h, hIdx) => (
                  <th key={hIdx} scope="col" className="px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {currentSheet.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      className={`px-3 py-1.5 whitespace-nowrap ${
                        cIdx === 0 ? 'font-medium text-slate-100 font-sans' : ''
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderInteractiveChart = () => {
    if (!artifact.data || artifact.data.length === 0) return null;

    const xKey = artifact.x_key || 'name';
    const series = artifact.series || [
      { key: 'value', label: 'Valor', color: '#48c0b0', is_currency: false },
    ];
    const chartHeight = isExpanded ? 420 : 250;

    const customTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-slate-950/95 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
            <p className="font-bold text-slate-200 border-b border-slate-800 pb-1">
              {label}
            </p>
            {payload.map((entry: any, pIdx: number) => {
              const sInfo = series.find((s) => s.key === entry.dataKey);
              const val = entry.value;
              const formatted =
                sInfo?.is_currency
                  ? formatCurrency(val)
                  : typeof val === 'number'
                  ? formatNumber(val)
                  : val;
              return (
                <p key={pIdx} className="flex items-center gap-2 text-slate-300">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.name}:</span>
                  <span className="font-bold text-white font-mono">{formatted}</span>
                </p>
              );
            })}
          </div>
        );
      }
      return null;
    };

    return (
      <div
        className="mt-2 w-full min-w-0 overflow-hidden"
        style={{ height: chartHeight, minHeight: isExpanded ? 360 : 220 }}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          debounce={50}
          minWidth={100}
          minHeight={isExpanded ? 360 : 220}
        >
          {chartType === 'pie' ? (
            <PieChart>
              <Tooltip content={customTooltip} />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              />
              <Pie
                data={artifact.data}
                dataKey={series[0]?.key || 'value'}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={isExpanded ? 140 : 80}
                innerRadius={isExpanded ? 60 : 35}
                paddingAngle={3}
                label={({ name, percent }: any) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {artifact.data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : chartType === 'line' ? (
            <LineChart data={artifact.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {series.map((s, sIdx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color || PIE_COLORS[sIdx % PIE_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: s.color || PIE_COLORS[sIdx] }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={artifact.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                {series.map((s, sIdx) => (
                  <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color || PIE_COLORS[sIdx]} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={s.color || PIE_COLORS[sIdx]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {series.map((s, sIdx) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color || PIE_COLORS[sIdx % PIE_COLORS.length]}
                  fillOpacity={1}
                  fill={`url(#grad-${s.key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : chartType === 'scatter' ? (
            <ScatterChart margin={{ top: 15, right: 20, bottom: 15, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="prendas"
                name="Volumen (Prendas)"
                stroke="#64748b"
                fontSize={10}
                unit=" pzas"
              />
              <YAxis
                type="number"
                dataKey="margen_pct"
                name="Margen"
                stroke="#64748b"
                fontSize={10}
                unit="%"
                domain={[20, 80]}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                        <p className="font-bold text-white flex items-center gap-1.5">
                          <span>{d.hotel}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-triton-aqua font-mono">
                            {d.clasificacion}
                          </span>
                        </p>
                        <p className="text-slate-300">Volumen: <span className="font-mono text-white font-bold">{formatNumber(d.prendas)}</span> prendas</p>
                        <p className="text-slate-300">Margen Neto: <span className="font-mono text-emerald-400 font-bold">{d.margen_pct}%</span></p>
                        <p className="text-slate-300">Facturación: <span className="font-mono text-cyan-300 font-bold">{formatCurrency(d.facturacion)}</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Hoteles" data={artifact.data} fill="#48c0b0">
                {artifact.data?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || '#48c0b0'} />
                ))}
              </Scatter>
            </ScatterChart>
          ) : chartType === 'heatmap' ? (
            <div className="h-full flex flex-col justify-center gap-2 p-2 overflow-x-auto">
              <div className="grid grid-cols-7 gap-2 min-w-[500px]">
                {artifact.data?.map((d, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{d.dia}</span>
                    
                    <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-800/40 flex flex-col">
                      <span className="text-[9px] text-indigo-300 font-semibold">Calandra</span>
                      <span className="text-xs font-bold text-indigo-200 mt-0.5">{formatNumber(d.planchado)}</span>
                    </div>

                    <div className="p-2 rounded-lg bg-teal-950/60 border border-teal-800/40 flex flex-col">
                      <span className="text-[9px] text-teal-300 font-semibold">Secadora</span>
                      <span className="text-xs font-bold text-teal-200 mt-0.5">{formatNumber(d.secadora)}</span>
                    </div>

                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
                      Total: <span className="text-white font-bold">{formatNumber(d.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <BarChart data={artifact.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey={xKey} stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              {series.map((s, sIdx) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color || PIE_COLORS[sIdx % PIE_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  // ── Render para Archivos Descargables (Excel)
  if (artifact.type === 'excel') {
    const sizeKB = artifact.size_bytes ? Math.round(artifact.size_bytes / 1024) : null;

    return (
      <div className="mt-2.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-triton-teal/40 p-3.5 sm:p-4 text-xs shadow-lg w-full min-w-0 overflow-hidden">
        {/* Cabecera del archivo */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                {artifact.title}
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 font-mono">
                  .xlsx
                </span>
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {artifact.filename} {sizeKB ? `(${sizeKB} KB)` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenCanvas && !isExpanded && (
              <button
                type="button"
                onClick={() => onOpenCanvas(artifact)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Abrir en pantalla dividida Canvas"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Canvas</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all ${
                downloaded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-triton-aqua hover:bg-triton-aqua-hover text-triton-ink'
              }`}
            >
              {downloaded ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>¡Descargado!</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Descargar Excel</span>
                </>
              )}
            </button>
          </div>
        </div>

        {renderKPIs()}

        {/* Vista previa de las hojas del Excel */}
        {renderTablePreview()}
      </div>
    );
  }

  // ── Render para Gráficos Interactivos (Chart)
  return (
    <div className="mt-2.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-triton-teal/30 p-3.5 sm:p-4 text-xs shadow-lg w-full min-w-0 overflow-hidden">
      {/* Cabecera del Gráfico */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div>
          <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
            {artifact.title}
          </h4>
          {artifact.subtitle && (
            <p className="text-[10px] text-slate-400 mt-0.5">{artifact.subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Selector de Tipo de Gráfico */}
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('chart');
                setChartType('bar');
              }}
              className={`p-1 rounded text-[10px] ${
                activeTab === 'chart' && chartType === 'bar'
                  ? 'bg-triton-teal text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Barras"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chart');
                setChartType('line');
              }}
              className={`p-1 rounded text-[10px] ${
                activeTab === 'chart' && chartType === 'line'
                  ? 'bg-triton-teal text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Líneas"
            >
              <LineChartIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chart');
                setChartType('area');
              }}
              className={`p-1 rounded text-[10px] ${
                activeTab === 'chart' && chartType === 'area'
                  ? 'bg-triton-teal text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Área"
            >
              <AreaChartIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chart');
                setChartType('pie');
              }}
              className={`p-1 rounded text-[10px] ${
                activeTab === 'chart' && chartType === 'pie'
                  ? 'bg-triton-teal text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Torta"
            >
              <PieChartIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Toggle Gráfico / Tabla */}
          {artifact.sheets_preview && artifact.sheets_preview.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'chart' ? 'table' : 'chart')}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 border transition-colors ${
                activeTab === 'table'
                  ? 'bg-brand-600 text-white border-brand-500'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
              title="Alternar entre Gráfico y Tabla"
            >
              <TableIcon className="h-3 w-3" />
              <span>{activeTab === 'chart' ? 'Tabla' : 'Gráfico'}</span>
            </button>
          )}

          {/* Exportar / Imprimir Dossier Ejecutivo */}
          <button
            type="button"
            onClick={() => window.print()}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors"
            title="Imprimir o guardar como Dossier PDF"
          >
            <Printer className="h-3 w-3 text-cyan-400" />
            <span className="hidden sm:inline">Dossier PDF</span>
          </button>

          {/* Abrir en Canvas */}
          {onOpenCanvas && !isExpanded && (
            <button
              type="button"
              onClick={() => onOpenCanvas(artifact)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-colors"
              title="Abrir en pantalla dividida Canvas"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {renderKPIs()}

      {activeTab === 'chart' ? renderInteractiveChart() : renderTablePreview()}
    </div>
  );
};
