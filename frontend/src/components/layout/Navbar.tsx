import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Table2,
  Upload,
  Settings2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  ClipboardCheck,
  Building2,
  Truck,
  Menu,
  X,
  Bell,
  AlertTriangle,
  Check,
  Eye,
  Sun,
  Moon,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { NotificacionOperativa } from '../../types';
import { formatNumber } from '../../utils/formatters';

export type TabId = 'dashboard' | 'matrix' | 'import' | 'catalog' | 'ai' | 'auditoria' | 'portal' | 'entregas';

interface NavbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const ADMIN_TABS = [
  { id: 'dashboard' as TabId, label: 'Dashboard BI', icon: LayoutDashboard },
  { id: 'matrix' as TabId, label: 'Carga Diaria', icon: Table2 },
  { id: 'auditoria' as TabId, label: 'Auditoría', icon: ClipboardCheck },
  { id: 'entregas' as TabId, label: 'Entregas', icon: Truck },
  { id: 'import' as TabId, label: 'Importar', icon: Upload },
  { id: 'catalog' as TabId, label: 'Catálogos', icon: Settings2 },
  { id: 'ai' as TabId, label: 'Asistente IA', icon: Sparkles },
];

const OPERARIO_TABS = [
  { id: 'matrix' as TabId, label: 'Carga Diaria', icon: Table2 },
  { id: 'auditoria' as TabId, label: 'Auditoría', icon: ClipboardCheck },
];

const REPARTIDOR_TABS = [
  { id: 'entregas' as TabId, label: 'Hoja de Entregas', icon: Truck },
  { id: 'auditoria' as TabId, label: 'Auditoría', icon: ClipboardCheck },
];

const CLIENTE_TABS = [
  { id: 'portal' as TabId, label: 'Portal Hotel', icon: Building2 },
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Centro de Notificaciones Operativas (Admin / Repartidor / Operario)
  const [notificaciones, setNotificaciones] = useState<NotificacionOperativa[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [expandedNotifId, setExpandedNotifId] = useState<number | null>(null);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const canReceiveNotifs =
    user?.rol === 'admin' || user?.rol === 'repartidor' || user?.rol === 'operario';

  const fetchNotificaciones = useCallback(async () => {
    if (!canReceiveNotifs) return;
    try {
      const data = await api.getNotificaciones();
      setNotificaciones(Array.isArray(data) ? data : []);
    } catch {
      /* ignore transient notification errors */
    }
  }, [canReceiveNotifs]);

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

  // Consultar notificaciones al cambiar de vista y cada 30 segundos (o inmediatamente ante evento SSE)
  useEffect(() => {
    if (!canReceiveNotifs) return;
    void fetchNotificaciones();
    const interval = setInterval(() => {
      void fetchNotificaciones();
    }, 30000);

    const onRealtime = () => {
      void fetchNotificaciones();
    };
    window.addEventListener('triton:realtime', onRealtime);

    return () => {
      clearInterval(interval);
      window.removeEventListener('triton:realtime', onRealtime);
    };
  }, [canReceiveNotifs, activeTab, fetchNotificaciones]);

  const handleMarcarLeida = async (id: number) => {
    try {
      await api.marcarNotificacionLeida(id);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true, leida_en: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Error marcando notificación como leída:', err);
    }
  };

  const unreadCount = notificaciones.filter((n) => !n.leida).length;

  const navItems =
    user?.rol === 'admin'
      ? ADMIN_TABS
      : user?.rol === 'operario'
      ? OPERARIO_TABS
      : user?.rol === 'repartidor'
      ? REPARTIDOR_TABS
      : CLIENTE_TABS;

  return (
    <header className="sticky top-0 z-50 bg-triton-navy/95 backdrop-blur-md border-b border-triton-slate/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* Logo Oficial TRITÓN */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-triton-deep border border-triton-teal/40 p-0.5 flex items-center justify-center shadow-md shadow-black/40 shrink-0 overflow-hidden">
              <img src="/logo-triton.jpg" alt="Logo Tritón" className="h-full w-full object-contain rounded-lg" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm sm:text-lg tracking-tight text-white flex items-center gap-1 truncate">
                  TRITÓN <span className="text-triton-aqua text-[11px] sm:text-xs font-black px-1.5 py-0.2 bg-triton-deep border border-triton-teal/50 rounded">BI</span>
                </span>
                <span className="hidden sm:inline-block text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-triton-deep text-triton-aqua-light border border-triton-teal/40">
                  {user?.rol === 'cliente' ? 'B2B' : 'Industrial'}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-300 font-medium truncate">Lavadero Industrial</p>
            </div>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1 bg-triton-deep/60 p-1 rounded-xl border border-triton-slate/50">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-triton-aqua text-triton-navy font-bold shadow-md shadow-triton-aqua/25'
                      : 'text-slate-300 hover:text-white hover:bg-triton-deep/90'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-triton-navy' : 'text-slate-400'}`} />
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

          {/* Right side: notifications + status + user + logout */}
          <div className="flex items-center gap-1 sm:gap-2 relative shrink-0">
                        {/* Selector de Modo Claro / Modo Oscuro */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
              aria-label={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
              className="p-2 rounded-xl border border-triton-slate/50 bg-triton-deep text-slate-300 hover:text-white transition-all shadow-sm active:scale-95 shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-triton-teal" />
              )}
            </button>

{/* Campana de Notificaciones Operativas */}
            {canReceiveNotifs && (
              <div className="relative" ref={notifContainerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    void fetchNotificaciones();
                  }}
                  title="Centro de Notificaciones Operativas"
                  className={`relative p-2 rounded-xl border transition-all ${
                    unreadCount > 0
                      ? 'bg-triton-deep border-triton-aqua/60 text-triton-aqua hover:bg-triton-deep/90'
                      : 'bg-triton-deep border-triton-slate/50 text-slate-300 hover:text-white'
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    {/* Backdrop para mobile */}
                    <div
                      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
                      onClick={() => setNotifOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Ventana de notificaciones: centrada en mobile (fixed) y anclada a la derecha en desktop (sm:absolute) */}
                    <div className="fixed inset-x-3 top-16 mt-1 max-w-lg mx-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[420px] sm:max-w-none sm:mx-0 max-h-[80dvh] overflow-y-auto bg-triton-navy border border-triton-slate/60 rounded-2xl shadow-2xl z-50 divide-y divide-triton-slate/50 animate-fade-in">
                      <div className="p-3.5 bg-triton-deep flex items-center justify-between sticky top-0 z-10 border-b border-triton-slate/50">
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Notificaciones Operativas
                          </h4>
                          <p className="text-[10px] text-slate-300">
                            {unreadCount > 0
                              ? `${unreadCount} sin leer (${user?.rol})`
                              : 'Todas las notificaciones al día'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNotifOpen(false)}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {notificaciones.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No hay notificaciones operativas registradas.
                        </div>
                      ) : (
                        <div className="divide-y divide-triton-slate/40">
                          {notificaciones.map((n) => {
                            const isExpanded = expandedNotifId === n.id;
                            const hora = new Date(n.created_at).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            return (
                              <div
                                key={n.id}
                                className={`p-3.5 text-xs transition-colors ${
                                  !n.leida ? 'bg-triton-deep/40' : 'bg-transparent opacity-75'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-start gap-2">
                                    {n.severidad === 'warning' ? (
                                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    ) : n.severidad === 'success' ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    ) : (
                                      <Truck className="w-4 h-4 text-triton-aqua shrink-0 mt-0.5" />
                                    )}
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-white">{n.titulo}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          {hora} hs
                                        </span>
                                      </div>
                                      <p className="text-slate-300 mt-1 leading-relaxed">{n.mensaje}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 mt-2.5 flex-wrap">
                                  {n.muestra_datos && n.muestra_datos.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedNotifId(isExpanded ? null : n.id)
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-triton-deep hover:bg-triton-slate/50 text-triton-aqua border border-triton-teal/40 text-[10px] font-bold flex items-center gap-1"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>
                                        {isExpanded ? 'Ocultar Muestra' : 'Ver Muestra Procesada'}
                                      </span>
                                    </button>
                                  )}

                                  {!n.leida && (
                                    <button
                                      type="button"
                                      onClick={() => void handleMarcarLeida(n.id)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Marcar leída</span>
                                    </button>
                                  )}
                                </div>

                                {isExpanded && n.muestra_datos && n.muestra_datos.length > 0 && (
                                  <div className="mt-2.5 rounded-xl border border-triton-slate/50 bg-triton-deep/80 overflow-x-auto">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-triton-navy text-slate-400 uppercase text-[9px] border-b border-triton-slate/50">
                                        <tr>
                                          <th className="px-2.5 py-1.5">Ítem</th>
                                          <th className="px-2 py-1.5 text-right">Remito</th>
                                          <th className="px-2 py-1.5 text-right text-triton-aqua">Procesado</th>
                                          <th className="px-2.5 py-1.5 text-right">Dif.</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-triton-slate/40">
                                        {n.muestra_datos.map((m) => (
                                          <tr key={m.item_id}>
                                            <td className="px-2.5 py-1 font-semibold text-white">
                                              {m.item_nombre}
                                            </td>
                                            <td className="px-2 py-1 text-right text-slate-300">
                                              {formatNumber(m.cant_remito)}
                                            </td>
                                            <td className="px-2 py-1 text-right font-bold text-triton-aqua">
                                              {formatNumber(m.cant_procesada_prendas)}
                                            </td>
                                            <td className="px-2.5 py-1 text-right font-bold">
                                              {m.diferencia === 0 ? (
                                                <span className="text-emerald-400">0</span>
                                              ) : m.diferencia > 0 ? (
                                                <span className="text-amber-400">+{m.diferencia}</span>
                                              ) : (
                                                <span className="text-rose-400">{m.diferencia}</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Backend status (Oculto en pantallas chicas para no apiñar) */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                backendOnline === true
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : backendOnline === false
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-triton-deep border-triton-slate/50 text-slate-400'
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
              <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium border border-triton-slate/50 bg-triton-deep text-slate-200 max-w-[105px] sm:max-w-none truncate">
                <User className="h-3.5 w-3.5 text-triton-aqua shrink-0" />
                <span className="font-semibold text-white truncate text-[11px] sm:text-xs">
                  {user.hotel_nombre || user.username}
                </span>
                <span
                  className={`hidden sm:inline px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                    user.rol === 'admin'
                      ? 'bg-triton-navy text-triton-aqua border border-triton-teal/40'
                      : user.rol === 'cliente'
                      ? 'bg-triton-navy text-blue-300 border border-blue-800'
                      : 'bg-triton-deep text-slate-400'
                  }`}
                >
                  {user.rol}
                </span>
              </div>
            )}

            {/* Boton cerrar sesion */}
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 rounded-xl bg-triton-deep border border-triton-slate/50 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-400/50 transition-colors shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* Botón hamburguesa (En pantallas chicas cuando hay múltiples pestañas) */}
            {navItems.length > 1 && (
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="lg:hidden p-2 rounded-xl text-slate-200 hover:text-white bg-triton-deep border border-triton-slate/50"
                aria-label="Abrir menú de navegación"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Barra rápida táctil de pestañas en Mobile/Tablet (< lg) para acceso directo con 1 toque */}
        {navItems.length > 1 && (
          <nav
            aria-label="Navegación rápida móvil"
            className="lg:hidden flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar border-t border-triton-slate/40"
          >
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                    isActive
                      ? 'bg-triton-aqua text-triton-navy font-extrabold shadow-md shadow-triton-aqua/25'
                      : 'bg-triton-deep text-slate-200 border border-triton-slate/50 hover:text-white'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-triton-navy' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
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
        )}

        {/* Menu móvil desplegable en grilla */}
        {mobileMenuOpen && navItems.length > 1 && (
          <div className="lg:hidden py-3 border-t border-triton-slate/50 grid grid-cols-2 gap-2 animate-fade-in">
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
                    isActive ? 'bg-triton-aqua text-triton-navy font-bold shadow-md' : 'bg-triton-deep border border-triton-slate/50 text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
            {/* Alternador de tema en menú móvil */}
            <button
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              className="col-span-2 flex items-center justify-between p-2.5 rounded-xl text-xs font-bold bg-triton-deep border border-triton-slate/50 text-slate-200 hover:text-white"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-triton-teal" />}
                <span>Tema visual:</span>
              </div>
              <span className="text-[11px] font-black text-triton-aqua uppercase">
                {theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
