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
import { useAuth } from './contexts/AuthContext';

export function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);

  // Redireccionar al tab correspondiente según el rol al iniciar sesión
  useEffect(() => {
    if (user?.rol === 'cliente') {
      setActiveTab('portal');
    } else if (user?.rol === 'operario') {
      setActiveTab('matrix');
    } else if (user?.rol === 'admin') {
      setActiveTab('dashboard');
    }
  }, [user?.rol]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-400 text-sm animate-pulse">Verificando sesión...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const isAdmin = user.rol === 'admin';
  const isOperario = user.rol === 'operario';
  const isCliente = user.rol === 'cliente';

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Vistas exclusivas de clientes */}
        {isCliente && activeTab === 'portal' && <PortalHotelView />}

        {/* Vistas operativas y auditoría */}
        {(isAdmin || isOperario) && activeTab === 'matrix' && <MatrixEntryView />}
        {(isAdmin || isOperario) && activeTab === 'auditoria' && <AuditoriaView />}

        {/* Vistas administrativas */}
        {isAdmin && activeTab === 'dashboard' && <DashboardView />}
        {isAdmin && activeTab === 'import' && <ImportView />}
        {isAdmin && activeTab === 'catalog' && <CatalogView />}
        {isAdmin && activeTab === 'ai' && <AIInsightsView />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4">
          <p>Lavadero BI &copy; {new Date().getFullYear()} &mdash; Poseidon Servicio de Lavanderia SRL</p>
          <p className="text-slate-600">
            Tesis de Analista de Sistemas &bull; Go + PostgreSQL + React + Recharts
          </p>
        </div>
      </footer>

      {isAdmin && (
        <>
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="fixed bottom-6 right-6 z-40 p-3.5 rounded-full bg-gradient-to-r from-brand-600 to-cyan-500 hover:from-brand-500 hover:to-cyan-400 text-white shadow-xl shadow-brand-600/30 transition-all"
            aria-label="Abrir asistente"
          >
            {chatOpen ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </button>

          {chatOpen && (
            <>
              <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setChatOpen(false)} />
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
