import React, { useState } from 'react';
import { Waves, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center shadow-xl shadow-brand-600/30 mb-4">
            <Waves className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Poseidon BI</h1>
          <p className="text-sm text-slate-400 mt-1">Servicio de Lavanderia SRL</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-6">Iniciar sesion</h2>

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
                placeholder="ej: kingdavid / admin / operario"
                className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                Contrasena
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-slate-600 outline-none transition-colors"
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
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-brand-600/20"
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
