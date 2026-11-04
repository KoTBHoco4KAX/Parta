import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { useAuth } from '../core/auth';

// LoginPage — минимальная форма входа: без выбора роли и демо-подсказок.
// Роль приходит с сервера вместе с профилем, поэтому пользователю достаточно
// email и пароля.
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md">
        <header className="mb-5 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/30 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-xs font-medium text-slate-300"
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
                  'w-full rounded-lg border bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                  emailError ? 'border-rose-500' : 'border-slate-700',
                ].join(' ')}
              />
              {emailError ? (
                <p className="mt-1 text-[11px] text-rose-400">Введите email.</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-xs font-medium text-slate-300"
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
                  'w-full rounded-lg border bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                  passwordError ? 'border-rose-500' : 'border-slate-700',
                ].join(' ')}
              />
              {passwordError ? (
                <p className="mt-1 text-[11px] text-rose-400">Введите пароль.</p>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
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
  );
}
