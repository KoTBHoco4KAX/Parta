import { ApiError, apiFetch } from '../core/api';
import { readStoredToken } from '../core/session';
import type {
  Assignment as AssignmentDto,
  CreateTaskResponse as CreateTaskResponseDto,
  CreateTaskTemplateRequest,
  Group,
  PeerReview as PeerReviewDto,
  Role,
  Submission,
  Task,
  TaskTemplate,
  TaskType,
  VerdictResponse,
} from '../core/types';
import type {
  InboxSubmission,
  PeerReview,
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

/** GET /api/peer-reviews — взаимопроверки учеников по потокам преподавателя. */
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
    grade: review.grade,
    comment: review.comment,
    rewardXp: review.reward_xp,
    createdAt: review.created_at,
    takenAt: review.taken_at,
    completedAt: review.completed_at,
    expiresAt: review.expires_at,
  }));
}

// TeacherAssignment — назначение «группа + дисциплина» для формы задачи.
export interface TeacherAssignment {
  id: number;
  groupId: number;
  groupCode: string;
  groupTitle: string;
  disciplineId: number;
  disciplineCode: string;
  disciplineTitle: string;
}

/** GET /api/assignments — назначения текущего преподавателя. */
export async function fetchTeacherAssignments(): Promise<TeacherAssignment[]> {
  const rows = await apiFetch<AssignmentDto[]>('/assignments');

  return rows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupCode: row.group_code,
    groupTitle: row.group_title,
    disciplineId: row.discipline_id,
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
  /** Короткое ТЗ задания. */
  topic: string;
  title: string;
  descriptionMD: string;
  taskType: TaskType;
  deadlineAt: string;
  speedrunWindowHours: number;
  /** Своя дата окончания бонуса ×1.5; пусто — автоматический расчёт. */
  speedrunBonusUntil?: string;
  teamSize: number;
  /** XP за задание, назначенный преподавателем. */
  xp?: number;
  /** Индивидуальная выдача: пусто — вся группа назначения. */
  studentIds?: number[];
  /** Файлы, приложенные преподавателем к заданию. */
  files?: File[];
}

/** POST /api/tasks — создание задания (multipart, если есть вложения). */
export async function createTeacherTask(
  input: TeacherTaskInput,
): Promise<{ taskId: number; baseXP: number; slotsCount: number; bonusUntil: string }> {
  const files = input.files ?? [];

  const fields: Record<string, string> = {
    topic: input.topic,
    title: input.title,
    description_md: input.descriptionMD,
    task_type: input.taskType,
    // Скрытые базовые значения: форма их не спрашивает, но старый backend
    // (до перехода на необязательные поля) без них отвечает invalid argument.
    requirements_count: '8',
    expected_hours: '4',
    deadline_at: input.deadlineAt,
    speedrun_window_hours: String(input.speedrunWindowHours),
    team_size: String(input.teamSize),
  };

  if (input.speedrunBonusUntil) {
    fields.speedrun_bonus_until = input.speedrunBonusUntil;
  }

  if (input.xp !== undefined && input.xp > 0) {
    fields.xp = String(input.xp);
  }

  let response: CreateTaskResponseDto;

  if (files.length === 0) {
    response = await apiFetch<CreateTaskResponseDto>('/tasks', {
      method: 'POST',
      body: {
        assignment_id: input.assignmentId,
        topic: input.topic,
        title: input.title,
        description_md: input.descriptionMD,
        task_type: input.taskType,
        requirements_count: 8,
        expected_hours: 4,
        deadline_at: input.deadlineAt,
        speedrun_window_hours: input.speedrunWindowHours,
        speedrun_bonus_until: input.speedrunBonusUntil,
        team_size: input.teamSize,
        xp: input.xp,
        student_ids: input.studentIds,
      },
    });
  } else {
    const form = new FormData();

    form.append('assignment_id', String(input.assignmentId));

    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }

    for (const studentId of input.studentIds ?? []) {
      form.append('student_ids', String(studentId));
    }

    for (const file of files) {
      form.append('file', file, file.name);
    }

    response = await apiFetch<CreateTaskResponseDto>('/tasks', { method: 'POST', body: form });
  }

  return {
    taskId: response.task_id,
    baseXP: response.base_xp_computed,
    slotsCount: response.slots_count ?? 0,
    bonusUntil: response.speedrun_bonus_until ?? '',
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

  const rawID = record.id ?? record.attachment_id;
  let id = '';

  if (typeof rawID === 'string') {
    id = rawID.trim();
  } else if (typeof rawID === 'number' && Number.isFinite(rawID) && rawID > 0) {
    id = String(rawID);
  }

  if (id === '') {
    return null;
  }

  return {
    id,
    submissionId: firstNumber(record.submission_id),
    filename: firstString(record, ['filename', 'file_name', 'name'], 'artifact'),
    sizeBytes: firstNumber(record.size_bytes, record.size, record.bytes),
    contentType: firstString(
      record,
      ['content_type', 'mime_type', 'mime'],
      'application/octet-stream',
    ),
    createdAt: firstString(record, ['created_at', 'uploaded_at'], ''),
    url: firstString(record, ['url', 'artifact_url'], ''),
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
 * GET /api/attachments?submission_id={id} — файлы, прикреплённые учеником.
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
 * GET /api/attachments/{id} — скачивание через 302 на artifact_url.
 *
 * Backend отдаёт redirect, поэтому fetch следует по нему и получает уже файл
 * (если внешний хост отдаёт CORS). Авторизация — JWT на первом запросе.
 * Если внешний artifact_url закрыт CORS, открываем его в новой вкладке: это
 * MVP-поведение до появления полноценного хранилища (BUGLOG BUG-001/002).
 */
export async function downloadSubmissionAttachment(
  attachment: SubmissionAttachment,
): Promise<void> {
  const token = readStoredToken();
  const headers: Record<string, string> = { Accept: '*/*' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(
      `/api/attachments/${encodeURIComponent(attachment.id)}`,
      { headers },
    );
  } catch {
    // CORS/сетевой барьер на внешнем artifact_url — безопасный fallback.
    if (attachment.url.trim() !== '') {
      window.open(attachment.url, '_blank', 'noopener,noreferrer');

      return;
    }

    throw new ApiError(0, 'network', 'Не удалось скачать файл. Проверьте соединение.');
  }

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
  link.download = attachmentFilename(attachment);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

// attachmentFilename выбирает имя для сохранения: имя из API, иначе из URL.
function attachmentFilename(attachment: SubmissionAttachment): string {
  const filename = attachment.filename.trim();

  if (filename !== '' && filename !== 'artifact') {
    return filename;
  }

  try {
    const segment = new URL(attachment.url).pathname.split('/').pop();
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    // URL относительный или битый — используем синтетическое имя.
  }

  return filename !== '' ? filename : `attachment-${attachment.id}`;
}


// ---------------------------------------------------------------------------
// Загрузка данных кабинета: сдачи целиком, состав групп, вложения.
// ---------------------------------------------------------------------------

/**
 * GET /api/submissions — все карточки преподавателя без фильтра по статусу.
 *
 * Инбоксу нужен только REVIEW, но обзору нагрузки и аудиту команд — вся
 * выборка, поэтому экраны читают один список и фильтруют его локально.
 */
export function fetchAllSubmissions(): Promise<Submission[]> {
  return apiFetch<Submission[]>('/submissions');
}

/** Участник потока из фильтрованного списка пользователей. */
export interface GroupMember {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  groupId: number | null;
}

/** Ответ GET /api/users?group_id= (контракт BUG-005). */
interface FilteredUsersResponse {
  items: {
    id: number;
    email: string;
    full_name: string;
    role: Role;
    group_id: number | null;
  }[];
}

/**
 * GET /api/users?group_id={id} — ученики конкретного потока.
 *
 * Доступен преподавателю только по его группам (backend сверяет
 * teacher_assignments), поэтому экраны не дублируют проверку прав.
 */
export async function fetchGroupMembers(groupId: number): Promise<GroupMember[]> {
  const response = await apiFetch<FilteredUsersResponse>(`/users?group_id=${groupId}`);

  return (response.items ?? []).map((item) => ({
    id: item.id,
    email: item.email,
    fullName: item.full_name,
    role: item.role,
    groupId: item.group_id,
  }));
}

// ---------------------------------------------------------------------------
// Группы преподавателя: список, создание, перевод и исключение учеников.
// ---------------------------------------------------------------------------

/** GET /api/groups — преподаватель видит только свои группы. */
export function fetchTeacherGroups(): Promise<Group[]> {
  return apiFetch<Group[]>('/groups');
}

/** POST /api/groups — группа сразу закрепляется за преподавателем. */
export function createTeacherGroup(input: {
  code: string;
  title: string;
  disciplineId: number;
}): Promise<Group> {
  return apiFetch<Group>('/groups', {
    method: 'POST',
    body: {
      code: input.code,
      title: input.title,
      discipline_id: input.disciplineId,
    },
  });
}

/** PATCH /api/users/{id} — перевод в другую группу или исключение (null). */
export async function updateUserGroup(userId: number, groupId: number | null): Promise<void> {
  await apiFetch<unknown>(`/users/${userId}`, {
    method: 'PATCH',
    body: { group_id: groupId },
  });
}

// ---------------------------------------------------------------------------
// База заданий: шаблоны, выдача и повтор.
// ---------------------------------------------------------------------------

/** GET /api/task-templates — личная база заданий преподавателя. */
export function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  return apiFetch<TaskTemplate[]>('/task-templates');
}

/** POST /api/task-templates — сохранить заготовку в базу. */
export async function createTaskTemplate(
  input: CreateTaskTemplateRequest,
  files: File[] = [],
): Promise<TaskTemplate> {
  if (files.length === 0) {
    return apiFetch<TaskTemplate>('/task-templates', { method: 'POST', body: input });
  }

  const form = new FormData();

  for (const [key, value] of Object.entries(input)) {
    form.append(key, String(value));
  }

  for (const file of files) {
    form.append('file', file, file.name);
  }

  return apiFetch<TaskTemplate>('/task-templates', { method: 'POST', body: form });
}

/** DELETE /api/task-templates/{id} — удалить заготовку. */
export async function deleteTaskTemplate(templateId: number): Promise<void> {
  await apiFetch<void>(`/task-templates/${templateId}`, { method: 'DELETE' });
}

export interface IssuedTaskResult {
  taskId: number;
  baseXP: number;
  slotsCount: number;
  bonusUntil: string;
}

function toIssuedTaskResult(response: CreateTaskResponseDto): IssuedTaskResult {
  return {
    taskId: response.task_id,
    baseXP: response.base_xp_computed,
    slotsCount: response.slots_count ?? 0,
    bonusUntil: response.speedrun_bonus_until ?? '',
  };
}

/** POST /api/task-templates/{id}/issue — выдать шаблон в поток. */
export async function issueTaskTemplate(
  templateId: number,
  input: {
    assignmentId: number;
    deadlineAt: string;
    speedrunWindowHours: number;
    speedrunBonusUntil?: string;
    studentIds?: number[];
  },
): Promise<IssuedTaskResult> {
  const response = await apiFetch<CreateTaskResponseDto>(
    `/task-templates/${templateId}/issue`,
    {
      method: 'POST',
      body: {
        assignment_id: input.assignmentId,
        deadline_at: input.deadlineAt,
        speedrun_window_hours: input.speedrunWindowHours,
        speedrun_bonus_until: input.speedrunBonusUntil,
        student_ids: input.studentIds,
      },
    },
  );

  return toIssuedTaskResult(response);
}

/** POST /api/tasks/{id}/repeat — выдать копию задания с новым дедлайном. */
export async function repeatTeacherTask(
  taskId: number,
  input: { deadlineAt: string; studentIds?: number[] },
): Promise<IssuedTaskResult> {
  const response = await apiFetch<CreateTaskResponseDto>(`/tasks/${taskId}/repeat`, {
    method: 'POST',
    body: {
      deadline_at: input.deadlineAt,
      student_ids: input.studentIds,
    },
  });

  return toIssuedTaskResult(response);
}

/**
 * teacherErrorMessage — человекочитаемая ошибка для тостов.
 *
 * Backend отдаёт машинный code и короткий текст; в интерфейсе показываем
 * понятную причину, а не «forbidden» или «invalid argument».
 */
export function teacherErrorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) {
    return fallback;
  }

  switch (cause.code) {
    case 'forbidden':
      return 'Действие доступно только для ваших групп и учеников.';
    case 'not_found':
      return 'Запись не найдена: возможно, её уже удалили. Обновите список.';
    case 'already_exists':
      return 'Такая запись уже есть. Проверьте код группы или название.';
    case 'invalid_argument':
      return 'Проверьте заполнение полей: сервер отклонил данные.';
    case 'guard_failed':
      return 'Действие нарушает ограничения: проверьте состав учеников и дедлайн.';
    case 'deadline_passed':
      return 'Дедлайн уже прошёл — выберите будущую дату.';
    case 'invalid_json':
      return 'Сервер не смог разобрать запрос. Обновите страницу и попробуйте снова.';
    default:
      return cause.message.trim() !== '' ? cause.message : fallback;
  }
}
