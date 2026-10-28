// Единое место хранения сессии: ключ localStorage и чтение токена.
// Импортируется и auth-провайдером, и fetch-слоем, чтобы ключ не дублировался.

export const AUTH_STORAGE_KEY = 'parta.auth';

// readStoredToken читает JWT из localStorage без побочных эффектов.
export function readStoredToken(): string | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { token?: unknown };
    if (typeof parsed.token !== 'string' || parsed.token === '') {
      return null;
    }

    return parsed.token;
  } catch {
    return null;
  }
}
