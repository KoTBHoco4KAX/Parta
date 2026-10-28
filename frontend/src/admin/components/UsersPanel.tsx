import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../core/api';
import type { Group, Role, User } from '../../core/types';
import { Button } from '../../components/Button';
import { createUser, deleteUser, fetchGroups, fetchUsers } from '../api';
import type { ToastData } from '../types';
import { Badge, EmptyState, Skeleton, inputClass } from './ui';
import { IconAlert, IconPlus, IconUsers } from './icons';

const ROLE_LABEL: Record<Role, string> = {
  student: 'Студент',
  teacher: 'Преподаватель',
  admin: 'Админ',
};

// UsersPanel — единственное место админки, где меняются пользователи.
export function UsersPanel({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [groupId, setGroupId] = useState('');

  const load = useCallback(async () => {
    setError(null);

    try {
      const [nextUsers, nextGroups] = await Promise.all([fetchUsers(), fetchGroups()]);
      setUsers(nextUsers);
      setGroups(nextGroups);
      setGroupId((previous) => previous || String(nextGroups[0]?.id ?? ''));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить пользователей.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !displayName.trim()) {
      setError('Заполните email и имя пользователя.');
      return;
    }

    if (role === 'student' && !groupId) {
      setError('Студенту нужна группа.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await createUser({
        external_id: email.trim(),
        display_name: displayName.trim(),
        role,
        group_id: role === 'student' ? Number(groupId) : null,
      });

      notify({
        tone: 'success',
        title: 'Пользователь добавлен',
        description: `${created.display_name} · ${ROLE_LABEL[created.role]}`,
      });

      setEmail('');
      setDisplayName('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось добавить пользователя.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user: User) {
    if (!window.confirm(`Удалить ${user.display_name}?`)) {
      return;
    }

    setError(null);

    try {
      await deleteUser(user.id);
      notify({ tone: 'success', title: `Пользователь ${user.display_name} удалён` });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось удалить пользователя.');
    }
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <IconUsers className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Новый пользователь</h2>
        </div>

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="email@parta.dev"
          className={inputClass}
        />

        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Имя и фамилия"
          className={inputClass}
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className={inputClass}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>

          {role === 'student' ? (
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className={inputClass}
            >
              {groups.length === 0 ? <option value="">Нет групп</option> : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.code}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 px-3 text-[11px] text-slate-500">
              без группы
            </div>
          )}
        </div>

        <Button type="submit" block loading={submitting}>
          <IconPlus className="h-4 w-4" />
          Добавить
        </Button>
      </form>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Пользователи
          </h2>
          <Badge tone="slate">{users.length}</Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="h-5 w-5" />}
            title="Пользователей нет"
            description="Добавьте первого пользователя через форму выше."
          />
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
                  {user.display_name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {user.display_name}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">{user.external_id}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {ROLE_LABEL[user.role]}
                    {user.group_id ? ` · ${groupById.get(user.group_id)?.code ?? `#${user.group_id}`}` : ''}
                    {' · '}
                    {user.xp_balance} XP
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(user)}
                  aria-label={`Удалить ${user.display_name}`}
                >
                  Удалить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
