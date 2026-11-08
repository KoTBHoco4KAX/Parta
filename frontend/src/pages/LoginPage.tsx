import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../core/auth';
import type { DemoAccount } from '../core/types';

const DEMO_ACCOUNTS: {
  id: DemoAccount;
  title: string;
  subtitle: string;
}[] = [
  {
    id: 'student',
    title: 'Студент',
    subtitle: 'Канбан, задания, магазин и рейтинг',
  },
  {
    id: 'teacher',
    title: 'Преподаватель',
    subtitle: 'Группы, выдача заданий и проверка',
  },
  {
    id: 'admin',
    title: 'Администратор',
    subtitle: 'Пользователи, группы и назначения',
  },
];

const DEMO_CODES: Partial<Record<DemoAccount, string>> = {
  teacher: 'TEACHER2026',
  admin: 'ADMIN2026',
};

// LoginPage — демо-вход в браузере. Никаких произвольных email и паролей:
// только три фиксированных аккаунта из начального сида.
export function LoginPage() {
  const { demoLogin, busy, error } = useAuth();
  const [selected, setSelected] = useState<DemoAccount | null>(null);
  const [code, setCode] = useState('');

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      return;
    }

    try {
      await demoLogin(selected, code);
    } catch {
      // Текст ошибки уже в контексте.
    }
  }

  const selectedAccount = DEMO_ACCOUNTS.find((account) => account.id === selected) ?? null;
  const needsCode = selected !== null && selected !== 'student';

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-[22px] font-bold tracking-[0.18em] text-brand">ПАРТА</p>
          <p className="mt-1 text-[12px] text-ink3">Демо-доступ</p>
        </div>

        {!selected ? (
          <div className="mt-7 space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  setCode('');
                  setSelected(account.id);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-3 text-left transition hover:border-line2 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{account.title}</span>
                  <span className="mt-0.5 block text-[11px] text-ink3">{account.subtitle}</span>
                </span>
                <span className="shrink-0 text-[11px] text-brand">Войти</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-lg border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink4">Демо-аккаунт</p>
                <h1 className="mt-1 text-[15px] font-semibold text-ink">
                  {selectedAccount?.title}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setCode('');
                }}
                className="text-[11px] text-ink3 transition hover:text-ink"
              >
                Назад
              </button>
            </div>

            {selected === 'student' ? (
              <Button
                block
                className="mt-4"
                loading={busy}
                onClick={() => void demoLogin('student')}
              >
                Войти как студент
              </Button>
            ) : null}

            {needsCode ? (
              <form onSubmit={submitCode} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="demo-code"
                    className="mb-1.5 block text-[11px] font-medium text-ink2"
                  >
                    Код доступа
                  </label>
                  <input
                    id="demo-code"
                    type="password"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={selected === 'teacher' ? 'TEACHER2026' : 'ADMIN2026'}
                    className="w-full rounded-lg border border-line bg-page px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                  />
                  <p className="mt-1 text-[10px] text-ink4">
                    Демо-код: {DEMO_CODES[selected]}
                  </p>
                </div>

                <Button type="submit" block loading={busy} disabled={code.trim() === ''}>
                  Войти
                </Button>
              </form>
            ) : null}
          </div>
        )}

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
