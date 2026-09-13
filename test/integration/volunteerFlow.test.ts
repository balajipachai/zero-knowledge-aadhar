import { describe, expect, inject, it } from "vitest";
import { baseUrl, loginVolunteer, logoutVolunteer } from "./lib/helpers";

// Deliberately proof-free: the one test here that needed a recorded
// application (the shortlist -> award review flow) now reuses the
// application recorded by recordingPath.test.ts's first test instead of
// generating its own real proof -- see that file's "reviews the recorded
// application end-to-end" test. Real proof generation is slow enough
// (~35s each -- see scripts/bench-proof.ts) that every real proof in the
// integration suite is accounted for deliberately; this file needs none.
describe("volunteer auth + dashboard (over HTTP against a real next start)", () => {
  it("rejects volunteer API access with no cookie", async () => {
    const res = await fetch(`${baseUrl()}/api/volunteer/summary`);
    expect(res.status).toBe(401);
  });

  it("rejects a tampered/garbage session cookie", async () => {
    const res = await fetch(`${baseUrl()}/api/volunteer/summary`, {
      headers: { cookie: "zk_aadhaar_volunteer_session=not-a-real-sealed-value" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects login with the wrong password", async () => {
    const email = inject("volunteerEmail" as never) as string;
    const res = await fetch(`${baseUrl()}/api/volunteer/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl() },
      body: JSON.stringify({ email, password: "definitely-wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects login from a mismatched Origin (CSRF guard)", async () => {
    const email = inject("volunteerEmail" as never) as string;
    const password = inject("volunteerPassword" as never) as string;
    const res = await fetch(`${baseUrl()}/api/volunteer/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ORIGIN_MISMATCH");
  });

  it("rejects login with no Origin header at all", async () => {
    const email = inject("volunteerEmail" as never) as string;
    const password = inject("volunteerPassword" as never) as string;
    const res = await fetch(`${baseUrl()}/api/volunteer/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(403);
  });

  it("logs in and can read the cycle summary", async () => {
    const cookie = await loginVolunteer();
    const res = await fetch(`${baseUrl()}/api/volunteer/summary`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.verified).toBe("number");
  });

  it("another volunteer requesting a nonexistent application id gets 404", async () => {
    const cookie = await loginVolunteer();
    const res = await fetch(
      `${baseUrl()}/api/volunteer/applications/00000000-0000-0000-0000-000000000000`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  it("logout revokes the session server-side: a replayed cookie stops working", async () => {
    const cookie = await loginVolunteer();

    const beforeLogout = await fetch(`${baseUrl()}/api/volunteer/summary`, {
      headers: { cookie },
    });
    expect(beforeLogout.status).toBe(200);

    const logoutRes = await logoutVolunteer(cookie);
    expect(logoutRes.status).toBe(200);

    // Replay the ORIGINAL cookie value captured before logout -- this is
    // exactly what the DB-backed session row (not just clearing the
    // client's own cookie) is meant to defeat.
    const afterLogout = await fetch(`${baseUrl()}/api/volunteer/summary`, {
      headers: { cookie },
    });
    expect(afterLogout.status).toBe(401);
  });

  it("rejects logout from a mismatched Origin", async () => {
    const cookie = await loginVolunteer();
    const res = await fetch(`${baseUrl()}/api/volunteer/logout`, {
      method: "POST",
      headers: { cookie, origin: "http://evil.example" },
    });
    expect(res.status).toBe(403);

    // The session must still be valid -- the mismatched-origin logout
    // attempt must not have revoked it.
    const stillValid = await fetch(`${baseUrl()}/api/volunteer/summary`, {
      headers: { cookie },
    });
    expect(stillValid.status).toBe(200);
  });
});
