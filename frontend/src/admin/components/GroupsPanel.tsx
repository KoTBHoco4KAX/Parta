import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../core/api';
import type { Group } from '../../core/types';
import { Button } from '../../components/Button';
import { createGroup, deleteGroup, fetchGroups } from '../api';
import type { ToastData } from '../types';
import { Badge, EmptyState, Skeleton, inputClass } from './ui';
import { IconAlert, IconLayers, IconPlus } from './icons';

// GroupsPanel — добавление и удаление учебных групп.
export function GroupsPanel({
  notify,
}: {
  notify: (toast: Omit<ToastData, 'id'>) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    setError(null);

    try {
      setGroups(await fetchGroups());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось загрузить группы.');
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

    if (!code.trim() || !title.trim()) {
      setError('Заполните код и название группы.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await createGroup({ code: code.trim(), title: title.trim() });
      notify({
        tone: 'success',
        title: `Группа ${created.code} создана`,
        description: created.title,
      });
      setCode('');
      setTitle('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Не удалось создать группу.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(group: Group) {
    if (!window.confirm(`Удалить группу ${group.code}?`)) {
      return;
    }

    setError(null);

    try {
      await deleteGroup(group.id);
      notify({ tone: 'success', title: `Группа ${group.code} удалена` });
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Не удалось удалить группу: возможно, в ней есть студенты.',
      );
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <IconLayers className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Новая группа</h2>
        </div>

        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Код, например IS-23"
          className={inputClass}
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название группы"
          className={inputClass}
        />

        <Button type="submit" block loading={submitting}>
          <IconPlus className="h-4 w-4" />
          Создать группу
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
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Группы</h2>
          <Badge tone="slate">{groups.length}</Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<IconLayers className="h-5 w-5" />}
            title="Групп нет"
            description="Создайте группу, чтобы добавлять в неё студентов."
          />
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-[11px] font-semibold text-emerald-300">
                  {group.code.slice(0, 4)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{group.code}</p>
                  <p className="truncate text-[11px] text-slate-400">{group.title}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(group)}
                  aria-label={`Удалить ${group.code}`}
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
