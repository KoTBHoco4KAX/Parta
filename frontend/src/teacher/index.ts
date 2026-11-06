export { default, default as TeacherApp } from './TeacherApp';
export type { TeacherTab } from './TeacherApp';

export { ProfileScreen } from './components/ProfileScreen';
export { GroupsScreen } from './components/GroupsScreen';
export { TaskBankScreen } from './components/TaskBankScreen';
export { TasksScreen } from './components/TasksScreen';
export { ReviewScreen } from './components/ReviewScreen';
export { AttachmentsPanel } from './components/AttachmentsPanel';

export type {
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
