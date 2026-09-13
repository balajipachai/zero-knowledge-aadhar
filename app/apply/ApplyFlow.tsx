"use client";

import { useEffect, useState } from "react";
import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import { deserialize, type AnonAadhaarCore } from "@anon-aadhaar/core";

type DraftForm = {
  preferredName: string;
  contactEmail: string;
  college: string;
  courseYear: string;
  district: string;
  firstGen: boolean;
  statement: string;
};

type Draft = {
  applicationId: string;
  signal: string;
  nullifierSeed: string;
  expiresAt: string;
};

const EMPTY_FORM: DraftForm = {
  preferredName: "",
  contactEmail: "",
  college: "",
  courseYear: "",
  district: "",
  firstGen: false,
  statement: "",
};

const REJECTION_MESSAGES: Record<string, string> = {
  DRAFT_NOT_FOUND: "Your session expired. Please start again.",
  DRAFT_ALREADY_SUBMITTED: "This application has already been submitted.",
  DRAFT_EXPIRED: "Your session expired before the proof arrived. Please start again.",
  CYCLE_NOT_OPEN: "This grant cycle is not currently open.",
  WRONG_SEED: "Something went wrong generating your proof. Please try again.",
  WRONG_PUBKEY_HASH: "Your QR could not be verified. Please try again.",
  SIGNAL_MISMATCH: "Something went wrong generating your proof. Please try again.",
  INVALID_PROOF: "Your proof could not be verified. Please try again.",
  NOT_ELIGIBLE: "This grant is only open to applicants who are 18 or older.",
  DUPLICATE: "It looks like you have already applied this cycle.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  SERVICE_UNAVAILABLE: "The application system is temporarily unavailable. Please try again shortly.",
};

export function ApplyFlow() {
  const [step, setStep] = useState<"form" | "prove" | "submitting" | "done" | "error">("form");
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [anchorStatus, setAnchorStatus] = useState<"anchored" | "pending" | null>(null);
  const [anonAadhaar] = useAnonAadhaar();

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(
          REJECTION_MESSAGES[body.error] ?? "Could not start your application. Please try again.",
        );
        return;
      }
      const created: Draft = await res.json();
      setDraft(created);
      setStep("prove");
    } catch {
      setErrorMessage("Could not reach the server. Please check your connection and try again.");
    }
  }

  // Once the SDK reports a completed proof, submit it to the recording
  // path. This is the ONLY thing sent to the server about the applicant's
  // Aadhaar: an application id and a proof object. The QR data, the
  // certificate and any decoded personal field never leave this browser.
  useEffect(() => {
    if (anonAadhaar.status !== "logged-in" || !draft || step !== "prove") return;

    let cancelled = false;

    async function submitProof() {
      setStep("submitting");
      try {
        const serialized = Object.values(anonAadhaar.status === "logged-in" ? anonAadhaar.anonAadhaarProofs : {})[0];
        if (!serialized) throw new Error("no proof available");
        const pcd: AnonAadhaarCore = await deserialize(serialized.pcd);

        const res = await fetch("/api/applications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            applicationId: draft!.applicationId,
            proof: pcd.proof,
          }),
        });

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(
            REJECTION_MESSAGES[body.error] ?? "Your application could not be recorded. Please try again.",
          );
          setStep("error");
          return;
        }

        const result = await res.json();
        setAnchorStatus(result.anchorStatus);
        setStep("done");
      } catch {
        if (!cancelled) {
          setErrorMessage("Your application could not be recorded. Please try again.");
          setStep("error");
        }
      }
    }

    void submitProof();
    return () => {
      cancelled = true;
    };
  }, [anonAadhaar, draft, step]);

  if (step === "done") {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center dark:border-green-700 dark:bg-green-950">
        <h2 className="text-lg font-semibold text-green-800 dark:text-green-200">
          Application recorded
        </h2>
        <p className="mt-2 text-sm text-green-700 dark:text-green-300">
          {anchorStatus === "anchored"
            ? "Your application has been verified and anchored on-chain. A volunteer will review it."
            : "Your application has been verified and recorded. On-chain anchoring is still in progress."}
        </p>
      </div>
    );
  }

  if (step === "form") {
    return (
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {errorMessage && <ErrorBanner message={errorMessage} />}
        <Field label="Preferred name">
          <input
            required
            className="input"
            value={form.preferredName}
            onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
          />
        </Field>
        <Field label="Contact email">
          <input
            required
            type="email"
            className="input"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </Field>
        <Field label="College">
          <input
            required
            className="input"
            value={form.college}
            onChange={(e) => setForm({ ...form, college: e.target.value })}
          />
        </Field>
        <Field label="Course & year (e.g. B.Sc, 2nd year)">
          <input
            required
            className="input"
            value={form.courseYear}
            onChange={(e) => setForm({ ...form, courseYear: e.target.value })}
          />
        </Field>
        <Field label="District (Vidarbha)">
          <input
            required
            className="input"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            required
            className="mt-1"
            checked={form.firstGen}
            onChange={(e) => setForm({ ...form, firstGen: e.target.checked })}
          />
          <span>I am the first person in my immediate family to attend college.</span>
        </label>
        <Field label="A short statement about why this grant matters to you">
          <textarea
            required
            rows={4}
            className="input"
            value={form.statement}
            onChange={(e) => setForm({ ...form, statement: e.target.value })}
          />
        </Field>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Continue to identity proof
        </button>
      </form>
    );
  }

  // step === 'prove' | 'submitting' | 'error'
  return (
    <div className="space-y-4 text-center">
      {errorMessage && <ErrorBanner message={errorMessage} />}
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Scan or upload your Aadhaar QR code below. Your Aadhaar data is read
        and proved locally in this browser — nothing about your identity is
        sent anywhere.
      </p>
      {draft && (
        <LogInWithAnonAadhaar
          nullifierSeed={BigInt(draft.nullifierSeed)}
          signal={draft.signal}
          fieldsToReveal={["revealAgeAbove18"]}
        />
      )}
      {step === "submitting" && (
        <p className="text-sm text-slate-500">Recording your application…</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </div>
  );
}
