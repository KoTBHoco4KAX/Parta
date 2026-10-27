/**
 * Демо-данные преподавательского кабинета.
 *
 * Все сценарии построены вокруг spec/02_FSM.md и spec/03_MATH.md:
 *  - работы в инбоксе находятся строго в статусе REVIEW;
 *  - on-time определяется по submitted_at, а не по времени проверки;
 *  - у части работ дедлайн уже прошёл, но сданы они вовремя — это подчёркивает
 *    инвариант «студент не наказывается за задержку преподавателя».
 *
 * Даты считаются от момента загрузки модуля, поэтому демо всегда выглядит «живым».
 */

import type {
  ChecklistItem,
  InboxSubmission,
  PeerReview,
  RevisionEntry,
} from '../types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Зеркало сид-пользователя teacher@parta.dev. */
export const MOCK_TEACHER = {
  id: 2,
  name: 'Алексей Смирнов',
  role: 'teacher' as const,
  email: 'teacher@parta.dev',
};

/** Группы из 002_seed_dev.sql. */
export const MOCK_GROUPS = [
  { id: 1, code: 'IS-21', title: 'Информационные системы, 21' },
  { id: 2, code: 'IS-22', title: 'Информационные системы, 22' },
] as const;

function iso(base: number, offsetMs: number): string {
  return new Date(base + offsetMs).toISOString();
}

function revision(base: number, offsetMs: number, comment: string): RevisionEntry {
  return { at: iso(base, offsetMs), comment, verdict: 'REJECT' };
}

/**
 * Шесть работ в инбоксе. Ожидание специально разное: от часа до двух с лишним
 * суток, чтобы были видны все состояния бейджа «сколько ждёт».
 */
export function seedInbox(now: number = Date.now()): InboxSubmission[] {
  return [
    {
      id: 503,
      taskId: 13,
      taskTitle: 'Тест: индексы и планы запросов',
      taskType: 'TEST',
      groupId: 1,
      groupCode: 'IS-21',
      studentId: 102,
      studentName: 'Мария Лебедева',
      submittedAt: iso(now, -54 * HOUR),
      lockedAt: iso(now, -54 * HOUR),
      deadlineAt: iso(now, 2 * DAY),
      speedrunWindowHours: 12,
      baseXP: 120,
      artifactUrl: 'https://lms.parta.edu/artifacts/503/answers.pdf',
      artifactHash: 'sha256:1f4c0a9e7b2d58c3a6f10d4e8b7c92a15d3e6f80b1c4a7d2e9f3b6c8a0d5e7f2',
      attempt: 1,
      teamSlotRole: null,
      revisions: [],
    },
    {
      id: 505,
      taskId: 15,
      taskTitle: 'Лабораторная №2: транзакции и блокировки',
      taskType: 'LAB_CODE',
      groupId: 2,
      groupCode: 'IS-22',
      studentId: 106,
      studentName: 'Полина Зайцева',
      submittedAt: iso(now, -52 * HOUR),
      lockedAt: iso(now, -52 * HOUR),
      deadlineAt: iso(now, -4 * HOUR),
      speedrunWindowHours: 48,
      baseXP: 380,
      artifactUrl: 'https://lms.parta.edu/artifacts/505/lab2.tgz',
      artifactHash: 'sha256:8c2b5e1d9f0a3c7b6e4d2f8a1c9b5e3d7f0a2c4e6b8d1f3a5c7e9b0d2f4a6c8e',
      attempt: 1,
      teamSlotRole: null,
      revisions: [],
    },
    {
      id: 502,
      taskId: 12,
      taskTitle: 'Эссе: архитектура REST API',
      taskType: 'ESSAY',
      groupId: 2,
      groupCode: 'IS-22',
      studentId: 104,
      studentName: 'Софья Ветрова',
      submittedAt: iso(now, -27 * HOUR),
      lockedAt: iso(now, -27 * HOUR),
      deadlineAt: iso(now, 3 * DAY),
      speedrunWindowHours: 24,
      baseXP: 240,
      artifactUrl: 'https://lms.parta.edu/artifacts/502/essay.md',
      artifactHash: 'sha256:3d7e9b1f5a2c8d0e4b6f7a9c1e3d5b7f9a0c2e4d6b8f1a3c5e7d9b0f2a4c6e8d',
      attempt: 1,
      teamSlotRole: null,
      revisions: [],
    },
    {
      id: 504,
      taskId: 14,
      taskTitle: 'Командный проект: сервис учёта заявок',
      taskType: 'TEAM_PROJECT',
      groupId: 2,
      groupCode: 'IS-22',
      studentId: 105,
      studentName: 'Никита Громов',
      submittedAt: iso(now, -9 * HOUR),
      lockedAt: iso(now, -9 * HOUR),
      deadlineAt: iso(now, 9 * DAY),
      speedrunWindowHours: 72,
      baseXP: 460,
      artifactUrl: 'https://lms.parta.edu/artifacts/504/biz-layer.zip',
      artifactHash: 'sha256:5a1c3e7b9d2f4a6c8e0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a3c',
      attempt: 1,
      teamSlotRole: 'BIZ',
      revisions: [],
    },
    {
      id: 501,
      taskId: 11,
      taskTitle: 'Лабораторная №1: нормализация схемы',
      taskType: 'LAB_CODE',
      groupId: 1,
      groupCode: 'IS-21',
      studentId: 101,
      studentName: 'Артём Кузнецов',
      submittedAt: iso(now, -3.5 * HOUR),
      lockedAt: iso(now, -3.5 * HOUR),
      deadlineAt: iso(now, 6 * DAY),
      speedrunWindowHours: 48,
      baseXP: 400,
      artifactUrl: 'https://lms.parta.edu/artifacts/501/schema.sql',
      artifactHash: 'sha256:9f2c4a6e8b0d1f3a5c7e9b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a',
      attempt: 2,
      teamSlotRole: null,
      revisions: [
        revision(
          now,
          -26 * HOUR,
          'Не хватает тестов на каскадное удаление. Добавьте и пересдайте.',
        ),
      ],
    },
    {
      id: 506,
      taskId: 11,
      taskTitle: 'Лабораторная №1: нормализация схемы',
      taskType: 'LAB_CODE',
      groupId: 1,
      groupCode: 'IS-21',
      studentId: 103,
      studentName: 'Даниил Орлов',
      submittedAt: iso(now, -1 * HOUR),
      lockedAt: iso(now, -1 * HOUR),
      deadlineAt: iso(now, 6 * DAY),
      speedrunWindowHours: 48,
      baseXP: 400,
      artifactUrl: 'https://lms.parta.edu/artifacts/506/schema.sql',
      artifactHash: 'sha256:7b1d3f5a9c2e4b6d8f0a2c4e6b8d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c2e4b6d',
      attempt: 1,
      teamSlotRole: null,
      revisions: [],
    },
  ];
}

const SANDBOX_CHECKLIST: ChecklistItem[] = [
  { code: 'C1', title: 'Проект собирается и запускается', weight: 1 },
  { code: 'C2', title: 'Есть тесты на основной сценарий', weight: 2 },
  { code: 'C3', title: 'Решение соответствует ТЗ', weight: 2 },
  { code: 'C4', title: 'Код читаем, имена осмысленные', weight: 1 },
  { code: 'C5', title: 'Нет утечек ресурсов и секретов в репозитории', weight: 1 },
];

/** Шесть peer-review сессий: ждёт рецензента, в работе, завершено, истекло. */
export function seedPeerReviews(now: number = Date.now()): PeerReview[] {
  return [
    {
      id: 701,
      submissionId: 501,
      taskId: 11,
      taskTitle: 'Лабораторная №1: нормализация схемы',
      groupCode: 'IS-21',
      authorId: 101,
      authorName: 'Артём Кузнецов',
      reviewerId: 104,
      reviewerName: 'Софья Ветрова',
      status: 'COMPLETED',
      escrowAmount: 80,
      rewardAmount: 80,
      createdAt: iso(now, -3 * DAY),
      takenAt: iso(now, -3 * DAY + 2 * HOUR),
      completedAt: iso(now, -2 * DAY),
      expiresAt: iso(now, -1 * DAY),
      checklist: SANDBOX_CHECKLIST.slice(0, 4),
      checklistResults: [
        { code: 'C1', passed: true },
        { code: 'C2', passed: true },
        { code: 'C3', passed: true },
        { code: 'C4', passed: false },
      ],
      summary:
        'Схема нормализована корректно, тесты покрывают вставку и удаление. Имена таблиц стоит привести к snake_case.',
      accessTokenTtlSeconds: 900,
    },
    {
      id: 705,
      submissionId: 504,
      taskId: 14,
      taskTitle: 'Командный проект: сервис учёта заявок',
      groupCode: 'IS-22',
      authorId: 105,
      authorName: 'Никита Громов',
      reviewerId: 101,
      reviewerName: 'Артём Кузнецов',
      status: 'IN_REVIEW',
      escrowAmount: 90,
      rewardAmount: 80,
      createdAt: iso(now, -1 * DAY),
      takenAt: iso(now, -22 * HOUR),
      completedAt: null,
      expiresAt: iso(now, 45 * MINUTE),
      checklist: SANDBOX_CHECKLIST,
      checklistResults: [],
      summary: '',
      accessTokenTtlSeconds: 900,
    },
    {
      id: 702,
      submissionId: 502,
      taskId: 12,
      taskTitle: 'Эссе: архитектура REST API',
      groupCode: 'IS-22',
      authorId: 102,
      authorName: 'Мария Лебедева',
      reviewerId: 105,
      reviewerName: 'Никита Громов',
      status: 'IN_REVIEW',
      escrowAmount: 80,
      rewardAmount: 70,
      createdAt: iso(now, -20 * HOUR),
      takenAt: iso(now, -18 * HOUR),
      completedAt: null,
      expiresAt: iso(now, 6 * HOUR),
      checklist: SANDBOX_CHECKLIST,
      checklistResults: [],
      summary: '',
      accessTokenTtlSeconds: 900,
    },
    {
      id: 703,
      submissionId: 503,
      taskId: 13,
      taskTitle: 'Тест: индексы и планы запросов',
      groupCode: 'IS-21',
      authorId: 103,
      authorName: 'Даниил Орлов',
      reviewerId: null,
      reviewerName: null,
      status: 'CREATED',
      escrowAmount: 60,
      rewardAmount: 60,
      createdAt: iso(now, -4 * HOUR),
      takenAt: null,
      completedAt: null,
      expiresAt: iso(now, 20 * HOUR),
      checklist: SANDBOX_CHECKLIST.slice(0, 3),
      checklistResults: [],
      summary: '',
      accessTokenTtlSeconds: 900,
    },
    {
      id: 706,
      submissionId: 505,
      taskId: 15,
      taskTitle: 'Лабораторная №2: транзакции и блокировки',
      groupCode: 'IS-22',
      authorId: 106,
      authorName: 'Полина Зайцева',
      reviewerId: 103,
      reviewerName: 'Даниил Орлов',
      status: 'COMPLETED',
      escrowAmount: 100,
      rewardAmount: 90,
      createdAt: iso(now, -5 * DAY),
      takenAt: iso(now, -5 * DAY + HOUR),
      completedAt: iso(now, -4 * DAY),
      expiresAt: iso(now, -3 * DAY),
      checklist: SANDBOX_CHECKLIST.slice(0, 3),
      checklistResults: [
        { code: 'C1', passed: true },
        { code: 'C2', passed: false },
        { code: 'C3', passed: true },
      ],
      summary:
        'Транзакция открывается и закрывается корректно, но нет теста на deadlock. Без него сложно проверить блокировки.',
      accessTokenTtlSeconds: 900,
    },
    {
      id: 704,
      submissionId: 506,
      taskId: 11,
      taskTitle: 'Лабораторная №1: нормализация схемы',
      groupCode: 'IS-21',
      authorId: 103,
      authorName: 'Даниил Орлов',
      reviewerId: null,
      reviewerName: null,
      status: 'EXPIRED',
      escrowAmount: 70,
      rewardAmount: 70,
      createdAt: iso(now, -2 * DAY),
      takenAt: null,
      completedAt: null,
      expiresAt: iso(now, -4 * HOUR),
      checklist: SANDBOX_CHECKLIST.slice(0, 4),
      checklistResults: [],
      summary: '',
      accessTokenTtlSeconds: 900,
    },
  ];
}

/** Текущий on-time стрик студентов — нужен, чтобы вердикт показывал streak_after. */
export function seedStreaks(): Record<number, number> {
  return {
    101: 4,
    102: 7,
    103: 2,
    104: 5,
    105: 3,
    106: 6,
  };
}
