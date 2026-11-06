import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../core/auth';

// LoginPage — строгий вход в стиле VK UI: ровный фон, синий акцент, без декора.
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
      'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15',
      invalid ? 'border-bad' : 'border-line',
    ].join(' ');

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-[22px] font-bold tracking-[0.18em] text-brand">ПАРТА</p>
          <p className="mt-1 text-[12px] text-ink3">Учебная платформа</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
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
