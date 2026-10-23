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
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
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
];

const CLIENTE_TABS = [
  { id: 'portal' as TabId, label: 'Portal Hotel', icon: Building2 },
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const { user, logout } = useAuth();
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
    <header className="sticky top-0 z-50 bg-[#0b1a33]/90 backdrop-blur-md border-b border-[#1e3659]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Oficial TRITÓN */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#071326] border border-[#1e3659] p-0.5 flex items-center justify-center shadow-md shadow-brand-900/30 shrink-0 overflow-hidden">
              <img src="/logo-triton.jpg" alt="Logo Tritón" className="h-full w-full object-contain rounded-lg" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base sm:text-lg tracking-tight text-white flex items-center gap-1">
                  TRITÓN <span className="text-brand-400 text-xs font-extrabold px-1 py-0.2 bg-brand-950/80 border border-brand-700/50 rounded">BI</span>
                </span>
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-brand-950 text-brand-300 border border-brand-800/60">
                  {user?.rol === 'cliente' ? 'B2B' : 'Industrial'}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">Lavadero Industrial</p>
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

          {/* Right side: notifications + status + user + logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 relative">
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
                      ? 'bg-brand-950/90 border-brand-500/60 text-brand-300 hover:bg-brand-900'
                      : 'bg-[#071326] border-[#1e3659] text-slate-400 hover:text-white'
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
                    <div className="fixed inset-x-3 top-16 mt-2 max-w-lg mx-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[420px] sm:max-w-none sm:mx-0 max-h-[80vh] overflow-y-auto bg-[#0b1a33] border border-[#1e3659] rounded-2xl shadow-2xl z-50 divide-y divide-[#1e3659] animate-fade-in">
                    <div className="p-3.5 bg-[#071326] flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Notificaciones Operativas
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {unreadCount > 0
                            ? `${unreadCount} sin leer (${user?.rol})`
                            : 'Todas las notificaciones al día'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="p-1 text-slate-400 hover:text-white rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {notificaciones.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No hay notificaciones operativas registradas.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#1e3659]/60">
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
                                !n.leida ? 'bg-brand-950/30' : 'bg-transparent opacity-75'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                  {n.severidad === 'warning' ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                  ) : n.severidad === 'success' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                  ) : (
                                    <Truck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
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

                              <div className="flex items-center justify-end gap-2 mt-2.5">
                                {n.muestra_datos && n.muestra_datos.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedNotifId(isExpanded ? null : n.id)
                                    }
                                    className="px-2 py-1 rounded-lg bg-[#071326] hover:bg-[#132747] text-cyan-300 border border-[#1e3659] text-[10px] font-bold flex items-center gap-1"
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
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Marcar leída</span>
                                  </button>
                                )}
                              </div>

                              {isExpanded && n.muestra_datos && n.muestra_datos.length > 0 && (
                                <div className="mt-2.5 rounded-xl border border-[#1e3659] bg-[#071326] overflow-x-auto">
                                  <table className="w-full text-left text-[11px]">
                                    <thead className="bg-[#0b1a33] text-slate-400 uppercase text-[9px] border-b border-[#1e3659]">
                                      <tr>
                                        <th className="px-2.5 py-1.5">Ítem</th>
                                        <th className="px-2 py-1.5 text-right">Remito</th>
                                        <th className="px-2 py-1.5 text-right text-cyan-400">Procesado</th>
                                        <th className="px-2.5 py-1.5 text-right">Dif.</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1e3659]/40">
                                      {n.muestra_datos.map((m) => (
                                        <tr key={m.item_id}>
                                          <td className="px-2.5 py-1 font-semibold text-white">
                                            {m.item_nombre}
                                          </td>
                                          <td className="px-2 py-1 text-right text-slate-300">
                                            {formatNumber(m.cant_remito)}
                                          </td>
                                          <td className="px-2 py-1 text-right font-bold text-cyan-300">
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
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[#1e3659] bg-[#071326] text-slate-300 max-w-[130px] sm:max-w-none truncate">
                <User className="h-3.5 w-3.5 text-brand-400 shrink-0" />
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

