import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserRole } from '../types';

export interface AuthUser {
  id: number;
  username: string;
  rol: UserRole;
  hotel_id?: number | null;
  hotel_nombre?: string | null;
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'lavadero_bi_token';
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
};
const API_BASE = getApiBase();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Al iniciar, verificar si hay un token guardado y que siga siendo valido
  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (!stored) { setLoading(false); return; }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!res.ok) throw new Error('Token invalido');
        const data = await res.json();
        setUser({
          id: data.id,
          username: data.username,
          rol: data.rol,
          hotel_id: data.hotel_id,
          hotel_nombre: data.hotel_nombre,
          token: stored,
        });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Credenciales incorrectas.');
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser({
      id: 0,
      username: data.username,
      rol: data.rol,
      hotel_id: data.hotel_id,
      hotel_nombre: data.hotel_nombre,
      token: data.token,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};

// Token actual para inyectar en el cliente API
export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
