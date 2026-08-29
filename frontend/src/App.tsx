import { useState } from 'react';
import { Navbar } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { MatrixEntryView } from './components/matrix/MatrixEntryView';
import { ImportView } from './components/matrix/ImportView';
import { CatalogView } from './components/catalog/CatalogView';
import { AIInsightsView } from './components/ai/AIInsightsView';

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'matrix' | 'import' | 'catalog' | 'ai'>('dashboard');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'matrix' && <MatrixEntryView />}
        {activeTab === 'import' && <ImportView />}
        {activeTab === 'catalog' && <CatalogView />}
        {activeTab === 'ai' && <AIInsightsView />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4">
          <p>
            Lavadero BI &copy; {new Date().getFullYear()} — Poseidón Servicio de Lavandería SRL
          </p>
          <p className="text-slate-600">
            Tesis de Analista de Sistemas &bull; Go + PostgreSQL + React + Recharts
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
