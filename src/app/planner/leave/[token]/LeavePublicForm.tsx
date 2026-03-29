"use client";

import { useCallback, useEffect, useState } from "react";

type ValidateState =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | { status: "ok"; crew_name: string | null; label: string | null };

export default function LeavePublicForm({ token }: { token: string }) {
  const [validate, setValidate] = useState<ValidateState>({ status: "loading" });
  const [personName, setPersonName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/planner/leaves/public?token=${encodeURIComponent(token)}`
        );
        const body = (await res.json()) as {
          valid?: boolean;
          crew_name?: string | null;
          label?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.valid) {
          setValidate({
            status: "invalid",
            message: body.error || "This link is not valid.",
          });
          return;
        }
        setValidate({
          status: "ok",
          crew_name: body.crew_name ?? null,
          label: body.label ?? null,
        });
      } catch {
        if (!cancelled) {
          setValidate({ status: "invalid", message: "Could not verify link." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setDoneMessage(null);
      if (!startDate) {
        setError("Choose a start date.");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch("/api/planner/leaves/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            start_date: startDate,
            end_date: endDate || startDate,
            person_name: personName.trim() || undefined,
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error || res.statusText);
          return;
        }
        setDoneMessage("Leave saved. Thank you.");
        setPersonName("");
        setStartDate("");
        setEndDate("");
      } catch {
        setError("Network error.");
      } finally {
        setSubmitting(false);
      }
    },
    [endDate, personName, startDate, token]
  );

  if (validate.status === "loading") {
    return (
      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
    );
  }

  if (validate.status === "invalid") {
    return (
      <p className="text-center text-sm text-red-600 dark:text-red-400" role="alert">
        {validate.message}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Register time off
        </h1>
        {validate.crew_name && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Crew: {validate.crew_name}</p>
        )}
        {validate.label && (
          <p className="text-xs text-neutral-500 dark:text-neutral-500">{validate.label}</p>
        )}
      </header>

      {doneMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {doneMessage}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="leave-name" className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Name (optional)
            </label>
            <input
              id="leave-name"
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              maxLength={120}
              placeholder="Your name"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="leave-start" className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              First day away
            </label>
            <input
              id="leave-start"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="leave-end" className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Last day away (optional)
            </label>
            <input
              id="leave-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <p className="mt-1 text-xs text-neutral-500">Leave blank if it is a single day.</p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
