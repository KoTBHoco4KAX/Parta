import { useState } from 'react';
import { mockBets } from '../mocks/data';
import { Bet } from '../types';

export default function BetsPage() {
  const [bets, setBets] = useState<Bet[]>(mockBets);
  const [showCreate, setShowCreate] = useState(false);

  const getStatusColor = (status: Bet['status']) => {
    switch(status) {
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'won': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: Bet['status']) => {
    switch(status) {
      case 'active': return 'Активно';
      case 'pending': return 'Ожидает';
      case 'won': return 'Выиграл';
      case 'lost': return 'Проиграл';
      default: return status;
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Пари</h1>
        <button onClick={() => setShowCreate(true)} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
          Создать пари
        </button>
      </div>

      <div className="space-y-4">
        {bets.map(bet => (
          <div key={bet.id} className="bg-white p-4 rounded-lg shadow">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-lg">Против {bet.opponent}</h3>
              <span className={`px-2 py-1 rounded text-sm ${getStatusColor(bet.status)}`}>
                {getStatusText(bet.status)}
              </span>
            </div>
            <p className="text-gray-700 mb-2">{bet.stake}</p>
            <p className="text-sm text-gray-600">Ставка: {bet.amount} монет</p>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Создать пари</h2>
            <form onSubmit={(e) => { e.preventDefault(); alert('Пари создано!'); setShowCreate(false); }}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Соперник</label>
                <input type="text" className="w-full border rounded p-2" placeholder="Имя или ID" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Условие пари</label>
                <input type="text" className="w-full border rounded p-2" placeholder="Кто быстрее..." />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Ставка (монеты)</label>
                <input type="number" className="w-full border rounded p-2" placeholder="50" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-purple-600 text-white py-2 rounded hover:bg-purple-700">
                  Создать
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400">
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}