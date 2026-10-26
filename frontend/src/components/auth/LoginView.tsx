import React, { useState } from 'react';
import { LogIn, AlertCircle, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center app-canvas px-4 py-8">
            {/* Toggle tema claro / oscuro en pantalla de login */}
      <button
        type="button"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
        className="absolute top-4 right-4 p-2.5 rounded-xl border border-triton-slate/50 bg-triton-deep text-slate-300 hover:text-white transition-all shadow-md z-10"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-triton-teal" />}
      </button>

      {/* Background ocean radial glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-triton-teal/15 rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-triton-deep/40 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Banner Institucional Oficial TRITÓN */}
        <div className="mb-6 text-center">
          <div className="p-1 rounded-2xl bg-gradient-to-b from-triton-deep to-triton-navy shadow-2xl border border-triton-slate/60 overflow-hidden mb-3">
            <img
              src="/banner-triton.png"
              alt="Tritón Lavadero Industrial"
              className="w-full h-auto rounded-xl object-cover"
            />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-triton-aqua bg-triton-deep/90 px-3 py-1 rounded-full border border-triton-teal/50 shadow-sm">
            Plataforma BI & Trazabilidad B2B
          </span>
        </div>

        {/* Card */}
        <div className="bg-triton-deep/90 backdrop-blur-md border border-triton-slate/50 rounded-2xl p-7 shadow-2xl">
          <h2 className="text-base font-bold text-white mb-5 flex items-center justify-between">
            <span>Iniciar Sesión</span>
            <span className="text-xs text-triton-aqua font-semibold">Acceso Seguro</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="ej: admin / operario / repartidor / kingdavid"
                className="w-full bg-triton-navy border border-triton-slate/60 focus:border-triton-aqua rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-triton-navy border border-triton-slate/60 focus:border-triton-aqua rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-triton-aqua transition-colors"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-950/60 border border-rose-800 rounded-xl px-4 py-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 bg-triton-aqua hover:bg-triton-aqua-hover active:bg-[#48c0b0] disabled:opacity-40 disabled:cursor-not-allowed text-triton-navy font-black rounded-xl transition-all shadow-lg shadow-triton-aqua/25"
            >
              <LogIn className="h-4 w-4" />
              <span>{loading ? 'Ingresando...' : 'Ingresar al sistema'}</span>
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          TRITÓN &bull; Poseidón Servicio de Lavandería SRL
        </p>
      </div>
    </div>
  );
};
