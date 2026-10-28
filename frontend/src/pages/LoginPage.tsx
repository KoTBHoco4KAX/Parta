import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ROLE_EMAILS, useAuth } from '../core/auth';
import type { Role } from '../core/types';

const ROLES: { role: Role; label: string }[] = [
  { role: 'student', label: 'Студент' },
  { role: 'teacher', label: 'Преподаватель' },
  { role: 'admin', label: 'Админ' },
];

// LoginPage — единая форма входа: email, пароль (в dev любой) и роль.
// Backend сверяет выбранную роль с ролью пользователя (POST /api/auth/login).
export function LoginPage() {
  const { login, busy, error } = useAuth();
  const [email, setEmail] = useState(ROLE_EMAILS.student);
  const [password, setPassword] = useState('demo');
  const [role, setRole] = useState<Role>('student');
  const [submitted, setSubmitted] = useState(false);

  function handleRole(next: Role) {
    setRole(next);
    setEmail((previous) => (previous === ROLE_EMAILS[role] ? ROLE_EMAILS[next] : previous));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    try {
      await login(email.trim(), password, role);
    } catch {
      // Текст ошибки уже в контексте.
    }
  }

  const emailError = submitted && email.trim() === '';
  const passwordError = submitted && password.trim() === '';

  return (
    <div className="flex min-h-screen justify-center bg-black">
      <div className="flex min-h-screen w-full max-w-md flex-col justify-center bg-slate-950 px-5 py-10 text-slate-100">
        <header className="mb-8 space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
          <h1 className="text-2xl font-semibold text-slate-50">Вход в приложение</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Выберите роль и войдите под своим email. Пароль в демо-контуре принимается
            любой.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-slate-300">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student1@parta.dev"
              className={[
                'w-full rounded-lg border bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                emailError ? 'border-rose-500' : 'border-slate-700',
              ].join(' ')}
            />
            {emailError ? <p className="mt-1 text-[11px] text-rose-400">Введите email.</p> : null}
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-slate-300">
              Пароль
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="любой пароль"
              className={[
                'w-full rounded-lg border bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                passwordError ? 'border-rose-500' : 'border-slate-700',
              ].join(' ')}
            />
            {passwordError ? <p className="mt-1 text-[11px] text-rose-400">Введите пароль.</p> : null}
          </div>

          <div>
            <label htmlFor="login-role" className="mb-1.5 block text-xs font-medium text-slate-300">
              Роль
            </label>
            <select
              id="login-role"
              value={role}
              onChange={(event) => handleRole(event.target.value as Role)}
              className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {ROLES.map((item) => (
                <option key={item.role} value={item.role}>
                  {item.label}
                </option>
              ))}
            </select>
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

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-400">
          <p className="font-medium text-slate-300">Демо-аккаунты</p>
          <p className="mt-1">Студент · student1@parta.dev</p>
          <p>Преподаватель · teacher@parta.dev</p>
          <p>Админ · admin@parta.dev</p>
        </div>
      </div>
    </div>
  );
}
