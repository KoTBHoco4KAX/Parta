import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../core/auth';
import type { Role } from '../core/types';

type Step = 'roles' | 'confirm' | 'teacher' | 'admin';

const ROLE_CARDS: { id: Role; title: string; subtitle: string; step: Step }[] = [
  {
    id: 'student',
    title: 'Я студент',
    subtitle: 'Канбан, задания и магазин',
    step: 'confirm',
  },
  {
    id: 'teacher',
    title: 'Я преподаватель',
    subtitle: 'Нужен код доступа преподавателя',
    step: 'teacher',
  },
  {
    id: 'admin',
    title: 'Я администратор',
    subtitle: 'Нужен секретный код администратора',
    step: 'admin',
  },
];

// MaxOnboardingPage — первый вход через MAX: роль выбирается один раз.
export function MaxOnboardingPage() {
  const { maxOnboarding, registerMax, busy, error } = useAuth();
  const [step, setStep] = useState<Step>('roles');
  const [code, setCode] = useState('');

  if (!maxOnboarding) {
    return null;
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step !== 'teacher' && step !== 'admin') {
      return;
    }

    try {
      await registerMax(step, code);
    } catch {
      // Ошибка уже в контексте.
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-[22px] font-bold tracking-[0.18em] text-brand">ПАРТА</p>
          <p className="mt-1 text-[12px] text-ink3">Первый вход через MAX</p>
        </div>

        <div className="mt-6 rounded-lg border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-ink4">Пользователь MAX</p>
              <h1 className="mt-1 truncate text-[15px] font-semibold text-ink">
                {maxOnboarding.displayName}
              </h1>
              <p className="mt-0.5 truncate text-[10px] text-ink3">
                ID {maxOnboarding.maxUserId}
              </p>
            </div>
            {step !== 'roles' ? (
              <button
                type="button"
                onClick={() => {
                  setStep('roles');
                  setCode('');
                }}
                className="shrink-0 text-[11px] text-ink3 transition hover:text-ink"
              >
                Назад
              </button>
            ) : null}
          </div>

          {step === 'roles' ? (
            <div className="mt-4 space-y-2">
              <p className="text-[12px] text-ink2">Выберите роль</p>
              {ROLE_CARDS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    setCode('');
                    setStep(role.step);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-page px-3 py-2.5 text-left transition hover:border-line2 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{role.title}</span>
                    <span className="mt-0.5 block text-[10px] text-ink3">{role.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-brand">Выбрать</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 'confirm' ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] font-medium text-ink">Вы уверены?</p>
              <p className="text-[11px] leading-relaxed text-ink3">
                Аккаунт студента будет создан с этим MAX ID. Роль потом сможет
                изменить администратор.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setStep('roles')}
                  disabled={busy}
                >
                  Назад
                </Button>
                <Button
                  className="flex-1"
                  loading={busy}
                  onClick={() => void registerMax('student')}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          ) : null}

          {step === 'teacher' || step === 'admin' ? (
            <form onSubmit={submitCode} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="invite-code"
                  className="mb-1.5 block text-[11px] font-medium text-ink2"
                >
                  {step === 'teacher' ? 'Код преподавателя' : 'Код администратора'}
                </label>
                <input
                  id="invite-code"
                  type="password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-line bg-page px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
              </div>
              <Button
                type="submit"
                block
                loading={busy}
                disabled={code.trim() === ''}
              >
                Создать аккаунт
              </Button>
            </form>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-badLine bg-badSoft px-3 py-2 text-xs text-bad"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
