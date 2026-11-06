import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Group } from '../../core/types';
import {
  createTeacherGroup,
  fetchGroupMembers,
  fetchTeacherAssignments,
  fetchTeacherGroups,
  teacherErrorMessage,
  updateUserGroup,
  type GroupMember,
  type TeacherAssignment,
} from '../api';
import type { ToastData } from '../types';
import { pluralize } from '../lib/format';
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
} from './ui';
import { IconAlert, IconPlus, IconUsers } from './icons';

/** TeacherGroup — группа из GET /api/groups (только свои для преподавателя). */
type TeacherGroup = Group;

interface DisciplineOption {
  id: number;
  code: string;
  title: string;
}

/**
 * GroupsScreen — управление потоками преподавателя.
 *
 * Список групп и состав приходят с backend: GET /api/groups для преподавателя
 * уже отфильтрован по teacher_assignments, а состав — через
 * GET /api/users?group_id. Перевод и исключение идут через
 * PATCH /api/users/{id}; backend запрещает трогать чужих учеников.
 */
export function GroupsScreen({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [members, setMembers] = useState<Record<number, GroupMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextAssignments, nextGroups] = await Promise.all([
        fetchTeacherAssignments(),
        fetchTeacherGroups(),
      ]);

      const rosters = await Promise.all(
        nextGroups.map(async (group) => ({
          groupId: group.id,
          members: await fetchGroupMembers(group.id),
        })),
      );

      const byGroup: Record<number, GroupMember[]> = {};
      for (const roster of rosters) {
        byGroup[roster.groupId] = roster.members;
      }

      setAssignments(nextAssignments);
      setGroups(nextGroups);
      setMembers(byGroup);
    } catch (cause) {
      setError(teacherErrorMessage(cause, 'Не удалось загрузить группы. Проверьте соединение.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const disciplines = useMemo<DisciplineOption[]>(() => {
    const unique = new Map<number, DisciplineOption>();

    for (const assignment of assignments) {
      if (!unique.has(assignment.disciplineId)) {
        unique.set(assignment.disciplineId, {
          id: assignment.disciplineId,
          code: assignment.disciplineCode,
          title: assignment.disciplineTitle,
        });
      }
    }

    return [...unique.values()];
  }, [assignments]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  const totalStudents = Object.values(members).reduce((sum, list) => sum + list.length, 0);

  return (
    <div>
      <ScreenHeader
        eyebrow="Группы"
        title="Мои группы"
        description={
          groups.length > 0
            ? `${groups.length} ${pluralize(groups.length, ['поток', 'потока', 'потоков'])} · ${totalStudents} ${pluralStudents(totalStudents)}`
            : 'Здесь появятся потоки, закреплённые за вами.'
        }
        action={
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            disabled={disciplines.length === 0}
          >
            <IconPlus className="h-4 w-4" />
            Группа
          </Button>
        }
      />

      {loading ? <SkeletonList rows={3} /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error ? (
        <div className="space-y-3">
          {disciplines.length === 0 ? (
            <Callout
              tone="amber"
              icon={<IconAlert className="h-4 w-4" />}
              title="Нет дисциплин для создания групп"
            >
              Создание группы станет доступно после назначения на дисциплину. Этим
              управляет администратор.
            </Callout>
          ) : null}

          {groups.length === 0 ? (
            <EmptyState
              icon={<IconUsers className="h-5 w-5" />}
              title="Групп пока нет"
              description="Создайте поток: он сразу закрепится за вами, и вы сможете выдавать в него задания."
              action={
                <Button
                  onClick={() => setCreating(true)}
                  disabled={disciplines.length === 0}
                >
                  <IconPlus className="h-4 w-4" />
                  Создать группу
                </Button>
              }
            />
          ) : null}

          {groups.map((group) => {
            const roster = members[group.id] ?? [];
            const groupDisciplines = disciplinesForGroup(assignments, group.id);

            return (
              <Card key={group.id} className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brandSoft text-brandStrong">
                    <IconUsers className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="truncate text-sm font-semibold text-ink">{group.code}</h2>
                      <Badge tone="slate">
                        {roster.length} {pluralStudents(roster.length)}
                      </Badge>
                      {groupDisciplines.map((discipline) => (
                        <Badge key={discipline.id} tone="indigo">
                          {discipline.title}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink3">{group.title}</p>
                  </div>
                </div>

                {roster.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line2 px-3 py-2.5 text-[11px] text-ink3">
                    В группе пока нет учеников. Перевести студента можно из другой
                    вашей группы.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {roster.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        currentGroupId={group.id}
                        groups={groups}
                        notify={notify}
                        onChanged={reload}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}

      {creating ? (
        <CreateGroupModal
          disciplines={disciplines}
          notify={notify}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

/** MemberRow — ученик группы и его перевод/исключение. */
function MemberRow({
  member,
  currentGroupId,
  groups,
  notify,
  onChanged,
}: {
  member: GroupMember;
  currentGroupId: number;
  groups: TeacherGroup[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onChanged: () => void;
}) {
  const targets = groups.filter((group) => group.id !== currentGroupId);
  const [targetGroupID, setTargetGroupID] = useState<number>(targets[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);

  async function move() {
    if (targetGroupID <= 0 || busy) {
      return;
    }

    setBusy(true);

    try {
      await updateUserGroup(member.id, targetGroupID);
      notify({
        tone: 'success',
        title: 'Ученик переведён',
        description: `${member.fullName} — в группу ${
          groups.find((group) => group.id === targetGroupID)?.code ?? targetGroupID
        }.`,
      });
      onChanged();
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось перевести',
        description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function exclude() {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      await updateUserGroup(member.id, null);
      notify({
        tone: 'success',
        title: 'Ученик исключён из группы',
        description: `${member.fullName} больше не состоит в этой группе.`,
      });
      onChanged();
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось исключить',
        description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Avatar name={member.fullName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-ink">{member.fullName}</p>
          <p className="truncate text-[10px] text-ink3">{member.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <SelectInput
          value={String(targetGroupID)}
          onChange={(event) => setTargetGroupID(Number(event.target.value))}
          aria-label={`Перевести ${member.fullName} в группу`}
          className="min-w-[8.5rem] py-1.5 text-xs"
          disabled={busy || targets.length === 0}
        >
          {targets.length === 0 ? <option value="0">Других групп нет</option> : null}
          {targets.map((group) => (
            <option key={group.id} value={group.id}>
              {group.code}
            </option>
          ))}
        </SelectInput>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || targets.length === 0 || targetGroupID <= 0}
          onClick={() => void move()}
        >
          Перевести
        </Button>
        <Button
          size="sm"
          variant="reject"
          disabled={busy}
          onClick={() => void exclude()}
        >
          Исключить
        </Button>
      </div>
    </li>
  );
}

/** CreateGroupModal — создание группы с дисциплиной из назначений. */
function CreateGroupModal({
  disciplines,
  notify,
  onClose,
  onCreated,
}: {
  disciplines: DisciplineOption[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [disciplineID, setDisciplineID] = useState(disciplines[0]?.id ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeError = submitted && code.trim() === '' ? 'Укажите код группы' : null;
  const titleError = submitted && title.trim() === '' ? 'Укажите название' : null;

  async function handleSubmit() {
    setSubmitted(true);
    setError(null);

    if (code.trim() === '' || title.trim() === '' || disciplineID <= 0) {
      return;
    }

    setSubmitting(true);

    try {
      const group = await createTeacherGroup({
        code: code.trim(),
        title: title.trim(),
        disciplineId: disciplineID,
      });

      notify({
        tone: 'success',
        title: 'Группа создана',
        description: `${group.code} · ${group.title} закреплена за вами.`,
      });
      onCreated();
    } catch (cause) {
      setError(teacherErrorMessage(cause, 'Не удалось создать группу. Проверьте соединение.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Новая группа"
      subtitle="Группа сразу появится в вашем списке и в форме выдачи заданий"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error ? (
            <p role="alert" className="text-[11px] leading-relaxed text-bad">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button block loading={submitting} onClick={() => void handleSubmit()}>
              <IconPlus className="h-4 w-4" />
              Создать
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Код группы" htmlFor="group-code" error={codeError}>
          <TextInput
            id="group-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ИС-23"
            invalid={Boolean(codeError)}
            autoFocus
          />
        </Field>

        <Field label="Название" htmlFor="group-title" error={titleError}>
          <TextInput
            id="group-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Информационные системы, 2 курс"
            invalid={Boolean(titleError)}
          />
        </Field>

        <Field
          label="Дисциплина"
          htmlFor="group-discipline"
          hint="Из дисциплин, на которые вас назначил администратор."
        >
          <SelectInput
            id="group-discipline"
            value={String(disciplineID)}
            onChange={(event) => setDisciplineID(Number(event.target.value))}
          >
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.code} · {discipline.title}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );
}

/** disciplinesForGroup — дисциплины группы по назначениям преподавателя. */
function disciplinesForGroup(
  assignments: TeacherAssignment[],
  groupID: number,
): DisciplineOption[] {
  const unique = new Map<number, DisciplineOption>();

  for (const assignment of assignments) {
    if (assignment.groupId !== groupID || unique.has(assignment.disciplineId)) {
      continue;
    }

    unique.set(assignment.disciplineId, {
      id: assignment.disciplineId,
      code: assignment.disciplineCode,
      title: assignment.disciplineTitle,
    });
  }

  return [...unique.values()];
}

function pluralStudents(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'ученик';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'ученика';
  }

  return 'учеников';
}
