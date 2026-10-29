import bridge from '@vkontakte/vk-bridge';

// MAX (как и VK Сферум) открывает приложение внутри WebView и общается с ним
// через VK Bridge. Токенов MAX пока нет, поэтому инициализация — заглушка:
// в обычном браузере мы вообще не дёргаем runtime, а внутри клиента отправляем
// VKWebAppInit и мягко деградируем при ошибке/таймауте.

export interface MaxBridgeStatus {
  // supported — приложение открыто во встроенном WebView/iframe.
  supported: boolean;
  // initialized — VKWebAppInit принят клиентом.
  initialized: boolean;
  // reason — почему мост не поднялся; для диагностики, не для UI.
  reason?: string;
}

// Ограничение ожидания ответа клиента: зависший postMessage не должен
// блокировать отрисовку приложения.
const INIT_TIMEOUT_MS = 1_500;

let status: MaxBridgeStatus = {
  supported: false,
  initialized: false,
  reason: 'not-initialized',
};

let pending: Promise<MaxBridgeStatus> | null = null;

function fallback(reason: string): MaxBridgeStatus {
  status = { supported: false, initialized: false, reason };

  return status;
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === 'string') {
    return cause;
  }

  return 'unknown-error';
}

// detectEmbedded — единственная проверка среды. В обычном браузере
// bridge.isEmbedded() === false, поэтому сетевых и postMessage-вызовов нет.
function detectEmbedded(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return bridge.isEmbedded();
  } catch {
    return false;
  }
}

// getMaxBridgeStatus отдаёт текущее состояние моста (для отладки).
export function getMaxBridgeStatus(): MaxBridgeStatus {
  return status;
}

// initMaxBridge идемпотентен: повторные вызовы возвращают один и тот же промис.
// Функция никогда не reject-ит — обычный браузер обязан работать без ошибок.
export function initMaxBridge(): Promise<MaxBridgeStatus> {
  if (pending) {
    return pending;
  }

  if (!detectEmbedded()) {
    pending = Promise.resolve(fallback('standalone-browser'));

    return pending;
  }

  const timeout = new Promise<MaxBridgeStatus>((resolve) => {
    window.setTimeout(() => resolve(fallback('init-timeout')), INIT_TIMEOUT_MS);
  });

  const attempt = bridge
    .send('VKWebAppInit')
    .then<MaxBridgeStatus>(() => {
      status = { supported: true, initialized: true };

      return status;
    })
    .catch<MaxBridgeStatus>((cause: unknown) => {
      status = {
        supported: true,
        initialized: false,
        reason: `init-failed: ${describeError(cause)}`,
      };

      return status;
    });

  pending = Promise.race([attempt, timeout]);

  return pending;
}
