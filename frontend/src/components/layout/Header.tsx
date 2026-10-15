import React, { useState } from 'react';
import {
  Menu,
  Bell,
  ChevronDown,
  User,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  backendOnline: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleMobileMenu,
  backendOnline,
}) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
      {/* Mobile toggle button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Small breadcrumb/status */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-800">TRITÓN</span>
          <span>/</span>
          <span className="text-slate-500 capitalize">{user?.rol || 'Panel'}</span>
        </div>
      </div>

      {/* Right controls: Notifications, Online Pill, User Menu */}
      <div className="flex items-center gap-3 sm:gap-4 ml-auto">
        {/* Backend Online status indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            backendOnline === true
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : backendOnline === false
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}
          title={backendOnline === true ? 'Backend Conectado' : 'Sin conexión con el servidor'}
        >
          {backendOnline === true ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : backendOnline === false ? (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden sm:inline">Offline</span>
            </>
          ) : (
            <span>...</span>
          )}
        </div>

        {/* Notification Bell */}
        <button
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
        </button>

        {/* User Pill Capsule */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/80 rounded-full text-xs font-semibold text-slate-800 transition-all"
          >
            <div className="w-6 h-6 rounded-full bg-[#1877f2] text-white flex items-center justify-center font-bold text-[11px] shadow-sm">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="hidden sm:inline font-bold">
              {user?.hotel_nombre || (user?.username === 'admin' ? 'Administrador' : user?.username)}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* User Dropdown */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50 animate-fade-in text-xs">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="font-bold text-slate-900 truncate">
                    {user?.hotel_nombre || user?.username}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold mt-0.5">
                    <Shield className="w-3 h-3" />
                    <span className="uppercase">Rol: {user?.rol}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 transition-colors font-medium mt-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
