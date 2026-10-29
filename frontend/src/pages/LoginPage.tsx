import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { ROLE_EMAILS, useAuth } from '../core/auth';
import type { Role } from '../core/types';

const ROLES: { role: Role; label: string; hint: string }[] = [
  { role: 'student', label: 'Студент', hint: 'канбан' },
  { role: 'teacher', label: 'Преподаватель', hint: 'ревью' },
  { role: 'admin', label: 'Админ', hint: 'управление' },
];

// LoginPage — единая форма входа: email, пароль (в dev любой) и роль.
// Backend сверяет выбранную роль с ролью пользователя (POST /api/auth/login),
// а App.tsx по этой роли открывает студенческий, преподавательский или
// административный кабинет. Оформление — тёмная тема из DESIGN_SPEC.md.
export function LoginPage() {
  const { login, busy, error } = useAuth();
  const [email, setEmail] = useState(ROLE_EMAILS.student);
  const [password, setPassword] = useState('demo');
  const [role, setRole] = useState<Role>('student');
  const [submitted, setSubmitted] = useState(false);

  function handleRole(next: Role) {
    // Подставляем демо-email только если пользователь не ввёл свой.
    setEmail((previous) =>
      Object.values(ROLE_EMAILS).includes(previous) ? ROLE_EMAILS[next] : previous,
    );
    setRole(next);
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md">
        <header className="mb-5 space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
          <h1 className="text-2xl font-semibold text-slate-50">Вход в приложение</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            Выберите роль и войдите под своим email. Пароль в демо-контуре принимается
            любой.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/30 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div role="radiogroup" aria-labelledby="login-role-label">
              <span
                id="login-role-label"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Роль
              </span>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((item) => {
                  const active = role === item.role;

                  return (
                    <button
                      key={item.role}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleRole(item.role)}
                      className={[
                        'rounded-lg border px-2 py-2.5 text-center transition',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600 hover:text-slate-100',
                      ].join(' ')}
                    >
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span
                        className={[
                          'mt-0.5 block text-[10px]',
                          active ? 'text-emerald-300/80' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {item.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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
                placeholder="student1@parta.dev"
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
                placeholder="любой пароль"
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

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] leading-relaxed text-slate-400">
          <p className="font-medium text-slate-300">Демо-аккаунты</p>
          <p className="mt-1">Студент · student1@parta.dev</p>
          <p>Преподаватель · teacher@parta.dev</p>
          <p>Админ · admin@parta.dev</p>
        </div>
      </div>
    </div>
  );
}
