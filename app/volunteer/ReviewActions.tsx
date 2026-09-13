"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReviewActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "shortlist" | "reject" | "award" | "reopen") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/volunteer/applications/${applicationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "NO_SLOTS_REMAINING" ? "No slots remaining this cycle." : "Action failed.");
        return;
      }
      setNote("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="text-sm font-semibold">Review action</h2>
      {error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      <textarea
        className="input"
        rows={2}
        placeholder="Optional note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} onClick={() => act("shortlist")} className="btn-secondary">
          Shortlist
        </button>
        <button disabled={pending} onClick={() => act("award")} className="btn-secondary">
          Award
        </button>
        <button disabled={pending} onClick={() => act("reject")} className="btn-secondary">
          Reject
        </button>
        <button disabled={pending} onClick={() => act("reopen")} className="btn-secondary">
          Reopen
        </button>
      </div>
    </div>
  );
}
