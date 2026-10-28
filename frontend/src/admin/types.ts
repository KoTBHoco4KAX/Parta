// Модели админки. Пользователи и группы приходят из core/types (REST DTO).

export interface ToastData {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
