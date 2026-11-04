export { default, default as TeacherApp } from './TeacherApp';
export type { TeacherTab } from './TeacherApp';

export { OverviewScreen } from './components/OverviewScreen';
export { InboxScreen } from './components/InboxScreen';
export { TasksScreen } from './components/TasksScreen';
export { TeamsScreen } from './components/TeamsScreen';
export { PeerReviewScreen } from './components/PeerReviewScreen';
export { AttachmentsPanel } from './components/AttachmentsPanel';
export { ReviewerAwardModal } from './components/ReviewerAwardModal';

export type {
  ChecklistItem,
  ChecklistResult,
  InboxSort,
  PeerReview,
  PeerReviewStatus,
  ReviewInboxItem,
  SubmissionAttachment,
  SubmissionStatus,
  TaskType,
  ToastData,
  Verdict,
  VerdictResult,
} from './types';

export {
  awardPeerReview,
  createTeacherTask,
  fetchAllSubmissions,
  fetchGroupMembers,
  fetchPeerReviewSessions,
  fetchReviewInbox,
  fetchSubmissionAttachments,
  fetchTeacherAssignments,
  fetchTeacherTasks,
  issueVerdict,
} from './api';

export type {
  AwardPeerReviewBody,
  AwardPeerReviewResult,
  GroupMember,
  TeacherAssignment,
  TeacherTaskInput,
} from './api';

export {
  estimateBaseXP,
  estimateFinalXP,
  speedrunEndsAt,
  submissionWindow,
  xpMultiplier,
} from './lib/economy';

export type { SubmissionWindow } from './lib/economy';
