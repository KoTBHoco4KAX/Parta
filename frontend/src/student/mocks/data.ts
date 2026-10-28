import { Task, UserStats, Achievement, Bet } from '../types';

export const mockTasks: Task[] = [
  { id: '1', title: 'ДЗ по математике', description: 'Решить задачи 1-5 из параграфа 12', status: 'todo', dueDate: '2026-10-30', subject: 'Математика' },
  { id: '2', title: 'Лабораторная по физике', description: 'Отчет по оптике', status: 'in-progress', dueDate: '2026-10-29', subject: 'Физика' },
  { id: '3', title: 'Эссе по истории', description: 'Первая мировая война', status: 'review', dueDate: '2026-10-28', subject: 'История' },
  { id: '4', title: 'Курсовая часть 1', description: 'Глава 1 готова', status: 'done', dueDate: '2026-10-25', subject: 'Программирование' },
];

export const mockStats: UserStats = {
  xp: 1250,
  level: 8,
  streak: 7,
  freezes: 2,
};

export const mockAchievements: Achievement[] = [
  { id: '1', title: 'Первый шаг', description: 'Выполнить первое задание', icon: '🎯', unlocked: true, xpReward: 50 },
  { id: '2', title: 'Недельный стрик', description: '7 дней подряд', icon: '🔥', unlocked: true, xpReward: 100 },
  { id: '3', title: 'Ботан', description: '10 заданий выполнено', icon: '📚', unlocked: false, xpReward: 150 },
  { id: '4', title: 'Марафонец', description: '30 дней подряд', icon: '⚡', unlocked: false, xpReward: 500 },
];

export const mockBets: Bet[] = [
  { id: '1', opponent: 'Алексей М.', amount: 100, stake: 'Кто раньше сделает ДЗ по физике', status: 'active' },
  { id: '2', opponent: 'Мария К.', amount: 50, stake: 'Сдача реферата', status: 'pending' },
];