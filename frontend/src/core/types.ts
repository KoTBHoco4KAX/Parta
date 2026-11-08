// DTO REST API ПАРТА, зеркальные spec/04_API.md и фактическим ответам backend.
// Держим их в одном месте: экраны не должны собирать JSON руками.

export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: number;
  external_id: string;
  role: Role;
  group_id: number | null;
  display_name: string;
  xp_balance: number;
  on_time_streak: number;
  streak_freezes: number;
}

export interface DevLoginResponse {
  token: string;
  user: User;
}

export type DemoAccount = 'student' | 'teacher' | 'admin';

export interface MaxOnboardingResponse {
  needs_onboarding: true;
  max_user_id: string;
  display_name: string;
}

export type MaxAuthResponse = DevLoginResponse | MaxOnboardingResponse;

export interface Group {
  id: number;
  code: string;
  title: string;
}

export interface CreateTaskRequest {
  assignment_id: number;
  /** Короткое ТЗ задания. */
  topic?: string;
  title: string;
  description_md: string;
  task_type: 'TEST' | 'NOTES' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';
  requirements_count: number;
  expected_hours: number;
  deadline_at: string;
  speedrun_window_hours: number;
  /** Бонус до (дата преподавателя); пусто — deadline − speedrun-окно. */
  speedrun_bonus_until?: string;
  team_size: number;
  /** Индивидуальная выдача: пусто — вся группа. */
  student_ids?: number[];
}

export interface CreateTaskResponse {
  task_id: number;
  base_xp_computed: number;
  status: string;
  slots_count?: number;
  speedrun_bonus_until?: string;
  attachments_count?: number;
}

export interface CreateSubmissionResponse {
  submission_id: number;
  status: string;
}

export type SubmissionStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'REJECTED';

export interface StatusResponse {
  submission_id: number;
  status: SubmissionStatus;
  submitted_at: string | null;
}

export interface VerdictResponse {
  submission_id: number;
  status: SubmissionStatus;
  xp_awarded?: number;
  streak_after?: number;
  ledger_id?: number;
  /** Награда рецензенту, если работу проверял другой ученик. */
  reward_xp?: number;
  reward_user_id?: number;
}

export interface PurchaseFreezesResponse {
  streak_freezes: number;
  xp_balance: number;
  ledger_id: number;
}

export interface ChecklistItem {
  code: string;
  title: string;
  weight: number;
}

export interface CreatePeerReviewRequest {
  submission_id: number;
  escrow_amount: number;
  expires_at: string;
  criteria_checklist: ChecklistItem[];
}

export interface CreatePeerReviewResponse {
  peer_review_id: number;
  status: string;
  escrow_tx_id: number;
}

export interface ClaimPeerReviewResponse {
  peer_review_id: number;
  status: string;
  reviewer_id: number;
  access_token: string;
}

export interface ChecklistResult {
  code: string;
  passed: boolean;
}

export interface CompletePeerReviewResponse {
  peer_review_id: number;
  status: string;
  reward_xp: number;
  ledger_id: number;
}

export interface CarryOverResponse {
  team_slot_id: number;
  assigned_user_id: number;
  status: string;
  bonus_xp: number;
}

export interface ApiErrorBody {
  error: string;
  code: string;
}

// Конверт WebSocket-события (spec/00_ARCHITECTURE.md §V).
export interface WsEvent<T = unknown> {
  event_id: string;
  event_type: string;
  timestamp: string;
  actor_id: number;
  room: string;
  payload: T;
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

// Read-модели GET /api/tasks, /api/submissions, /api/peer-reviews,
// /api/assignments. Имена полей повторяют JSON backend один в один.

export type TaskType = 'TEST' | 'NOTES' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';

export interface Task {
  id: number;
  assignment_id: number;
  title: string;
  /** Короткое ТЗ задания. */
  topic?: string;
  description_md: string;
  task_type: TaskType;
  requirements_count: number;
  expected_hours: number;
  deadline_at: string;
  speedrun_window_hours: number;
  /** Фактическая граница бонуса за спидран — от сервера. */
  speedrun_bonus_until: string;
  /** Файлы, приложенные преподавателем. */
  attachments?: { name: string; url: string; size: number }[];
  team_size: number;
  base_xp_computed: number;
  group_id: number;
  assigned_teacher_id: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Revision {
  at: string;
  actor_id: number;
  comment: string;
}

export interface Submission {
  id: number;
  task_id: number;
  student_id: number;
  team_slot_id: number | null;
  status: SubmissionStatus;
  artifact_url: string;
  artifact_hash: string;
  submitted_at: string | null;
  final_submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_id: number | null;
  revision_log: Revision[];
  task_title: string;
  task_type: TaskType;
  deadline_at: string;
  speedrun_window_hours: number;
  base_xp_computed: number;
  group_id: number;
  group_code: string;
  student_name: string;
  team_slot_role: string | null;
  attempt: number;
}

export interface PeerReview {
  id: number;
  submission_id: number;
  task_id: number;
  task_title: string;
  group_code: string;
  author_id: number;
  author_name: string;
  reviewer_id: number | null;
  reviewer_name: string | null;
  status: 'CREATED' | 'IN_REVIEW' | 'COMPLETED' | 'EXPIRED';
  /** Оценка рецензента 1–5 звёзд. */
  grade: number | null;
  /** Короткий комментарий (до 100 символов). */
  comment: string;
  created_at: string;
  taken_at: string | null;
  completed_at: string | null;
  expires_at: string;
  /** Сколько XP получит рецензент после приёмки работы учителем. */
  reward_xp: number;
}

export interface Assignment {
  id: number;
  group_id: number;
  group_code: string;
  group_title: string;
  discipline_id: number;
  discipline_code: string;
  discipline_title: string;
  teacher_name: string;
}

/** Заготовка задания в личной базе преподавателя. */
export interface TaskTemplate {
  id: number;
  teacher_id: number;
  discipline_id: number;
  discipline_code: string;
  discipline_title: string;
  title: string;
  description_md: string;
  task_type: TaskType;
  requirements_count: number;
  expected_hours: number;
  speedrun_window_hours: number;
  team_size: number;
  attachments?: { name: string; url: string; size: number }[];
  created_at: string;
}

/** Тело POST /api/task-templates. */
export interface CreateTaskTemplateRequest {
  discipline_id: number;
  title: string;
  description_md: string;
  task_type: TaskType;
  requirements_count: number;
  expected_hours: number;
  speedrun_window_hours: number;
  team_size: number;
}
