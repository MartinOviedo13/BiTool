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
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-400 text-sm animate-pulse font-semibold">
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
    <div className="min-h-screen flex flex-col bg-[#071326] text-slate-100">
      <Navbar activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
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

      <footer className="border-t border-[#112340] bg-[#071326]/95 py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2">
            <img
              src="/logo-triton.jpg"
              alt="Tritón"
              className="w-5 h-5 rounded object-contain border border-[#1e3659]"
            />
            <span className="font-bold text-white">TRITÓN</span> &copy;{' '}
            {new Date().getFullYear()} &mdash; Lavadero Industrial SRL
          </p>
          <p className="text-slate-500">
            Sistema de Gestión y Business Intelligence &bull; TRITÓN
          </p>
        </div>
      </footer>

      {isAdmin && (
        <>
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="fixed bottom-6 right-6 z-40 p-3.5 rounded-full bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white shadow-xl shadow-brand-600/30 transition-all hover:scale-105"
            aria-label="Abrir asistente de IA"
          >
            {chatOpen ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </button>

          {chatOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={() => setChatOpen(false)}
              />
              <aside className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 shadow-2xl animate-slide-in">
                <ChatWidget />
              </aside>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
