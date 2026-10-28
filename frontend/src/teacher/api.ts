import { apiFetch } from '../core/api';
import type { PeerReview as PeerReviewDto, Submission, VerdictResponse } from '../core/types';
import type {
  InboxSubmission,
  PeerReview,
  ReviewInboxItem,
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
