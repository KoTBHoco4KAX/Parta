import { useState } from 'react';
import KanbanPage from './pages/KanbanPage';
import GamificationPage from './pages/GamificationPage';
import BetsPage from './pages/BetsPage';

type Tab = 'kanban' | 'gamification' | 'bets';

export default function StudentApp() {
  const [activeTab, setActiveTab] = useState<Tab>('kanban');

  const tabs = [
    { id: 'kanban' as Tab, label: 'Канбан', icon: '📋' },
    { id: 'gamification' as Tab, label: 'Геймификация', icon: '🎮' },
    { id: 'bets' as Tab, label: 'Пари', icon: '⚔️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto">
        {activeTab === 'kanban' && <KanbanPage />}
        {activeTab === 'gamification' && <GamificationPage />}
        {activeTab === 'bets' && <BetsPage />}
      </main>
    </div>
  );
}