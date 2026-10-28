/**
 * DTO преподавательского кабинета.
 *
 * Формы намеренно повторяют spec/02_FSM.md, spec/04_API.md и события WS из
 * spec/00_ARCHITECTURE.md §V. Слой данных — REST (`api.ts`), типы описывают
 * контракт между UI и backend; DTO — в `src/core/types.ts`.
 */

/** Типы заданий из CHECK `tasks.task_type` (spec/03_MATH.md §1). */
export type TaskType = 'TEST' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';

/** Статусы канбана из spec/02_FSM.md §1. */
export type SubmissionStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'REJECTED';

/** Вердикт преподавателя: оценок 2/3/4/5 в системе нет. */
export type Verdict = 'ACCEPT' | 'REJECT';

/** Статусы peer-review sandbox из spec/02_FSM.md §3. */
export type PeerReviewStatus = 'CREATED' | 'IN_REVIEW' | 'COMPLETED' | 'EXPIRED';

/** Группа студентов. */
export interface Group {
  id: number;
  code: string;
  title: string;
}

/** Запись журнала доработок: комментарий предыдущего отклонения. */
export interface RevisionEntry {
  at: string;
  comment: string;
  verdict: Verdict;
}

/** Работа, ожидающая вердикта в инбоксе преподавателя. */
export interface InboxSubmission {
  id: number;
  taskId: number;
  taskTitle: string;
  taskType: TaskType;
  groupId: number;
  groupCode: string;
  studentId: number;
  studentName: string;
  submittedAt: string;
  lockedAt: string;
  deadlineAt: string;
  speedrunWindowHours: number;
  /** Base XP задания; для TEAM_PROJECT — уже Slot Base XP. */
  baseXP: number;
  artifactUrl: string;
  artifactHash: string;
  /** Номер попытки: 1 — первая сдача, 2+ — после отклонения. */
  attempt: number;
  /** Роль командного слота (только TEAM_PROJECT). */
  teamSlotRole: string | null;
  revisions: RevisionEntry[];
}

/** Инбокс-элемент с вычисленным ожиданием (`review.inbox.created.waiting_seconds`). */
export interface ReviewInboxItem extends InboxSubmission {
  waitingSeconds: number;
  /** true, если submitted_at <= deadline_at. On-time считается по submitted_at. */
  onTime: boolean;
}

/** Результат вердикта — зеркало ответа `POST /api/submissions/{id}/verdict`. */
export interface VerdictResult {
  submissionId: number;
  status: SubmissionStatus;
  verdict: Verdict;
  xpAwarded: number;
  streakAfter: number;
  reviewedAt: string;
}

/** Критерий чек-листа peer-review. */
export interface ChecklistItem {
  code: string;
  title: string;
  weight: number;
}

/** Результат проверки критерия. */
export interface ChecklistResult {
  code: string;
  passed: boolean;
}

/** Peer-review sandbox-сессия (spec/04_API.md). */
export interface PeerReview {
  id: number;
  submissionId: number;
  taskId: number;
  taskTitle: string;
  groupCode: string;
  authorId: number;
  authorName: string;
  reviewerId: number | null;
  reviewerName: string | null;
  status: PeerReviewStatus;
  escrowAmount: number;
  rewardAmount: number;
  createdAt: string;
  takenAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  checklist: ChecklistItem[];
  checklistResults: ChecklistResult[];
  summary: string;
  /** TTL read-only токена в секундах (spec/02_FSM.md §3 — 15 минут). */
  accessTokenTtlSeconds: number;
}

/** Сортировка инбокса. */
export type InboxSort = 'waiting' | 'deadline';

/** Фильтр списка P2P-ревью. */
export type PeerReviewFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';

/**
 * Вложение, прикреплённое студентом к сдаче.
 * Контракт: `GET /api/attachments?submission_id={id}` (список) и
 * `GET /api/attachments/{id}` (поток файла).
 */
export interface SubmissionAttachment {
  id: number;
  submissionId: number;
  filename: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}

/** Результат `POST /api/peer-reviews/{id}/award` — бонус рецензенту. */
export interface ReviewerAwardResult {
  peerReviewId: number;
  reviewerId: number;
  xpAwarded: number;
  ledgerId: number;
  xpBalance: number | null;
}

/** Тост, которым приложение сообщает о результате действия. */
export interface ToastData {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
