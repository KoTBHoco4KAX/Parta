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

export interface CreateTaskRequest {
  assignment_id: number;
  title: string;
  description_md: string;
  task_type: 'TEST' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';
  requirements_count: number;
  expected_hours: number;
  deadline_at: string;
  speedrun_window_hours: number;
  team_size: number;
}

export interface CreateTaskResponse {
  task_id: number;
  base_xp_computed: number;
  status: string;
  slots_count?: number;
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
}

export interface PurchaseFreezesResponse {
  streak_freezes: number;
  xp_balance: number;
  ledger_id: number;
}

export interface CreateWagerRequest {
  task_id: number;
  stake_amount: number;
  deadline_at: string;
}

export interface CreateWagerResponse {
  wager_id: number;
  status: string;
  escrow_tx_id: number;
  stake_amount: number;
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

// Read-модели GET /api/tasks, /api/submissions, /api/wagers, /api/peer-reviews,
// /api/assignments. Имена полей повторяют JSON backend один в один.

export type TaskType = 'TEST' | 'ESSAY' | 'LAB_CODE' | 'TEAM_PROJECT';

export interface Task {
  id: number;
  assignment_id: number;
  title: string;
  description_md: string;
  task_type: TaskType;
  requirements_count: number;
  expected_hours: number;
  deadline_at: string;
  speedrun_window_hours: number;
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

export interface Wager {
  id: number;
  task_id: number;
  task_title: string;
  task_deadline_at: string;
  stake_amount: number;
  deadline_at: string;
  status: 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';
  created_at: string;
  resolved_at: string | null;
  resolution_note: string;
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
  escrow_amount: number;
  reward_amount: number;
  created_at: string;
  taken_at: string | null;
  completed_at: string | null;
  expires_at: string;
  checklist: ChecklistItem[];
  checklist_results: ChecklistResult[];
  summary: string;
  access_token_ttl_seconds: number;
}

export interface Assignment {
  id: number;
  group_code: string;
  group_title: string;
  discipline_code: string;
  discipline_title: string;
  teacher_name: string;
}
