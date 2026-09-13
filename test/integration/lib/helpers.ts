import { inject } from "vitest";

export function baseUrl(): string {
  return inject("baseUrl" as never) as string;
}

export type Draft = {
  applicationId: string;
  signal: string;
  nullifierSeed: string;
  expiresAt: string;
};

export async function createDraft(overrides: Partial<Record<string, unknown>> = {}): Promise<Draft> {
  const res = await fetch(`${baseUrl()}/api/intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      preferredName: "Test Applicant",
      contactEmail: `applicant-${Math.random().toString(36).slice(2)}@example.com`,
      college: "Test College",
      courseYear: "B.Sc 1st year",
      district: "Nagpur",
      firstGen: true,
      statement: "This grant would help me continue my education.",
      ...overrides,
    }),
  });
  if (!res.ok) {
    throw new Error(`createDraft failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function submitApplication(applicationId: string, proof: unknown) {
  const res = await fetch(`${baseUrl()}/api/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId, proof }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// The app's volunteer mutation routes (login, logout, review POST) require
// the Origin header to equal APP_ORIGIN (see src/server/auth/originCheck.ts)
// -- a CSRF guard. Node's fetch (undici) does NOT set Origin automatically
// the way a browser does for same-site requests, so every test hitting one
// of those routes must set it explicitly. globalSetup.ts sets the app's own
// APP_ORIGIN to exactly baseUrl() for this reason.
export async function loginVolunteer(): Promise<string> {
  const email = inject("volunteerEmail" as never) as string;
  const password = inject("volunteerPassword" as never) as string;
  const res = await fetch(`${baseUrl()}/api/volunteer/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl() },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`volunteer login failed: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie header from volunteer login");
  return setCookie.split(";")[0]!;
}

export async function logoutVolunteer(cookie: string): Promise<Response> {
  return fetch(`${baseUrl()}/api/volunteer/logout`, {
    method: "POST",
    headers: { cookie, origin: baseUrl() },
  });
}
