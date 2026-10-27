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
