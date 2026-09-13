import { describe, expect, it } from "vitest";
import { baseUrl } from "./lib/helpers";

describe("security headers (over HTTP against a real next start)", () => {
  it("sets global security headers on the landing page", async () => {
    const res = await fetch(`${baseUrl()}/`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toBe(
      "camera=(self), microphone=(), geolocation=()",
    );
  });

  it("sets Cache-Control: no-store on /api, /apply and /volunteer", async () => {
    const apiRes = await fetch(`${baseUrl()}/api/volunteer/summary`);
    expect(apiRes.headers.get("cache-control")).toBe("no-store");

    const applyRes = await fetch(`${baseUrl()}/apply`);
    expect(applyRes.headers.get("cache-control")).toBe("no-store");

    const volunteerRes = await fetch(`${baseUrl()}/volunteer/login`);
    expect(volunteerRes.headers.get("cache-control")).toBe("no-store");
  });
});
