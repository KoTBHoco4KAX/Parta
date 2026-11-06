import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Group } from '../../core/types';
import {
  createTeacherGroup,
  fetchAllStudents,
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
import { Select } from '../../components/Select';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  EmptyState,
  ErrorState,
  Field,
  Modal,
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
  const [allStudents, setAllStudents] = useState<GroupMember[]>([]);
  const [addingGroup, setAddingGroup] = useState<TeacherGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextAssignments, nextGroups, nextAllStudents] = await Promise.all([
        fetchTeacherAssignments(),
        fetchTeacherGroups(),
        fetchAllStudents(),
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
      setAllStudents(nextAllStudents);
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
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink3">
          {groups.length} {pluralize(groups.length, ['поток', 'потока', 'потоков'])} ·{' '}
          {totalStudents} {pluralStudents(totalStudents)}
        </p>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          disabled={disciplines.length === 0}
        >
          <IconPlus className="h-4 w-4" />
          Группа
        </Button>
      </div>

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
              <section
                key={group.id}
                className="border-b border-line pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-2.5 py-2">
                  <IconUsers className="mt-0.5 h-4 w-4 shrink-0 text-ink3" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="truncate text-sm font-semibold text-ink">{group.code}</h2>
                      <span className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink3">
                        {roster.length} {pluralStudents(roster.length)}
                      </span>
                      {groupDisciplines.map((discipline) => (
                        <Badge key={discipline.id} tone="slate">
                          {discipline.title}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink3">{group.title}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => setAddingGroup(group)}
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    Добавить
                  </Button>
                </div>

                {roster.length === 0 ? (
                  <p className="py-2 text-[11px] text-ink4">В группе пока нет учеников.</p>
                ) : (
                  <ul className="divide-y divide-line/60">
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
              </section>
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

      {addingGroup ? (
        <AssignStudentModal
          group={addingGroup}
          students={allStudents}
          notify={notify}
          onClose={() => setAddingGroup(null)}
          onAssigned={() => {
            setAddingGroup(null);
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
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={member.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-ink">{member.fullName}</p>
          <p className="truncate text-[10px] text-ink3">{member.email}</p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setMoving(true)}>
          Перевести
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-bad hover:bg-badSoft"
          disabled={busy}
          onClick={() => void exclude()}
        >
          Исключить
        </Button>
      </div>

      {moving ? (
        <MoveStudentModal
          member={member}
          currentGroupId={currentGroupId}
          groups={groups}
          notify={notify}
          onClose={() => setMoving(false)}
          onMoved={() => {
            setMoving(false);
            onChanged();
          }}
        />
      ) : null}
    </li>
  );
}

/** MoveStudentModal — выбор группы для перевода ученика. */
function MoveStudentModal({
  member,
  currentGroupId,
  groups,
  notify,
  onClose,
  onMoved,
}: {
  member: GroupMember;
  currentGroupId: number;
  groups: TeacherGroup[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onMoved: () => void;
}) {
  const targets = groups.filter((group) => group.id !== currentGroupId);
  const [busyID, setBusyID] = useState<number | null>(null);

  async function move(group: TeacherGroup) {
    if (busyID !== null) {
      return;
    }

    setBusyID(group.id);

    try {
      await updateUserGroup(member.id, group.id);
      notify({
        tone: 'success',
        title: 'Ученик переведён',
        description: `${member.fullName} — в группу ${group.code}.`,
      });
      onMoved();
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось перевести',
        description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
      });
      setBusyID(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Перевести ученика"
      subtitle={member.fullName}
      footer={
        <Button variant="ghost" block onClick={onClose} disabled={busyID !== null}>
          Отмена
        </Button>
      }
    >
      {targets.length === 0 ? (
        <p className="text-xs text-ink3">
          Других ваших групп нет. Создайте группу, чтобы перевести ученика.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {targets.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                disabled={busyID !== null}
                onClick={() => void move(group)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition hover:border-line2 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-ink">{group.code}</span>
                  <span className="block truncate text-[10px] text-ink3">{group.title}</span>
                </span>
                <span className="shrink-0 text-[11px] text-brand">
                  {busyID === group.id ? 'Переводим…' : 'Перевести'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** AssignStudentModal — вся база учеников с указанием текущей группы. */
function AssignStudentModal({
  group,
  students,
  notify,
  onClose,
  onAssigned,
}: {
  group: TeacherGroup;
  students: GroupMember[];
  notify: (toast: Omit<ToastData, 'id'>) => void;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState('');
  const [busyID, setBusyID] = useState<number | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle === '') {
      return students;
    }

    return students.filter(
      (student) =>
        student.fullName.toLowerCase().includes(needle) ||
        student.email.toLowerCase().includes(needle),
    );
  }, [students, query]);

  async function assign(student: GroupMember) {
    if (busyID !== null) {
      return;
    }

    setBusyID(student.id);

    try {
      await updateUserGroup(student.id, group.id);
      notify({
        tone: 'success',
        title: 'Ученик добавлен в группу',
        description: `${student.fullName} — ${group.code}.`,
      });
      onAssigned();
    } catch (cause) {
      notify({
        tone: 'error',
        title: 'Не удалось добавить ученика',
        description: teacherErrorMessage(cause, 'Проверьте соединение и повторите.'),
      });
      setBusyID(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Добавить ученика"
      subtitle={`Группа ${group.code} · ${group.title}`}
      footer={
        <Button variant="ghost" block onClick={onClose} disabled={busyID !== null}>
          Закрыть
        </Button>
      }
    >
      <Field label="Поиск" htmlFor="student-search">
        <TextInput
          id="student-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Имя или почта"
          autoFocus
        />
      </Field>

      <ul className="mt-3 max-h-[50vh] space-y-1.5 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line2 px-3 py-4 text-center text-xs text-ink3">
            Ученики не найдены.
          </li>
        ) : (
          visible.map((student) => {
            const alreadyHere = student.groupId === group.id;

            return (
              <li key={student.id}>
                <button
                  type="button"
                  disabled={alreadyHere || busyID !== null}
                  onClick={() => void assign(student)}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-left transition hover:border-line2 disabled:opacity-50"
                >
                  <Avatar name={student.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">
                      {student.fullName}
                    </span>
                    <span className="block truncate text-[10px] text-ink3">{student.email}</span>
                  </span>
                  <span className="shrink-0 text-right text-[10px] text-ink3">
                    {alreadyHere
                      ? 'уже здесь'
                      : student.groupCode && student.groupCode !== 'NO-GROUP'
                        ? student.groupCode
                        : 'без группы'}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </Modal>
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
          <Select
            id="group-discipline"
            value={String(disciplineID)}
            onChange={(next) => setDisciplineID(Number(next))}
            options={disciplines.map((discipline) => ({
              value: String(discipline.id),
              label: `${discipline.code} · ${discipline.title}`,
            }))}
          />
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
