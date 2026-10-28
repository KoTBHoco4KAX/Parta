// UI-модели студенческого кабинета. Данные приходят из core/types (REST DTO),
// здесь остаётся только то, что нужно отрисовке.

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  xpReward: number;
}

export interface FileUpload {
  name: string;
  size: number;
}
