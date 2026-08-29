import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Table2, Upload, Settings2, Sparkles, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';

interface NavbarProps {
  activeTab: 'dashboard' | 'matrix' | 'import' | 'catalog' | 'ai';
  onTabChange: (tab: 'dashboard' | 'matrix' | 'import' | 'catalog' | 'ai') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        await api.checkHealth();
        setBackendOnline(true);
      } catch {
        setBackendOnline(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard BI', icon: LayoutDashboard },
    { id: 'matrix', label: 'Carga Diaria', icon: Table2 },
    { id: 'import', label: 'Importar', icon: Upload },
    { id: 'catalog', label: 'Catálogos', icon: Settings2 },
    { id: 'ai', label: 'Asistente IA', icon: Sparkles },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-brand-300">
                  Poseidón BI
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-brand-950 text-brand-400 border border-brand-800/60">
                  Tesis
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Servicio de Lavandería SRL</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.label}
                  {item.id === 'ai' && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Backend Status Indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                backendOnline === true
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : backendOnline === false
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {backendOnline === true ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>API Online</span>
                </>
              ) : backendOnline === false ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  <span>API Offline</span>
                </>
              ) : (
                <span>Conectando...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
