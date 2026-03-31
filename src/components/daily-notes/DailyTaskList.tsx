"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { DailyTaskPriority, DailyTaskView } from "@/lib/daily-task-types";
import { cn } from "@/lib/cn";

const NOTES_MAX = 4000;
const PRIORITIES: DailyTaskPriority[] = ["low", "medium", "high", "critical"];

interface DailyTaskListProps {
  selectedDate: string;
}

export function DailyTaskList({ selectedDate }: DailyTaskListProps) {
  const [tasks, setTasks] = useState<DailyTaskView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  /** Local draft for notes while editing (keyed by task id) */
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-notes/tasks?date=${encodeURIComponent(selectedDate)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        setTasks([]);
        return;
      }
      if (Array.isArray(body)) {
        const list = body as DailyTaskView[];
        setTasks(list);
        setNoteDrafts((prev) => {
          const next = { ...prev };
          for (const t of list) {
            if (!(t.id in next)) next[t.id] = t.notes ?? "";
          }
          for (const k of Object.keys(next)) {
            if (!list.some((t) => t.id === k)) delete next[k];
          }
          return next;
        });
      } else {
        setTasks([]);
      }
    } catch {
      setError("Network error");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-notes/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, origin_date: selectedDate }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        return;
      }
      setNewTitle("");
      await load();
    } catch {
      setError("Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (task: DailyTaskView) => {
    if (togglingIds.has(task.id)) return;
    setError(null);
    const nextCompleted = !task.is_completed;
    const prev = tasks;
    setTasks((cur) =>
      cur.map((t) =>
        t.id === task.id
          ? {
              ...t,
              is_completed: nextCompleted,
              completed_on_date: nextCompleted ? selectedDate : null,
            }
          : t
      )
    );
    setTogglingIds((cur) => new Set(cur).add(task.id));
    try {
      const res = await fetch("/api/daily-notes/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          completed_on_date: nextCompleted ? selectedDate : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        setTasks(prev);
      } else if (body && typeof body === "object" && "id" in body) {
        const updated = body as DailyTaskView;
        setTasks((cur) => cur.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      }
    } catch {
      setError("Failed to update task");
      setTasks(prev);
    } finally {
      setTogglingIds((cur) => {
        const next = new Set(cur);
        next.delete(task.id);
        return next;
      });
    }
  };

  const patchTask = async (task: DailyTaskView, patch: Partial<Pick<DailyTaskView, "priority">>) => {
    const previous = tasks;
    setTasks((cur) => cur.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch("/api/daily-notes/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, ...patch }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        setTasks(previous);
      }
    } catch {
      setError("Failed to update task");
      setTasks(previous);
    }
  };

  const saveNotes = async (task: DailyTaskView) => {
    const draft = (noteDrafts[task.id] ?? "").trim();
    const current = (task.notes ?? "").trim();
    if (draft === current) return;
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-notes/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          notes: draft === "" ? null : draft.slice(0, NOTES_MAX),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        return;
      }
      await load();
    } catch {
      setError("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-notes/tasks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : res.statusText);
        return;
      }
      await load();
    } catch {
      setError("Failed to delete task");
    } finally {
      setSaving(false);
    }
  };

  const sortedTasks = useMemo(() => {
    const weight: Record<DailyTaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...tasks].sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      const pw = weight[a.priority] - weight[b.priority];
      if (pw !== 0) return pw;
      const od = a.origin_date.localeCompare(b.origin_date);
      if (od !== 0) return od;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [tasks]);

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 rounded-dashboard-md border border-dashboard-border/70 bg-dashboard-bg px-3 py-2 text-dashboard-xs text-dashboard-text-secondary">
        <span className="font-medium">Legend</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-dashboard-status-danger" />
          Critical priority
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-dashboard-status-warning" />
          Medium priority
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-dashboard-text-muted" />
          Low priority
        </span>
      </div>

      <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task for this day…"
          maxLength={500}
          disabled={saving}
          className="min-h-10 flex-1 rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm text-dashboard-text-primary placeholder:text-dashboard-text-muted transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
        />
        <button
          type="submit"
          disabled={saving || !newTitle.trim()}
          className="shrink-0 rounded-dashboard-md bg-dashboard-primary px-4 py-2 text-dashboard-sm font-medium text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-dashboard-sm text-dashboard-text-muted">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="text-dashboard-sm text-dashboard-text-muted">
          No tasks for this day. Add one above — unfinished work rolls forward to the next day automatically.
        </p>
      ) : (
        <ul className="space-y-3">
          {sortedTasks.map((task) => (
            <li
              key={task.id}
              className={cn(
                "overflow-hidden rounded-dashboard-lg border border-dashboard-border bg-dashboard-bg transition-[background-color,box-shadow,border-color] duration-200",
                "hover:border-dashboard-primary/25 hover:shadow-dashboard-card",
                task.is_completed && "opacity-[0.92]"
              )}
            >
              <div className="flex items-start gap-3 px-3 py-3">
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={cn(
                      "h-4 w-1.5 rounded-full",
                      task.color === "blue" && "bg-sky-500",
                      task.color === "amber" && "bg-amber-500",
                      task.color === "violet" && "bg-violet-500",
                      !["blue", "amber", "violet"].includes(task.color) &&
                        "bg-dashboard-primary"
                    )}
                  />
                  <input
                    type="checkbox"
                    checked={task.is_completed}
                    onChange={() => void toggle(task)}
                    disabled={togglingIds.has(task.id)}
                    className="h-4 w-4 shrink-0 rounded border-dashboard-border text-dashboard-primary transition-colors focus:ring-dashboard-primary/40"
                    aria-label={task.is_completed ? "Mark incomplete" : "Mark complete"}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "block text-dashboard-sm text-dashboard-text-primary",
                        task.is_completed && "line-through text-dashboard-text-muted"
                      )}
                    >
                      {task.title}
                    </span>
                    <select
                      value={task.priority}
                      onChange={(e) =>
                        void patchTask(task, {
                          priority: e.target.value as DailyTaskPriority,
                        })
                      }
                      className="rounded-dashboard-sm border border-dashboard-border bg-dashboard-surface px-1.5 py-0.5 text-[11px] text-dashboard-text-secondary"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  {task.is_carried_over && !task.is_completed && (
                    <p className="text-dashboard-xs text-dashboard-text-muted">
                      Carried over · started {format(parseISO(`${task.origin_date}T12:00:00`), "d MMM yyyy")}
                    </p>
                  )}
                  <details
                    className="group rounded-dashboard-md border border-dashboard-border/80 bg-dashboard-surface/60 open:border-dashboard-border open:bg-dashboard-surface"
                    open={Boolean(task.notes)}
                  >
                    <summary className="cursor-pointer select-none px-2 py-1.5 text-dashboard-xs font-medium text-dashboard-text-secondary transition-colors hover:text-dashboard-text-primary">
                      Notes / comments
                    </summary>
                    <div className="border-t border-dashboard-border/60 px-2 pb-2 pt-1">
                      <textarea
                        value={noteDrafts[task.id] ?? task.notes ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({
                            ...d,
                            [task.id]: e.target.value.slice(0, NOTES_MAX),
                          }))
                        }
                        onBlur={() => void saveNotes(task)}
                        disabled={saving}
                        rows={3}
                        maxLength={NOTES_MAX}
                        placeholder="Optional details, links, context…"
                        className="w-full resize-y rounded-dashboard-sm border border-dashboard-border bg-dashboard-bg px-2.5 py-2 text-dashboard-sm text-dashboard-text-primary placeholder:text-dashboard-text-muted transition-shadow duration-150 focus:border-dashboard-primary/40 focus:outline-none focus:ring-2 focus:ring-dashboard-primary/20"
                      />
                      <p className="mt-1 text-right text-dashboard-xs text-dashboard-text-muted">
                        {(noteDrafts[task.id] ?? task.notes ?? "").length}/{NOTES_MAX}
                      </p>
                    </div>
                  </details>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(task.id)}
                  disabled={saving}
                  className="shrink-0 rounded-dashboard-sm px-2 py-1 text-dashboard-xs text-dashboard-text-muted transition-colors hover:bg-dashboard-surface hover:text-dashboard-status-danger"
                  aria-label="Delete task"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
