import { useState, useEffect } from 'react';
import { Bot, X } from 'lucide-react';
import { Navbar, TabId } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { MatrixEntryView } from './components/matrix/MatrixEntryView';
import { ImportView } from './components/matrix/ImportView';
import { CatalogView } from './components/catalog/CatalogView';
import { AIInsightsView } from './components/ai/AIInsightsView';
import { ChatWidget } from './components/ai/ChatWidget';
import { LoginView } from './components/auth/LoginView';
import { PortalHotelView } from './components/portal/PortalHotelView';
import { AuditoriaView } from './components/portal/AuditoriaView';
import { EntregasView } from './components/portal/EntregasView';
import { useAuth } from './contexts/AuthContext';
import { useRealtime } from './hooks/useRealtime';

const VALID_TABS_BY_ROLE: Record<string, TabId[]> = {
  admin: ['dashboard', 'matrix', 'auditoria', 'entregas', 'import', 'catalog', 'ai'],
  operario: ['matrix', 'auditoria'],
  cliente: ['portal'],
  repartidor: ['entregas', 'auditoria'],
};

function getTabFromHash(rol?: string): TabId | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim() as TabId;
  if (!raw || !rol) return null;
  const allowed = VALID_TABS_BY_ROLE[rol] || [];
  return allowed.includes(raw) ? raw : null;
}

export function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
  };

  // Escucha activa global de eventos en tiempo real para todos los roles
  useRealtime();

  // Sincronizar con window.location.hash o redireccionar al tab por defecto según el rol
  useEffect(() => {
    if (!user?.rol) return;
    const hashTab = getTabFromHash(user.rol);
    if (hashTab) {
      setActiveTab(hashTab);
      return;
    }

    let defaultTab: TabId = 'dashboard';
    if (user.rol === 'cliente') {
      defaultTab = 'portal';
    } else if (user.rol === 'operario') {
      defaultTab = 'matrix';
    } else if (user.rol === 'repartidor') {
      defaultTab = 'entregas';
    } else if (user.rol === 'admin') {
      defaultTab = 'dashboard';
    }
    setActiveTab(defaultTab);
    if (typeof window !== 'undefined') {
      window.location.hash = defaultTab;
    }
  }, [user?.rol]);

  useEffect(() => {
    if (!user?.rol) return;
    const onHashChange = () => {
      const hashTab = getTabFromHash(user.rol);
      if (hashTab) {
        setActiveTab(hashTab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [user?.rol]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-triton-navy">
        <div className="text-triton-aqua text-sm animate-pulse font-semibold">
          Verificando sesión...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const isAdmin = user.rol === 'admin';
  const isOperario = user.rol === 'operario';
  const isCliente = user.rol === 'cliente';
  const isRepartidor = user.rol === 'repartidor';

  return (
    <div className="min-h-[100dvh] flex flex-col app-canvas text-slate-100">
      <Navbar activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 animate-fade-in">
        {/* Vistas exclusivas de clientes */}
        {isCliente && activeTab === 'portal' && <PortalHotelView />}

        {/* Vistas operativas, auditoría y logística de entregas */}
        {(isAdmin || isOperario) && activeTab === 'matrix' && <MatrixEntryView />}
        {(isAdmin || isOperario || isRepartidor) && activeTab === 'auditoria' && <AuditoriaView />}
        {(isAdmin || isRepartidor) && activeTab === 'entregas' && <EntregasView />}

        {/* Vistas administrativas */}
        {isAdmin && activeTab === 'dashboard' && <DashboardView />}
        {isAdmin && activeTab === 'import' && <ImportView />}
        {isAdmin && activeTab === 'catalog' && <CatalogView />}
        {isAdmin && activeTab === 'ai' && <AIInsightsView />}
      </main>

      <footer className="border-t border-triton-slate/40 bg-triton-navy-dark py-5 sm:py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
          <p className="flex items-center gap-2">
            <img
              src="/logo-triton.jpg"
              alt="Tritón"
              className="w-5 h-5 rounded object-contain border border-triton-teal/40"
            />
            <span className="font-bold text-white">TRITÓN</span> &copy;{' '}
            {new Date().getFullYear()} &mdash; Lavadero Industrial SRL
          </p>
          <p className="text-slate-400 text-[11px] sm:text-xs">
            Sistema de Gestión y Business Intelligence &bull; TRITÓN
          </p>
        </div>
      </footer>

      {isAdmin && (
        <>
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 p-3.5 rounded-full bg-gradient-to-r from-triton-teal to-triton-aqua hover:from-triton-teal-light hover:to-triton-aqua-hover text-triton-navy font-bold shadow-xl shadow-triton-aqua/25 transition-all hover:scale-105"
            aria-label="Abrir asistente de IA"
          >
            {chatOpen ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </button>

          {chatOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/60 z-40"
                onClick={() => setChatOpen(false)}
              />
              <aside className="fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 w-full sm:max-w-md z-50 shadow-2xl animate-slide-in">
                <ChatWidget onClose={() => setChatOpen(false)} />
              </aside>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
