import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../core/auth';

// LoginPage — вход по email и паролю. Роль определяет сервер.
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

  const inputClass = (invalid: boolean) =>
    [
      'w-full rounded-lg border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink4 transition',
      'focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-ink/10',
      invalid ? 'border-bad' : 'border-line',
    ].join(' ');

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10rem] h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -right-24 bottom-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand/5 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(var(--c-line)/0.18)_1px,transparent_1px),linear-gradient(to_bottom,rgb(var(--c-line)/0.18)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold tracking-[0.24em] text-ink">ПАРТА</span>
            <span className="rounded-md border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink3">
              вход
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink4">
            Учебный контур
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Войти в ПАРТУ
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink3">
            Задания, канбан и обратная связь — в одном месте.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-7 space-y-3.5 rounded-xl border border-line/80 bg-card/80 p-4 backdrop-blur"
          noValidate
        >
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[11px] font-medium text-ink2">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass(emailError)}
            />
            {emailError ? <p className="mt-1 text-[11px] text-bad">Введите email.</p> : null}
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-[11px] font-medium text-ink2">
              Пароль
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass(passwordError)}
            />
            {passwordError ? <p className="mt-1 text-[11px] text-bad">Введите пароль.</p> : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-badLine bg-badSoft px-3 py-2 text-xs text-bad"
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
  );
}
