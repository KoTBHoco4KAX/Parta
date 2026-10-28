export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate?: string;
  subject?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  xpReward: number;
}

export interface UserStats {
  xp: number;
  level: number;
  streak: number;
  freezes: number;
}

export interface Bet {
  id: string;
  opponent: string;
  amount: number;
  stake: string;
  status: 'pending' | 'active' | 'won' | 'lost';
}

export interface FileUpload {
  name: string;
  size: number;
}