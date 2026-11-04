// Сид-данные мока студенческого кабинета ПАРТА.
//
// Эти данные имитируют выдачу read-эндпоинтов Фазы 7: GET /api/tasks,
// GET /api/submissions, GET /api/wagers, /api/users/me. Дедлайны считаются
// относительно Date.now(), поэтому демо всегда «живое»: speedrun ещё догоняем,
// командный проект уже на доработке.
import type {
  BoardSubmission,
  BoardTask,
  LedgerEntry,
  Profile,
  StudentWager,
} from '../types';

const HOUR = 3_600_000;

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

function hoursAgo(hours: number): string {
  return hoursFromNow(-hours);
}

// DEV-сид групп: группы IS-21 / IS-22, студент в IS-21 (spec PROJECT_MANIFEST §6.4).
export const seedProfile: Profile = {
  id: 5,
  displayName: 'Никита Хайдаров',
  groupCode: 'IS-21',
  // 1000 (адджастмент) + 300 (эссе, speedrun ×1.5) − 50 (проигранное пари)
  // + 150 (выигранное пари ×2) − 200 (заморозка) = 1200 XP.
  xpBalance: 1200,
  onTimeStreak: 12,
  streakFreezes: 1,
};

export const seedTasks: BoardTask[] = [
  {
    id: 1,
    title: 'Лабораторная №1: нормализация схемы',
    description:
      'Привести схему БД «Библиотека» к 3НФ. Пояснить в READMD, какие функциональные зависимости выявлены и как они устранены.',
    taskType: 'LAB_CODE',
    deadlineAt: hoursFromNow(72),
    speedrunWindowHours: 48,
    baseXp: 400,
    teamSize: 1,
  },
  {
    id: 2,
    title: 'Тест по нормальным формам',
    description: '20 вопросов, одна попытка. Дедлайн завтра вечером — успейте, quiz скоринг в XP не конвертируется дважды.',
    taskType: 'TEST',
    deadlineAt: hoursFromNow(26),
    speedrunWindowHours: 12,
    baseXp: 150,
    teamSize: 1,
  },
  {
    id: 3,
    title: 'Эссе: реляционная модель и её границы',
    description: 'Сдать PDF, 2–3 страницы. Оценка не ставится — только вердикт преподавателя и XP.',
    taskType: 'ESSAY',
    deadlineAt: hoursFromNow(120),
    speedrunWindowHours: 24,
    baseXp: 200,
    teamSize: 1,
  },
  {
    id: 4,
    title: 'Командный проект: сервис учёта заявок',
    description:
      'Слоты: DB и BIZ (team_size = 2). File drop для каждого слота свой; carry-over слота отдаёт бонус XP другому участнику.',
    taskType: 'TEAM_PROJECT',
    deadlineAt: hoursFromNow(168),
    speedrunWindowHours: 48,
    baseXp: 800,
    teamSize: 2,
  },
];

export const seedSubmissions: BoardSubmission[] = [
  {
    id: 101,
    status: 'TODO',
    attempt: 1,
    artifactUrl: '',
    artifactHash: '',
    submittedAt: null,
    revisionLog: [],
  },
  {
    id: 102,
    status: 'TODO',
    attempt: 1,
    artifactUrl: '',
    artifactHash: '',
    submittedAt: null,
    revisionLog: [],
  },
  {
    // Эссе уже принято: попадает в колонку DONE и в историю XP (speedrun ×1.5).
    id: 103,
    status: 'DONE',
    attempt: 1,
    artifactUrl: 'upload://esse-relacionnost.pdf',
    artifactHash: 'sha256:81b2a4c4b3b1b0f0d3a8f5f3a7d0b1e5a4b6c3d2e1f0a9b8c7d6e5f4a3b2c1d0',
    submittedAt: hoursAgo(60),
    revisionLog: [],
  },
  {
    // Командный проект на доработке: REJECTED → доступен REOPEN.
    id: 104,
    status: 'REJECTED',
    attempt: 2,
    artifactUrl: 'upload://team-project-api.zip',
    artifactHash: 'sha256:9e4b4a44e6e7c3d2b1a0f9e8d7c6b5a498877f66554433221100ffeeddccbbaa',
    submittedAt: hoursAgo(76),
    revisionLog: [
      {
        at: hoursAgo(50),
        comment:
          'Слот BIZ: нет валидации входных заявок и пустые миграции. На доработку — приложите скрипт миграции и повторите попытку.',
      },
    ],
  },
];

export const seedWagers: StudentWager[] = [
  {
    id: 201,
    taskId: 3,
    taskTitle: 'Эссе: реляционная модель и её границы',
    taskDeadlineAt: hoursFromNow(120),
    stakeAmount: 75,
    deadlineAt: hoursFromNow(120),
    status: 'WON',
    createdAt: hoursAgo(96),
    resolutionNote: 'Работа принята до дедлайна пари — выплата ×2 (150 XP).',
  },
  {
    id: 202,
    taskId: 4,
    taskTitle: 'Командный проект: сервис учёта заявок',
    taskDeadlineAt: hoursFromNow(168),
    stakeAmount: 50,
    deadlineAt: hoursAgo(4),
    status: 'LOST',
    createdAt: hoursAgo(120),
    resolutionNote: 'Дедлайн пари прошёл, работа на доработке — ставка не возвращается.',
  },
];

// История XP-проводок для экрана геймификации (новые сверху).
export const seedLedger: LedgerEntry[] = [
  {
    id: 301,
    amount: -200,
    reason: 'STREAK_FREEZE',
    memo: 'Покупка заморозки стрика (200 XP)',
    createdAt: hoursAgo(5),
  },
  {
    id: 302,
    amount: 150,
    reason: 'WAGER_PAYOUT',
    memo: 'Пари на эссе: победа ×2',
    createdAt: hoursAgo(48),
  },
  {
    id: 303,
    amount: -50,
    reason: 'WAGER_ESCROW',
    memo: 'Пари на командный проект: ставка в escrow',
    createdAt: hoursAgo(120),
  },
  {
    id: 304,
    amount: 300,
    reason: 'TASK_ACCEPT',
    memo: 'Принято: эссе по реляционной модели (speedrun ×1.5)',
    createdAt: hoursAgo(57),
  },
  {
    id: 305,
    amount: 1000,
    reason: 'ADMIN_ADJUSTMENT',
    memo: 'Приветственное начисление модуля «Базы данных»',
    createdAt: hoursAgo(24 * 21),
  },
];

// buildStreakCalendar — дни on-time сдач для календаря-«трешки»: последние 12
// дней подряд (текущий стрик 12) + редкие всплески три недели назад, чтобы
// сетка была не пустой. Возвращает ISO-даты 'YYYY-MM-DD'.
export function buildStreakCalendar(days = 56): string[] {
  const daysOnTime: string[] = [];

  for (let back = 0; back < days; back += 1) {
    // 0–11 дней назад — активный стрик; 14–25 дней назад — фрагменты старого.
    const inCurrentStreak = back < 12;
    const inOldStreak = back >= 14 && back <= 25 && (back + 1) % 2 === 0;

    if (inCurrentStreak || inOldStreak) {
      daysOnTime.push(new Date(Date.now() - back * 24 * HOUR).toISOString().slice(0, 10));
    }
  }

  return daysOnTime;
}

export const streakFreezePrice = 200;
