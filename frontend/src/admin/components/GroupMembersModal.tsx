import { useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Group, User } from '../../core/types';
import { Button } from '../../components/Button';
import { createUser, updateUserGroup } from '../api';
import type { ToastData } from '../types';
import { Badge, EmptyState, Modal, cn, inputClass } from './ui';
import { IconAlert, IconPlus, IconUsers, IconX } from './icons';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function isMember(user: User, group: Group): boolean {
  return user.role === 'student' && user.group_id === group.id;
}

/**
 * GroupMembersModal — состав учебной группы.
 *
 * Три операции: добавить существующего студента (PATCH group_id), убрать из
 * группы (PATCH group_id = null) и завести нового студента сразу в группу
 * (POST /api/users). После каждой мутации список перечитывается с сервера.
 */
export function GroupMembersModal({
  group,
  users,
  notify,
  onClose,
  onChanged,
}: {
  group: Group;
  users: User[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [addingExisting, setAddingExisting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickedUserId, setPickedUserId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  const members = useMemo(
    () => users.filter((user) => isMember(user, group)),
    [users, group],
  );

  const candidates = useMemo(
    () => users.filter((user) => user.role === 'student' && user.group_id !== group.id),
    [users, group],
  );

  const selectedCandidate = candidates.find(
    (user) => String(user.id) === pickedUserId,
  );

  function describeError(cause: unknown, fallback: string): string {
    if (cause instanceof ApiError) {
      if (cause.status === 404) {
        return 'Сервер пока не поддерживает изменение состава группы (PATCH /api/users/{id}).';
      }

      return cause.message;
    }

    return fallback;
  }

  async function handleRemove(user: User) {
    setBusyUserId(user.id);
    setError(null);

    try {
      await updateUserGroup(user.id, null);
      notify({
        tone: 'success',
        title: `${user.display_name} убран из ${group.code}`,
        description: 'Студент остался в системе без группы.',
      });
      await onChanged();
    } catch (cause) {
      setError(describeError(cause, 'Не удалось убрать студента из группы.'));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleAddExisting() {
    if (!selectedCandidate) {
      return;
    }

    setAddingExisting(true);
    setError(null);

    try {
      await updateUserGroup(selectedCandidate.id, group.id);
      notify({
        tone: 'success',
        title: `${selectedCandidate.display_name} добавлен в ${group.code}`,
        description: 'Студент увидит задания группы в TODO.',
      });
      setPickedUserId('');
      await onChanged();
    } catch (cause) {
      setError(describeError(cause, 'Не удалось добавить студента в группу.'));
    } finally {
      setAddingExisting(false);
    }
  }

  async function handleCreate() {
    const nextEmail = email.trim();
    const nextName = displayName.trim();

    if (nextEmail === '' || nextName === '') {
      setError('Заполните email и имя нового студента.');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await createUser({
        external_id: nextEmail,
        display_name: nextName,
        role: 'student',
        group_id: group.id,
      });

      notify({
        tone: 'success',
        title: `${created.display_name} добавлен в ${group.code}`,
        description: 'Студент создан и сразу привязан к группе.',
      });
      setEmail('');
      setDisplayName('');
      await onChanged();
    } catch (cause) {
      setError(describeError(cause, 'Не удалось создать студента.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Группа ${group.code}`}
      subtitle={`${group.title} · ${members.length} студентов`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            Состав группы влияет на выдачу задач и P2P-ревью.
          </p>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <IconUsers className="h-3.5 w-3.5 text-emerald-400" />
              Студенты в группе
            </h4>
            <Badge tone="slate">{members.length}</Badge>
          </div>

          {members.length === 0 ? (
            <div className="mt-2">
              <EmptyState
                icon={<IconUsers className="h-5 w-5" />}
                title="В группе нет студентов"
                description="Добавьте существующего студента или создайте нового ниже."
              />
            </div>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {members.map((user) => (
                <li
                  key={user.id}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-200">
                    {initials(user.display_name) || 'С'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-100">
                      {user.display_name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {user.external_id} · {user.xp_balance} XP
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busyUserId === user.id}
                    onClick={() => void handleRemove(user)}
                    aria-label={`Убрать ${user.display_name} из группы`}
                  >
                    <IconX className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Убрать</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h4 className="text-xs font-semibold text-slate-300">
            Добавить существующего студента
          </h4>

          {candidates.length === 0 ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Все студенты уже в этой группе. Нового можно создать ниже.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                value={pickedUserId}
                onChange={(event) => setPickedUserId(event.target.value)}
                className={cn(inputClass, 'sm:flex-1')}
                aria-label="Студент без этой группы"
              >
                <option value="">Выберите студента…</option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name} · {user.external_id}
                    {user.group_id === null ? ' · без группы' : ''}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                loading={addingExisting}
                disabled={!selectedCandidate}
                onClick={() => void handleAddExisting()}
              >
                <IconPlus className="h-4 w-4" />
                Добавить
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h4 className="text-xs font-semibold text-slate-300">Новый студент</h4>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            Аккаунт создаётся сразу в группе {group.code}.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@parta.dev"
              className={inputClass}
              aria-label="Email нового студента"
            />
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Имя и фамилия"
              className={inputClass}
              aria-label="Имя нового студента"
            />
          </div>
          <Button
            variant="primary"
            block
            className="mt-2"
            loading={creating}
            onClick={() => void handleCreate()}
          >
            <IconPlus className="h-4 w-4" />
            Создать и добавить в группу
          </Button>
        </section>
      </div>
    </Modal>
  );
}
