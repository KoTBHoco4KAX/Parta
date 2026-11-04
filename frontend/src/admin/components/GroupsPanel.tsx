import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../core/api';
import type { Group, User } from '../../core/types';
import {
  createGroup,
  deleteGroup,
  fetchGroups,
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
  EmptyState,
  ErrorState,
  Field,
  Modal,
  ScreenHeader,
  SelectInput,
  SkeletonList,
  TextInput,
} from '../../teacher/components/ui';
import { pluralize } from '../../teacher/lib/format';
import {
  IconAlert,
  IconChevronDown,
  IconLayers,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../../teacher/components/icons';

/**
 * GroupsPanel — учебные группы и их состав.
 *
 * Состав правится точечно: ученика можно перевести в другую группу или убрать
 * из неё (PATCH /api/users/{id} с group_id). Список «без группы» помогает
 * разобрать новых учеников после импорта.
 */
export function GroupsPanel({
  notify,
  reloadSignal = 0,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  reloadSignal?: number;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([fetchGroups(), fetchUsers()])
      .then(([nextGroups, nextUsers]) => {
        if (cancelled) {
          return;
        }

        setGroups(nextGroups);
        setUsers(nextUsers);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof ApiError ? cause.message : 'Не удалось загрузить группы.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, reloadSignal]);

  const byGroup = useMemo(() => {
    const map = new Map<number, User[]>();

    for (const user of users) {
      if (user.role !== 'student' || user.group_id === null) {
        continue;
      }

      const list = map.get(user.group_id) ?? [];
      list.push(user);
      map.set(user.group_id, list);
    }

    return map;
  }, [users]);

  const unassigned = useMemo(
    () => users.filter((user) => user.role === 'student' && user.group_id === null),
    [users],
  );

  async function moveUser(user: User, groupId: number | null) {
    setPendingUserId(user.id);

    try {
      const updated = await updateUserGroup(user.id, groupId);
      setUsers((previous) =>
        previous.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      notify({
        tone: 'success',
        title: groupId === null ? 'Ученик вне группы' : 'Ученик переведён',
        description: updated.display_name,
      });
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось обновить состав',
        description: cause instanceof ApiError ? cause.message : 'Проверьте соединение.',
      });
    } finally {
      setPendingUserId(null);
    }
  }

  async function handleDelete(group: Group) {
    try {
      await deleteGroup(group.id);
      setGroups((previous) => previous.filter((candidate) => candidate.id !== group.id));
      setDeleting(null);
      notify({ tone: 'success', title: 'Группа удалена', description: group.code });
    } catch (cause) {
      const blocked =
        cause instanceof ApiError && (cause.status === 422 || cause.code === 'guard_failed');

      notify({
        tone: 'error',
        title: blocked ? 'Группу нельзя удалить' : 'Не удалось удалить группу',
        description: blocked
          ? `${group.code}: есть назначения, задания или ученики. Переведите учеников и дождитесь закрытия заданий.`
          : cause instanceof ApiError
            ? cause.message
            : 'Проверьте соединение.',
      });
    }
  }

  return (
    <div>
      <ScreenHeader
        eyebrow="Потоки"
        title="Группы"
        description={`${groups.length} ${pluralize(groups.length, ['группа', 'группы', 'групп'])} · ${users.filter((user) => user.role === 'student').length} ${pluralize(users.filter((user) => user.role === 'student').length, ['ученик', 'ученика', 'учеников'])}`}
        action={
          <Button size="sm" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            Группа
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {!loading && error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {groups.length === 0 ? (
            <EmptyState
              icon={<IconLayers className="h-5 w-5" />}
              title="Групп ещё нет"
              description="Создайте поток, чтобы назначать на него преподавателей и выдавать задания."
              action={<Button onClick={() => setCreating(true)}>Создать группу</Button>}
            />
          ) : null}

          {groups.map((group) => {
            const members = (byGroup.get(group.id) ?? []).slice().sort((a, b) =>
              a.display_name.localeCompare(b.display_name, 'ru'),
            );
            const open = expanded === group.id;

            return (
              <Card key={group.id} className="p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brandSoft text-brandStrong">
                    <IconLayers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink">
                      {group.code}
                    </p>
                    <p className="truncate text-[10px] text-ink3">{group.title}</p>
                  </div>
                  <Badge tone="slate">
                    <IconUsers className="h-3 w-3" />
                    {members.length}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-ink3 hover:bg-badSoft hover:text-bad"
                    aria-label={`Удалить группу ${group.code}`}
                    onClick={() => setDeleting(group)}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-ink3 hover:bg-sunken"
                    aria-label={open ? 'Свернуть состав' : 'Показать состав'}
                    onClick={() => setExpanded(open ? null : group.id)}
                  >
                    <IconChevronDown
                      className={
                        open
                          ? 'h-4 w-4 rotate-180 transition'
                          : 'h-4 w-4 transition'
                      }
                    />
                  </Button>
                </div>

                {open ? (
                  <div className="mt-3 space-y-2">
                    {members.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-line2 px-3 py-2 text-[11px] text-ink3">
                        В группе нет учеников.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {members.map((member) => (
                          <li key={member.id} className="flex items-center gap-2">
                            <Avatar name={member.display_name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium text-ink2">
                                {member.display_name}
                              </p>
                              <p className="truncate text-[10px] text-ink3">
                                {member.external_id} · {member.xp_balance} XP
                              </p>
                            </div>
                            <SelectInput
                              aria-label={`Группа ${member.display_name}`}
                              className="w-auto min-w-[92px] py-1.5 text-[11px]"
                              value={String(group.id)}
                              disabled={pendingUserId === member.id}
                              onChange={(event) =>
                                void moveUser(
                                  member,
                                  event.target.value === 'none'
                                    ? null
                                    : Number(event.target.value),
                                )
                              }
                            >
                              {groups.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.code}
                                </option>
                              ))}
                              <option value="none">Без группы</option>
                            </SelectInput>
                          </li>
                        ))}
                      </ul>
                    )}

                    {unassigned.length > 0 ? (
                      <div className="rounded-lg border border-line bg-muted p-2.5">
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-ink3">
                          Добавить из списка без группы
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {unassigned.slice(0, 6).map((student) => (
                            <Button
                              key={student.id}
                              size="sm"
                              variant="outline"
                              loading={pendingUserId === student.id}
                              onClick={() => void moveUser(student, group.id)}
                            >
                              <IconPlus className="h-3 w-3" />
                              {student.display_name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}

          {unassigned.length > 0 ? (
            <Callout
              tone="amber"
              icon={<IconAlert className="h-4 w-4" />}
              title={`${unassigned.length} ${pluralize(unassigned.length, ['ученик без группы', 'ученика без группы', 'учеников без группы'])}`}
            >
              Раскройте нужную группу и добавьте ученика кнопкой или переведите через
              выпадающий список в составе.
            </Callout>
          ) : null}
        </div>
      ) : null}

      {creating ? (
        <CreateGroupModal
          notify={notify}
          onClose={() => setCreating(false)}
          onCreated={(group) => {
            setGroups((previous) => [...previous, group]);
            setCreating(false);
            setExpanded(group.id);
          }}
        />
      ) : null}

      {deleting ? (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="Удалить группу?"
          size="md"
          footer={
            <div className="flex w-full gap-2">
              <Button variant="ghost" block onClick={() => setDeleting(null)}>
                Отмена
              </Button>
              <Button variant="danger" block onClick={() => void handleDelete(deleting)}>
                Удалить группу
              </Button>
            </div>
          }
        >
          <p className="text-[12px] leading-relaxed text-ink2">
            {deleting.code} · {deleting.title}. В группе{' '}
            {(byGroup.get(deleting.id) ?? []).length}{' '}
            {pluralize((byGroup.get(deleting.id) ?? []).length, ['ученик', 'ученика', 'учеников'])}.
            Удаление возможно только если у группы нет назначений и карточек.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

/** CreateGroupModal — создание потока: код и расшифровка. */
function CreateGroupModal({
  notify,
  onClose,
  onCreated,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onCreated: (group: Group) => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const codeError = submitted && code.trim().length < 2;
  const titleError = submitted && title.trim().length < 3;

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (code.trim().length < 2 || title.trim().length < 3) {
      return;
    }

    setSubmitting(true);

    try {
      const group = await createGroup({ code: code.trim(), title: title.trim() });
      notify({
        tone: 'success',
        title: 'Группа создана',
        description: `${group.code} · ${group.title}`,
      });
      onCreated(group);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Не удалось создать группу.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новая группа"
      subtitle="Код потока и расшифровка"
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
            <Button block loading={submitting} onClick={() => void handleSubmit()}>
              Создать
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <Field
          label="Код"
          htmlFor="group-code"
          error={codeError ? 'Минимум 2 символа' : null}
          hint="Как в расписании: IS-23, P-21."
        >
          <TextInput
            id="group-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="IS-23"
            invalid={Boolean(codeError)}
          />
        </Field>

        <Field label="Расшифровка" htmlFor="group-title" error={titleError ? 'Минимум 3 символа' : null}>
          <TextInput
            id="group-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="ИС-23 Информационные системы"
            invalid={Boolean(titleError)}
          />
        </Field>
      </div>
    </Modal>
  );
}
