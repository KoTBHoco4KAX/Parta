// API-слой кабинета ученика.
//
// ЕДИНАЯ ТОЧКА ЗАМЕНЫ МОКОВ НА backend: экраны импортируют только отсюда.
// Сейчас все вызовы уходят в mock/store.ts (read-эндпоинтов Фазы 7 ещё нет).
// Когда backend отдаст GET /api/tasks, /api/submissions и т.д. — тело каждой
// функции заменяется на apiFetch из core/api, сигнатуры менять не придётся.
import * as store from './mock/store';
import type {
  BoardSnapshot,
  LedgerEntry,
  Profile,
  PurchaseFreezesResult,
  SubmissionEvent,
} from './types';

export { FREEZE_PRICE } from './mock/store';

// subscribe — подписка на мутации мок-хранилища: экраны перечитывают данные
// (в реальной системе то же самое дают WS-события из core/ws).
export const subscribe = store.subscribe;

export function getBoard(): Promise<BoardSnapshot> {
  return store.getBoard();
}

// takeCard — START или REOPEN в зависимости от текущего статуса карточки.
export function takeCard(submissionId: number, event: SubmissionEvent): Promise<BoardSnapshot> {
  return store.moveCard(submissionId, event);
}

// submitWork — SUBMIT в REVIEW: требует артефакт (url + hash). В моке вердикт
// приходит сам через несколько секунд — возвращает обещание статуса REVIEW.
export function submitWork(
  submissionId: number,
  artifact: { url: string; hash: string },
): Promise<{ status: string }> {
  return store.moveCard(submissionId, 'SUBMIT', artifact).then(() => ({ status: 'REVIEW' }));
}

export function getProfile(): Promise<Profile> {
  return store.getProfile();
}

export function getLedger(): Promise<LedgerEntry[]> {
  return store.getLedger();
}

export function getStreakDays(): Promise<string[]> {
  return store.getStreakDays();
}

export function purchaseFreezes(quantity: number): Promise<PurchaseFreezesResult> {
  return store.purchaseFreezes(quantity);
}

export function purchaseTheme(themeId: string, price: number): Promise<{ xpBalance: number }> {
  return store.purchaseTheme(themeId, price);
}

