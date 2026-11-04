import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Group, Role, User } from '../../core/types';
import {
  createUser,
  deleteUser,
  fetchGroups,
  fetchSubmissions,
  fetchUsers,
  updateUserGroup,
} from '../api';
import type { ToastData } from '../types';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ScreenHeader,
  SelectInput,
  SkeletonList,
  TextInput,
} from '../../teacher/components/ui';
import { ROLE_LABEL, ROLE_TONE } from '../../teacher/lib/labels';
import { pluralize } from '../../teacher/lib/format';
import {
  IconAlert,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from '../../teacher/components/icons';

type RoleFilter = 'all' | Role;

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'student', label: 'Студенты' },
  { value: 'teacher', label: 'Преподаватели' },
  { value: 'admin', label: 'Админы' },
];

/**
 * UsersPanel — управление людьми контура.
 *
 * Один список с поиском и фильтрами: создать пользователя, сменить ему группу
 * (PATCH /api/users/{id}) и удалить. Роли назначаются только при создании —
 * backend не поддерживает смену роли существующего пользователя.
 */
export function UsersPanel({
  notify,
  currentUserId,
  reloadSignal = 0,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  currentUserId: number | null;
  reloadSignal?: number;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [busyStudentIds, setBusyStudentIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filter, setFilter] = useState<RoleFilter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [pendingGroup, setPendingGroup] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([fetchUsers(), fetchGroups(), fetchSubmissions()])
      .then(([nextUsers, nextGroups, submissions]) => {
        if (cancelled) {
          return;
        }

        setUsers(nextUsers);
        setGroups(nextGroups);
        setBusyStudentIds(new Set(submissions.map((submission) => submission.student_id)));
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError
            ? cause.message
            : 'Не удалось загрузить пользователей. Проверьте соединение.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users
      .filter((user) => {
        if (filter !== 'all' && user.role !== filter) {
          return false;
        }

        if (groupFilter === 'none' && user.group_id !== null) {
          return false;
        }

        if (groupFilter !== 'all' && groupFilter !== 'none') {
          if (user.group_id !== Number(groupFilter)) {
            return false;
          }
        }

        if (query === '') {
          return true;
        }

        return `${user.display_name} ${user.external_id}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const byRole = a.role.localeCompare(b.role);
        if (byRole !== 0) {
          return byRole;
        }

        return a.display_name.localeCompare(b.display_name, 'ru');
      });
  }, [users, filter, groupFilter, search]);

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((user) => user.role === 'student').length,
      teacher: users.filter((user) => user.role === 'teacher').length,
      admin: users.filter((user) => user.role === 'admin').length,
    }),
    [users],
  );

  const groupTitle = (id: number | null): string => {
    if (id === null) {
      return 'Без группы';
    }

    const group = groups.find((item) => item.id === id);

    return group ? group.code : `Группа #${id}`;
  };

  async function handleGroupChange(user: User, groupId: number | null) {
    setPendingGroup(user.id);

    try {
      const updated = await updateUserGroup(user.id, groupId);
      setUsers((previous) =>
        previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      notify({
        tone: 'success',
        title: 'Группа обновлена',
        description: `${updated.display_name} → ${groupTitle(updated.group_id)}`,
      });
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось сменить группу',
        description: cause instanceof ApiError ? cause.message : 'Проверьте соединение.',
      });
    } finally {
      setPendingGroup(null);
    }
  }

  async function handleDelete(user: User) {
    try {
      await deleteUser(user.id);
      setUsers((previous) => previous.filter((candidate) => candidate.id !== user.id));
      setDeleting(null);
      notify({ tone: 'success', title: 'Пользователь удалён', description: user.display_name });
    } catch (cause) {
      const blocked =
        cause instanceof ApiError && (cause.status === 422 || cause.code === 'guard_failed');

      notify({
        tone: 'error',
        title: blocked ? 'Удаление запрещено' : 'Не удалось удалить',
        description: blocked
          ? `${user.display_name}: у студента есть карточки заданий или сдачи. Закройте работы или оставьте аккаунт в группе.`
          : cause instanceof ApiError
            ? cause.message
            : 'Проверьте соединение.',
      });
    }
  }

  return (
    <div>
      <ScreenHeader
        eyebrow="Люди"
        title="Пользователи"
        description={`${counts.student} ${pluralize(counts.student, ['студент', 'студента', 'студентов'])} · ${counts.teacher} ${pluralize(counts.teacher, ['преподаватель', 'преподавателя', 'преподавателей'])}`}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            Добавить
          </Button>
        }
      />

      {loading ? <SkeletonList rows={4} /> : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя или email"
              aria-label="Поиск по имени или email"
              className="w-full rounded-lg border border-line2 bg-card py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brandLine"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ROLE_FILTERS.map((item) => (
              <Chip
                key={item.value}
                active={filter === item.value}
                onClick={() => setFilter(item.value)}
                count={counts[item.value]}
              >
                {item.label}
              </Chip>
            ))}
          </div>

          <SelectInput
            aria-label="Фильтр по группе"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
          >
            <option value="all">Все группы</option>
            <option value="none">Без группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.code} · {group.title}
              </option>
            ))}
          </SelectInput>

          {visible.length === 0 ? (
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title="Никого не найдено"
              description="Измените фильтр или добавьте пользователя."
              action={
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                  Добавить пользователя
                </Button>
              }
            />
          ) : (
            <div className="space-y-1.5">
              {visible.map((user) => (
                <Card key={user.id} className="p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={user.display_name} tone={ROLE_TONE[user.role]} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {user.display_name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                        {busyStudentIds.has(user.id) ? (
                          <Badge tone="slate">есть работы</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-ink3">
                        {user.external_id}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink3">
                        {groupTitle(user.group_id)} · {user.xp_balance} XP · стрик{' '}
                        {user.on_time_streak}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink3 hover:bg-badSoft hover:text-bad"
                      aria-label={
                        busyStudentIds.has(user.id)
                          ? `${user.display_name}: удаление недоступно — есть карточки работ`
                          : `Удалить ${user.display_name}`
                      }
                      title={
                        busyStudentIds.has(user.id)
                          ? 'Удаление недоступно: у студента есть карточки работ'
                          : undefined
                      }
                      disabled={user.id === currentUserId || busyStudentIds.has(user.id)}
                      onClick={() => setDeleting(user)}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {user.role === 'student' ? (
                    <div className="mt-2">
                      <SelectInput
                        aria-label={`Группа ${user.display_name}`}
                        value={user.group_id === null ? 'none' : String(user.group_id)}
                        disabled={pendingGroup === user.id}
                        onChange={(event) =>
                          void handleGroupChange(
                            user,
                            event.target.value === 'none' ? null : Number(event.target.value),
                          )
                        }
                      >
                        <option value="none">Без группы</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.code}
                          </option>
                        ))}
                      </SelectInput>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}

          <Callout tone="slate" icon={<IconAlert className="h-4 w-4" />} title="Ограничения backend">
            Роль задаётся только при создании: смена роли существующего пользователя
            не поддерживается API. Студента с карточками работ удалить нельзя —
            кнопка заблокирована, чтобы не терять историю сдач; преподавателя можно
            удалить, но его назначения останутся.
          </Callout>
        </div>
      ) : null}

      {creating ? (
        <CreateUserModal
          groups={groups}
          notify={notify}
          onClose={() => setCreating(false)}
          onCreated={(user) => {
            setUsers((previous) => [...previous, user]);
            setCreating(false);
          }}
        />
      ) : null}

      {deleting ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="Удалить пользователя?"
          size="md"
          footer={
            <div className="flex w-full gap-2">
              <Button variant="ghost" block onClick={() => setDeleting(null)}>
                Отмена
              </Button>
              <Button variant="danger" block onClick={() => void handleDelete(deleting)}>
                Удалить
              </Button>
            </div>
          }
        >
          <p className="text-[12px] leading-relaxed text-ink2">
            {deleting.display_name} ({deleting.external_id}) будет удалён из контура.
            Если у студента уже есть карточки заданий или сдачи, backend откажет:
            такие аккаунты остаются, чтобы не терять историю работ.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/** CreateUserModal — добавление пользователя с ролью и группой. */
function CreateUserModal({
  groups,
  notify,
  onClose,
  onCreated,
}: {
  groups: Group[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onCreated: (user: User) => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [groupValue, setGroupValue] = useState<string>(() =>
    groups.length > 0 ? String(groups[0].id) : 'none',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const emailError = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameError = submitted && displayName.trim().length < 2;
  // Backend заводит студента только с группой (handleCreateUser).
  const needsGroup = role === 'student' && groupValue === 'none';
  const noGroups = groups.length === 0;

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      displayName.trim().length < 2 ||
      needsGroup
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const user = await createUser({
        external_id: email.trim(),
        display_name: displayName.trim(),
        role,
        group_id: role === 'student' ? Number(groupValue) : null,
      });

      notify({
        tone: 'success',
        title: 'Пользователь создан',
        description: `${user.display_name} · ${ROLE_LABEL[user.role]}`,
      });
      onCreated(user);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось создать пользователя. Проверьте соединение.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новый пользователь"
      subtitle="Email используется как логин"
      size="md"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] text-bad">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button
              block
              loading={submitting}
              disabled={role === 'student' && noGroups}
              onClick={() => void handleSubmit()}
            >
              Создать
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Email" htmlFor="user-email" error={emailError ? 'Введите корректный email' : null}>
          <TextInput
            id="user-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="student4@parta.dev"
            invalid={Boolean(emailError)}
          />
        </Field>

        <Field label="Имя" htmlFor="user-name" error={nameError ? 'Минимум 2 символа' : null}>
          <TextInput
            id="user-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Смирнова А.А."
            invalid={Boolean(nameError)}
          />
        </Field>

        <Field label="Роль" hint="Роль нельзя изменить после создания.">
          <div className="flex gap-1.5">
            {(['student', 'teacher', 'admin'] as const).map((item) => (
              <Chip
                key={item}
                active={role === item}
                onClick={() => {
                  setRole(item);

                  if (item === 'student' && groupValue === 'none' && groups.length > 0) {
                    setGroupValue(String(groups[0].id));
                  }
                }}
              >
                {ROLE_LABEL[item]}
              </Chip>
            ))}
          </div>
        </Field>

        {role === 'student' ? (
          noGroups ? (
            <Callout tone="amber" icon={<IconAlert className="h-4 w-4" />} title="Нужна группа">
              Студент создаётся сразу с группой: сначала создайте поток в разделе
              «Группы», затем вернитесь сюда.
            </Callout>
          ) : (
            <Field
              label="Группа"
              htmlFor="user-group"
              hint="Backend заводит студента только с группой — перевести позже можно в разделе «Группы»."
              error={submitted && needsGroup ? 'Выберите группу' : null}
            >
              <SelectInput
                id="user-group"
                value={groupValue}
                onChange={(event) => setGroupValue(event.target.value)}
                invalid={submitted && needsGroup}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.code} · {group.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )
        ) : null}
      </div>
    </Modal>
  );
}
