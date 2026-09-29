import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Table2,
  Upload,
  Settings2,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  ClipboardCheck,
  Building2,
  Menu,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export type TabId = 'dashboard' | 'matrix' | 'import' | 'catalog' | 'ai' | 'auditoria' | 'portal';

interface NavbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const ADMIN_TABS = [
  { id: 'dashboard' as TabId, label: 'Dashboard BI', icon: LayoutDashboard },
  { id: 'matrix' as TabId, label: 'Carga Diaria', icon: Table2 },
  { id: 'auditoria' as TabId, label: 'Auditoría', icon: ClipboardCheck },
  { id: 'import' as TabId, label: 'Importar', icon: Upload },
  { id: 'catalog' as TabId, label: 'Catálogos', icon: Settings2 },
  { id: 'ai' as TabId, label: 'Asistente IA', icon: Sparkles },
];

const OPERARIO_TABS = [
  { id: 'matrix' as TabId, label: 'Carga Diaria', icon: Table2 },
  { id: 'auditoria' as TabId, label: 'Auditoría', icon: ClipboardCheck },
];

const CLIENTE_TABS = [
  { id: 'portal' as TabId, label: 'Portal Hotel', icon: Building2 },
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const { user, logout } = useAuth();
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const navItems =
    user?.rol === 'admin'
      ? ADMIN_TABS
      : user?.rol === 'operario'
      ? OPERARIO_TABS
      : CLIENTE_TABS;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-brand-300">
                  Poseidon BI
                </span>
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-brand-950 text-brand-400 border border-brand-800/60">
                  {user?.rol === 'cliente' ? 'B2B' : 'Tesis'}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">Servicio de Lavandería</p>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
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

          {/* Right side: status + user + logout */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Backend status (Oculto en pantallas muy chicas para no apiñar) */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
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
                  <span>Online</span>
                </>
              ) : backendOnline === false ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  <span>Offline</span>
                </>
              ) : (
                <span>...</span>
              )}
            </div>

            {/* Usuario logueado */}
            {user && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-800 bg-slate-900 text-slate-300 max-w-[130px] sm:max-w-none truncate">
                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-white truncate text-xs">
                  {user.hotel_nombre || user.username}
                </span>
                <span
                  className={`hidden sm:inline px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    user.rol === 'admin'
                      ? 'bg-brand-950 text-brand-400'
                      : user.rol === 'cliente'
                      ? 'bg-blue-950 text-blue-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {user.rol}
                </span>
              </div>
            )}

            {/* Boton cerrar sesion */}
            <button
              onClick={logout}
              title="Cerrar sesion"
              className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* Botón hamburguesa (Solo Admin / Operario en pantallas chicas) */}
            {user?.rol !== 'cliente' && (
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Menu móvil desplegable para Admin / Operario */}
        {mobileMenuOpen && user?.rol !== 'cliente' && (
          <div className="lg:hidden py-3 border-t border-slate-800 grid grid-cols-2 gap-2 animate-fade-in">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold ${
                    isActive ? 'bg-brand-600 text-white' : 'bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
};
