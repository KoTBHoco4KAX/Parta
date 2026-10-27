import { useState } from 'react';
import { Button } from '../components/Button';
import { ROLE_EMAILS, useAuth } from '../core/auth';
import type { Role } from '../core/types';

const ROLES: { role: Role; title: string; description: string }[] = [
  { role: 'student', title: 'Студент', description: 'Канбан заданий, XP, стрик' },
  { role: 'teacher', title: 'Преподаватель', description: 'Инбокс работ на приёмку' },
  { role: 'admin', title: 'Админ', description: 'Полный доступ в dev' },
];

// LoginPage — dev-свитчер ролей (PARTA_ENV=dev), пароля нет по дизайну сида.
export function LoginPage() {
  const { login, busy, error } = useAuth();
  const [pending, setPending] = useState<Role | null>(null);

  const handleLogin = async (role: Role) => {
    setPending(role);

    try {
      await login(role);
    } catch {
      // Текст ошибки уже в контексте.
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 px-5 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">ПАРТА</p>
        <h1 className="text-3xl font-semibold text-slate-50">Вход в dev-режиме</h1>
        <p className="text-sm text-slate-400">
          Выберите роль — приложение запросит токен у <code className="text-slate-200">/api/auth/dev-login</code>.
          В проде этот экран заменит авторизация Сферум/MAX.
        </p>
      </header>

      <div className="space-y-3">
        {ROLES.map((item) => (
          <button
            key={item.role}
            type="button"
            disabled={busy}
            onClick={() => void handleLogin(item.role)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-emerald-500/60 hover:bg-slate-800 disabled:opacity-60"
          >
            <span className="flex items-center justify-between">
              <span className="font-medium text-slate-100">{item.title}</span>
              <span className="text-xs text-slate-500">{ROLE_EMAILS[item.role]}</span>
            </span>
            <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
            {pending === item.role ? <span className="mt-2 block text-xs text-emerald-400">Входим…</span> : null}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>
      ) : null}

      <Button variant="ghost" onClick={() => window.location.reload()}>
        Обновить страницу
      </Button>
    </div>
  );
}
