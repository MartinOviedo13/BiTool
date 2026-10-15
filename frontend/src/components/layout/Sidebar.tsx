import React from 'react';
import {
  Home,
  Users,
  Shirt,
  RotateCcw,
  BarChart3,
  LogOut,
  Building2,
  Truck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export type SidebarTabId =
  | 'resumen'
  | 'clientes'
  | 'produccion'
  | 'relavados'
  | 'reportes'
  | 'portal'
  | 'entregas';

interface SidebarProps {
  activeTab: SidebarTabId;
  onTabChange: (tab: SidebarTabId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user, logout } = useAuth();

  const handleSelectTab = (tab: SidebarTabId) => {
    onTabChange(tab);
    onCloseMobile();
  };

  const navItems = [
    { id: 'resumen' as SidebarTabId, label: 'Resumen', icon: Home, roles: ['admin'] },
    { id: 'clientes' as SidebarTabId, label: 'Clientes', icon: Users, roles: ['admin'] },
    { id: 'produccion' as SidebarTabId, label: 'Producción', icon: Shirt, roles: ['admin', 'operario'] },
    { id: 'relavados' as SidebarTabId, label: 'Relavados', icon: RotateCcw, roles: ['admin', 'operario'] },
    { id: 'entregas' as SidebarTabId, label: 'Entregas', icon: Truck, roles: ['repartidor', 'admin'] },
    { id: 'reportes' as SidebarTabId, label: 'Reportes', icon: BarChart3, roles: ['admin'] },
    { id: 'portal' as SidebarTabId, label: 'Portal Hotel', icon: Building2, roles: ['cliente'] },
  ];

  const visibleItems = navItems.filter((item) =>
    user ? item.roles.includes(user.rol) : true
  );

  return (
    <>
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#051327] via-[#07172e] to-[#040e1d] border-r border-[#152a4a] flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top: Logo & Nav items */}
        <div className="p-5 flex flex-col gap-6 z-10">
          {/* Logo Brand TRITÓN */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-full bg-[#0a1e3b] border border-[#1d3d6e] p-1 flex items-center justify-center shrink-0 shadow-lg shadow-blue-950/50">
              <img
                src="/logo-triton.jpg"
                alt="Logo TRITÓN"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-wider text-white uppercase font-sans">
                TRITÓN
              </span>
              <span className="text-[10px] text-blue-300/70 font-medium tracking-tight">
                Lavandería Industrial
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 mt-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 text-left ${
                    isActive
                      ? 'bg-[#1877f2] text-white shadow-lg shadow-blue-600/30 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Watermark Trident Art & Logout */}
        <div className="relative p-5 pt-0 overflow-hidden flex flex-col justify-end">
          {/* Watermark Trident Vector */}
          <div className="absolute -bottom-6 -left-6 pointer-events-none opacity-[0.14] select-none text-blue-400">
            <svg
              viewBox="0 0 120 140"
              className="w-48 h-56 fill-current"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Central spear */}
              <path d="M60 5 L65 25 L62 25 L62 88 L58 88 L58 25 L55 25 Z" />
              {/* Left prong with elegant curve */}
              <path d="M30 20 C30 55 52 75 56 78 L56 72 C51 68 38 52 38 30 L43 32 L34 10 L25 32 L30 30 Z" />
              {/* Right prong with elegant curve */}
              <path d="M90 20 C90 55 68 75 64 78 L64 72 C69 68 82 52 82 30 L77 32 L86 10 L95 32 L90 30 Z" />
              {/* Crossbar & Base */}
              <rect x="50" y="85" width="20" height="4" rx="2" />
              <path d="M57 89 L63 89 L63 120 L68 120 L60 135 L52 120 L57 120 Z" />
            </svg>
          </div>

          {/* Quick Logout Button */}
          <div className="z-10 pt-4 border-t border-[#152a4a]/80">
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
