import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../core/auth';

// LoginPage — минимальная форма входа: без выбора роли и демо-подсказок.
// Роль приходит с сервера вместе с профилем, поэтому пользователю достаточно
// email и пароля. Оформление — токены темы Сферума (светлая/тёмная).
export function LoginPage() {
  const { login, busy, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    try {
      await login(email.trim(), password);
    } catch {
      // Текст ошибки уже в контексте.
    }
  }

  const emailError = submitted && email.trim() === '';
  const passwordError = submitted && password.trim() === '';

  return (
    <div className="flex min-h-screen justify-center bg-page">
      <div className="flex min-h-screen w-full max-w-md flex-col bg-page text-ink">
        <header className="flex items-center justify-between px-5 pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand">ПАРТА</p>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 flex-col justify-center px-5 pb-16">
          <div className="rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-medium text-ink2"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={[
                    'w-full rounded-lg border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
                    emailError ? 'border-bad' : 'border-line2',
                  ].join(' ')}
                />
                {emailError ? <p className="mt-1 text-[11px] text-bad">Введите email.</p> : null}
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium text-ink2"
                >
                  Пароль
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={[
                    'w-full rounded-lg border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine',
                    passwordError ? 'border-bad' : 'border-line2',
                  ].join(' ')}
                />
                {passwordError ? <p className="mt-1 text-[11px] text-bad">Введите пароль.</p> : null}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-badLine bg-badSoft p-3 text-sm text-bad"
                >
                  {error}
                </p>
              ) : null}

              <Button type="submit" block loading={busy}>
                Войти
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
