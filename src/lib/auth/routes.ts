/**
 * Route policy for authentication.
 *
 * Pure functions with no framework imports, so the redirect rules can be
 * tested directly rather than inferred from proxy behaviour.
 */

export const LOGIN_PATH = "/login";
export const DASHBOARD_PATH = "/dashboard";

/**
 * Prefixes that require an authenticated session.
 *
 * Deliberately a short allow-list rather than "everything except /login".
 * The marketing homepage and `GET /api/health` are public and must stay that
 * way; health checks in particular have to answer without a session.
 */
const PROTECTED_PREFIXES = [DASHBOARD_PATH] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  // `/dashboard` and `/dashboard/settings` match; `/dashboards` must not.
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the path requires an authenticated session. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/** True when the path is part of the sign-in flow. */
export function isAuthPath(pathname: string): boolean {
  return matchesPrefix(pathname, LOGIN_PATH);
}

/**
 * Decide where a request should be sent, or `null` to let it through.
 *
 * - An anonymous request for a protected path goes to the login page.
 * - An authenticated request for the login page goes to the dashboard, so a
 *   signed-in owner is not shown a pointless sign-in form.
 * - Everything else passes through untouched.
 */
export function resolveAuthRedirect(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  if (!isAuthenticated && isProtectedPath(pathname)) {
    return LOGIN_PATH;
  }
  if (isAuthenticated && isAuthPath(pathname)) {
    return DASHBOARD_PATH;
  }
  return null;
}
