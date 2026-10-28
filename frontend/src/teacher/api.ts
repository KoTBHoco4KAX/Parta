import { ApiError, apiFetch } from '../core/api';
import { readStoredToken } from '../core/session';
import type {
  Assignment as AssignmentDto,
  CreateTaskResponse as CreateTaskResponseDto,
  PeerReview as PeerReviewDto,
  Submission,
  Task,
  TaskType,
  VerdictResponse,
} from '../core/types';
import type {
  InboxSubmission,
  PeerReview,
  ReviewerAwardResult,
  ReviewInboxItem,
  SubmissionAttachment,
  Verdict,
  VerdictResult,
} from './types';

// teacher/api.ts — маппинг REST DTO в модели кабинета преподавателя.
// Никаких моков: источники — GET /api/submissions и GET /api/peer-reviews.

function toInboxSubmission(item: Submission): InboxSubmission {
  const submittedAt = item.submitted_at ?? new Date().toISOString();

  return {
    id: item.id,
    taskId: item.task_id,
    taskTitle: item.task_title,
    taskType: item.task_type,
    groupId: item.group_id,
    groupCode: item.group_code,
    studentId: item.student_id,
    studentName: item.student_name,
    submittedAt,
    lockedAt: submittedAt,
    deadlineAt: item.deadline_at,
    speedrunWindowHours: item.speedrun_window_hours,
    baseXP: item.base_xp_computed,
    artifactUrl: item.artifact_url,
    artifactHash: item.artifact_hash,
    attempt: item.attempt,
    teamSlotRole: item.team_slot_role,
    revisions: item.revision_log.map((revision) => ({
      at: revision.at,
      comment: revision.comment,
      verdict: 'REJECT' as const,
    })),
  };
}

/** GET /api/submissions?status=REVIEW — работы, ждущие вердикта. */
export async function fetchReviewInbox(): Promise<ReviewInboxItem[]> {
  const submissions = await apiFetch<Submission[]>('/submissions?status=REVIEW');
  const now = Date.now();

  return submissions.map((submission) => {
    const item = toInboxSubmission(submission);
    const submittedAt = new Date(item.submittedAt).getTime();
    const deadlineAt = new Date(item.deadlineAt).getTime();

    return {
      ...item,
      waitingSeconds: Math.max(0, Math.round((now - submittedAt) / 1000)),
      onTime: submittedAt <= deadlineAt,
    };
  });
}

/** POST /api/submissions/{id}/verdict — REVIEW → DONE/REJECTED. */
export async function issueVerdict(input: {
  submissionId: number;
  verdict: Verdict;
  comment: string;
}): Promise<VerdictResult> {
  const response = await apiFetch<VerdictResponse>(
    `/submissions/${input.submissionId}/verdict`,
    {
      method: 'POST',
      body: { verdict: input.verdict, comment: input.comment.trim() },
    },
  );

  return {
    submissionId: response.submission_id,
    status: response.status,
    verdict: input.verdict,
    xpAwarded: response.xp_awarded ?? 0,
    streakAfter: response.streak_after ?? 0,
    reviewedAt: new Date().toISOString(),
  };
}

/** GET /api/peer-reviews — sandbox-сессии преподавателя. */
export async function fetchPeerReviewSessions(): Promise<PeerReview[]> {
  const reviews = await apiFetch<PeerReviewDto[]>('/peer-reviews');

  return reviews.map((review) => ({
    id: review.id,
    submissionId: review.submission_id,
    taskId: review.task_id,
    taskTitle: review.task_title,
    groupCode: review.group_code,
    authorId: review.author_id,
    authorName: review.author_name,
    reviewerId: review.reviewer_id,
    reviewerName: review.reviewer_name,
    status: review.status,
    escrowAmount: review.escrow_amount,
    rewardAmount: review.reward_amount,
    createdAt: review.created_at,
    takenAt: review.taken_at,
    completedAt: review.completed_at,
    expiresAt: review.expires_at,
    checklist: review.checklist,
    checklistResults: review.checklist_results,
    summary: review.summary,
    accessTokenTtlSeconds: review.access_token_ttl_seconds,
  }));
}

// TeacherAssignment — назначение «группа + дисциплина» для формы задачи.
export interface TeacherAssignment {
  id: number;
  groupCode: string;
  groupTitle: string;
  disciplineCode: string;
  disciplineTitle: string;
}

/** GET /api/assignments — назначения текущего преподавателя. */
export async function fetchTeacherAssignments(): Promise<TeacherAssignment[]> {
  const rows = await apiFetch<AssignmentDto[]>('/assignments');

  return rows.map((row) => ({
    id: row.id,
    groupCode: row.group_code,
    groupTitle: row.group_title,
    disciplineCode: row.discipline_code,
    disciplineTitle: row.discipline_title,
  }));
}

/** GET /api/tasks — задания преподавателя. */
export function fetchTeacherTasks(): Promise<Task[]> {
  return apiFetch<Task[]>('/tasks');
}

export interface TeacherTaskInput {
  assignmentId: number;
  title: string;
  descriptionMD: string;
  taskType: TaskType;
  requirementsCount: number;
  expectedHours: number;
  deadlineAt: string;
  speedrunWindowHours: number;
  teamSize: number;
}

/** POST /api/tasks — создание задания преподавателем. */
export async function createTeacherTask(
  input: TeacherTaskInput,
): Promise<{ taskId: number; baseXP: number; slotsCount: number }> {
  const response = await apiFetch<CreateTaskResponseDto>('/tasks', {
    method: 'POST',
    body: {
      assignment_id: input.assignmentId,
      title: input.title,
      description_md: input.descriptionMD,
      task_type: input.taskType,
      requirements_count: input.requirementsCount,
      expected_hours: input.expectedHours,
      deadline_at: input.deadlineAt,
      speedrun_window_hours: input.speedrunWindowHours,
      team_size: input.teamSize,
    },
  });

  return {
    taskId: response.task_id,
    baseXP: response.base_xp_computed,
    slotsCount: response.slots_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Вложения сдачи (Sprint 2): список и скачивание через /api/attachments.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return fallback;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeAttachment(value: unknown): SubmissionAttachment | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = firstNumber(record.id, record.attachment_id);
  if (id <= 0) {
    return null;
  }

  return {
    id,
    submissionId: firstNumber(record.submission_id),
    filename: firstString(record, ['filename', 'file_name', 'name'], `Файл #${id}`),
    sizeBytes: firstNumber(record.size_bytes, record.size, record.bytes),
    contentType: firstString(
      record,
      ['content_type', 'mime_type', 'mime'],
      'application/octet-stream',
    ),
    createdAt: firstString(record, ['created_at', 'uploaded_at'], ''),
  };
}

function extractAttachmentRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of ['attachments', 'items', 'data', 'files']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

/**
 * GET /api/attachments?submission_id={id} — файлы, прикреплённые студентом.
 *
 * Ответ принимается в двух формах: массив или `{ attachments | items | data }`.
 * 404 не маскируется: экран покажет ссылку на artifact_url как fallback.
 */
export async function fetchSubmissionAttachments(
  submissionId: number,
): Promise<SubmissionAttachment[]> {
  const payload = await apiFetch<unknown>(`/attachments?submission_id=${submissionId}`);

  return extractAttachmentRows(payload)
    .map(normalizeAttachment)
    .filter((item): item is SubmissionAttachment => item !== null);
}

/**
 * GET /api/attachments/{id} — скачивание файла.
 *
 * Файл отдаётся с JWT, поэтому обычный `<a href>` не подходит: запрос идёт
 * через fetch, а результат сохраняется объектным URL с именем из вложения.
 */
export async function downloadSubmissionAttachment(
  attachment: SubmissionAttachment,
): Promise<void> {
  const token = readStoredToken();
  const headers: Record<string, string> = { Accept: '*/*' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`/api/attachments/${attachment.id}`, { headers });

  if (!response.ok) {
    let code = 'download_failed';
    let message = `Не удалось скачать файл (${response.status})`;

    try {
      const payload = (await response.json()) as { error?: unknown; code?: unknown };
      if (typeof payload.error === 'string' && payload.error.trim() !== '') {
        message = payload.error;
      }
      if (typeof payload.code === 'string' && payload.code.trim() !== '') {
        code = payload.code;
      }
    } catch {
      // Тело не JSON — оставляем сообщение по HTTP-статусу.
    }

    throw new ApiError(response.status, code, message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = attachment.filename.trim() !== '' ? attachment.filename : `attachment-${attachment.id}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

// ---------------------------------------------------------------------------
// P2P: бонус рецензенту за качественную проверку.
// ---------------------------------------------------------------------------

/** Нормализованный ответ POST /api/peer-reviews/{id}/award. */
export interface AwardPeerReviewResult {
  amount: number;
  totalXp: number;
  ledgerId: string;
}

/** Тело запроса начисления бонуса рецензенту (UI-модель). */
export interface AwardPeerReviewBody {
  reviewerId: number;
  amount: number;
  comment?: string;
}

// ledgerIdOf приводит ledger_id из backend (int64 или строка) к строке.
function ledgerIdOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

/**
 * POST /api/peer-reviews/{id}/award — начисление бонусного XP рецензенту.
 *
 * Канонический контракт backend:
 * `200 {peer_review_id, reviewer_id, amount, total_xp, ledger_id}`.
 * Вся нормализация snake_case → UI-поля живёт здесь (DESIGN_SPEC §4.2), чтобы
 * компоненты читали только `amount` / `totalXp` / `ledgerId`.
 *
 * Вызывается только для COMPLETED-сессии: преподаватель не завершает ревью за
 * студента, но может отметить качество проверки.
 */
export async function awardPeerReview(
  id: number,
  body: AwardPeerReviewBody,
): Promise<{ amount: number; totalXp: number; ledgerId: string }> {
  const response = await apiFetch<Record<string, unknown>>(
    `/peer-reviews/${id}/award`,
    {
      method: 'POST',
      body: {
        reviewer_id: body.reviewerId,
        amount: body.amount,
        comment: body.comment?.trim() ?? '',
      },
    },
  );

  return {
    amount: firstNumber(response.amount, response.xp_awarded, body.amount),
    totalXp: firstNumber(
      response.total_xp,
      response.xp_balance,
      response.reward_xp,
    ),
    ledgerId: ledgerIdOf(response.ledger_id),
  };
}

/**
 * @deprecated Оставлен для обратной совместимости экспорта модуля.
 * Используйте `awardPeerReview()`: он возвращает `amount` / `totalXp` / `ledgerId`.
 */
export async function awardReviewerXP(input: {
  peerReviewId: number;
  reviewerId: number;
  amount: number;
  comment: string;
}): Promise<ReviewerAwardResult> {
  const result = await awardPeerReview(input.peerReviewId, {
    reviewerId: input.reviewerId,
    amount: input.amount,
    comment: input.comment,
  });

  return {
    peerReviewId: input.peerReviewId,
    reviewerId: input.reviewerId,
    xpAwarded: result.amount,
    ledgerId: Number(result.ledgerId) || 0,
    xpBalance: result.totalXp > 0 ? result.totalXp : null,
  };
}
