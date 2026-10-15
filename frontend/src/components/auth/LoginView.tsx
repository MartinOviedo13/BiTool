import React, { useState } from 'react';
import { LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
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
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#071326] px-4 py-8">
      {/* Background ocean radial glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-800/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Banner Institucional Oficial TRITÓN */}
        <div className="mb-6 text-center">
          <div className="p-1 rounded-2xl bg-gradient-to-b from-[#1e3659] to-[#0b1a33] shadow-2xl border border-[#1e3659]/80 overflow-hidden mb-3">
            <img
              src="/banner-triton.png"
              alt="Tritón Lavadero Industrial"
              className="w-full h-auto rounded-xl object-cover"
            />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400 bg-brand-950/80 px-2.5 py-0.5 rounded-full border border-brand-800/60">
            Plataforma BI & Trazabilidad B2B
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#0b1a33]/90 backdrop-blur border border-[#1e3659] rounded-2xl p-7 shadow-2xl">
          <h2 className="text-base font-bold text-white mb-5 flex items-center justify-between">
            <span>Iniciar Sesión</span>
            <span className="text-xs text-slate-400 font-normal">Acceso Seguro</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="ej: admin / operario / repartidor / kingdavid"
                className="w-full bg-[#071326] border border-[#1e3659] focus:border-brand-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-[#071326] border border-[#1e3659] focus:border-brand-400 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
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
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-brand-700/30"
            >
              <LogIn className="h-4 w-4" />
              <span>{loading ? 'Ingresando...' : 'Ingresar al sistema'}</span>
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Tesis de Analista de Sistemas &bull; IRESM
        </p>
      </div>
    </div>
  );
};
