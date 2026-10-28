import { useState } from 'react';
import { mockStats, mockAchievements } from '../mocks/data';

export default function GamificationPage() {
  const [stats, setStats] = useState(mockStats);
  const xpToNextLevel = 1500;
  const progress = (stats.xp / xpToNextLevel) * 100;

  const buyFreeze = () => {
    if (stats.xp >= 200) {
      setStats({ ...stats, xp: stats.xp - 200, freezes: stats.freezes + 1 });
      alert('Заморозка куплена!');
    } else {
      alert('Недостаточно XP!');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Геймификация</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 rounded-lg">
          <h2 className="text-lg font-semibold">Уровень</h2>
          <p className="text-3xl font-bold">{stats.level}</p>
        </div>
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-4 rounded-lg">
          <h2 className="text-lg font-semibold">Стрик</h2>
          <p className="text-3xl font-bold">🔥 {stats.streak} дней</p>
        </div>
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-4 rounded-lg">
          <h2 className="text-lg font-semibold">Заморозки</h2>
          <p className="text-3xl font-bold">❄️ {stats.freezes}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-2">Опыт (XP)</h2>
        <div className="flex justify-between mb-2">
          <span>{stats.xp} XP</span>
          <span>{xpToNextLevel} XP</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div className="bg-green-500 h-4 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }}></div>
        </div>
        <p className="text-sm text-gray-600 mt-2">До следующего уровня: {xpToNextLevel - stats.xp} XP</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Магазин</h2>
        <div className="flex items-center justify-between p-3 border rounded">
          <div>
            <h3 className="font-medium">Заморозка стрика</h3>
            <p className="text-sm text-gray-600">Сохранит стрик в случае пропуска</p>
          </div>
          <button onClick={buyFreeze} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Купить за 200 XP
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Достижения</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {mockAchievements.map(ach => (
            <div key={ach.id} className={`p-3 border rounded flex items-center gap-3 ${ach.unlocked ? 'bg-green-50 border-green-200' : 'bg-gray-50 opacity-60'}`}>
              <span className="text-2xl">{ach.icon}</span>
              <div className="flex-1">
                <h3 className="font-medium">{ach.title}</h3>
                <p className="text-sm text-gray-600">{ach.description}</p>
                <p className="text-xs text-green-600">+{ach.xpReward} XP</p>
              </div>
              {ach.unlocked && <span className="text-green-600">✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}