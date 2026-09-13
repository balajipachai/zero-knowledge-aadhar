import { getConfig } from "../config";

/**
 * CSRF guard for volunteer mutations (login, logout, review actions):
 * the `Origin` header must exactly equal this app's own configured
 * `APP_ORIGIN`. A same-site form/fetch always sends `Origin` on a POST;
 * a cross-site request either omits it or sends the attacker's own
 * origin, so this rejects both. Applied only to mutations, not to GETs
 * (session-cookie + sameSite=strict already covers those, and Origin is
 * not reliably sent on navigations anyway).
 */
export function originMatchesApp(request: Request): boolean {
  return request.headers.get("origin") === getConfig().appOrigin;
}
