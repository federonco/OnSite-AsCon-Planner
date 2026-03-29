"use client";

import { useCallback, useEffect, useState } from "react";

interface PeopleLeaveQrDialogProps {
  open: boolean;
  onClose: () => void;
  crewId: string | null;
  crewName: string | null;
}

export default function PeopleLeaveQrDialog({
  open,
  onClose,
  crewId,
  crewName,
}: PeopleLeaveQrDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    setCopied(false);
    setLoading(false);
  }, [open]);

  const generate = useCallback(async () => {
    if (!crewId) return;
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/planner/leave-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crew_id: crewId }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setError(body.error || res.statusText);
        setUrl(null);
        return;
      }
      setUrl(body.url || null);
    } catch {
      setError("Could not create link.");
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [crewId]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [url]);

  if (!open) return null;

  const qrSrc =
    url != null
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-qr-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-dashboard-lg border border-dashboard-border bg-dashboard-surface p-6 shadow-dashboard-card">
        <h2 id="leave-qr-title" className="text-lg font-semibold text-dashboard-text-primary">
          People leave (QR)
        </h2>
        <p className="mt-2 text-dashboard-sm text-dashboard-text-secondary">
          Anyone with the link can register a leave period for{" "}
          <span className="font-medium text-dashboard-text-primary">
            {crewName || "the selected crew"}
          </span>
          . It appears on the planner calendar and Gantt.
        </p>

        {!crewId ? (
          <p className="mt-4 text-dashboard-sm text-dashboard-status-danger" role="alert">
            Select a crew in the planner first.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="mt-4 w-full rounded-dashboard-md bg-dashboard-primary px-4 py-2.5 text-dashboard-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Generate link"}
            </button>
            {error && (
              <p className="mt-3 text-dashboard-sm text-dashboard-status-danger" role="alert">
                {error}
              </p>
            )}
            {url && (
              <div className="mt-4 space-y-3">
                {qrSrc && (
                  <div className="flex justify-center rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- external QR data URL */}
                    <img src={qrSrc} alt="QR code for leave form" width={180} height={180} />
                  </div>
                )}
                <p className="break-all font-mono text-dashboard-xs text-dashboard-text-secondary">
                  {url}
                </p>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="w-full rounded-dashboard-md border border-dashboard-border px-4 py-2 text-dashboard-sm font-medium text-dashboard-text-primary hover:bg-dashboard-bg"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-dashboard-md border border-dashboard-border px-4 py-2 text-dashboard-sm text-dashboard-text-secondary hover:bg-dashboard-bg"
        >
          Close
        </button>
      </div>
    </div>
  );
}
