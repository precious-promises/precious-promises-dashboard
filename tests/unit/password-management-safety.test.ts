// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("password management safety", () => {
  const changeActionPath = "src/app/dashboard/settings/password-actions.ts";
  const changeFormPath = "src/components/settings/password-form.tsx";
  const changePagePath = "src/app/dashboard/settings/password/page.tsx";
  const resetRequestActionPath = "src/app/login/forgot-password/actions.ts";
  const recoveryActionPath = "src/app/auth/update-password/actions.ts";
  const recoveryFormPath = "src/app/auth/update-password/recovery-password-form.tsx";
  const recoveryPagePath = "src/app/auth/update-password/page.tsx";
  const confirmRoutePath = "src/app/auth/confirm/route.ts";

  it("changes only the authenticated Supabase Auth password", () => {
    const action = readFileSync(join(process.cwd(), changeActionPath), "utf8");

    expect(action).toContain("supabase.auth.getUser()");
    expect(action).toContain("supabase.auth.updateUser");
    expect(action).toContain("currentPassword");
    expect(action).not.toContain(".from(");
    expect(action).not.toContain("recordAudit");
    expect(action).not.toContain("console.");
  });

  it("never renders or persists submitted password values", () => {
    const files = [
      changeActionPath,
      changeFormPath,
      changePagePath,
      resetRequestActionPath,
      recoveryActionPath,
      recoveryFormPath,
      recoveryPagePath,
      confirmRoutePath,
    ];

    for (const file of files) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      expect(contents, file).not.toContain("defaultValue={state");
      expect(contents, file).not.toContain("value={state");
      expect(contents, file).not.toContain("localStorage");
      expect(contents, file).not.toContain("sessionStorage");
      expect(contents, file).not.toContain("console.");
    }
  });

  it("requires current, new and confirmed password inputs for signed-in changes", () => {
    const form = readFileSync(join(process.cwd(), changeFormPath), "utf8");

    expect(form).toContain('name="currentPassword"');
    expect(form).toContain('name="newPassword"');
    expect(form).toContain('name="confirmPassword"');
    expect(form).toContain('autoComplete="current-password"');
    expect(form.match(/autoComplete="new-password"/g)?.length).toBe(2);
  });

  it("keeps the change-password page behind authenticated dashboard access", () => {
    const page = readFileSync(join(process.cwd(), changePagePath), "utf8");

    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain("redirect(LOGIN_PATH)");
    expect(page).toContain("robots: { index: false, follow: false }");
  });

  it("requests recovery without storing the email and uses the configured app URL", () => {
    const action = readFileSync(
      join(process.cwd(), resetRequestActionPath),
      "utf8",
    );

    expect(action).toContain("resetPasswordForEmail");
    expect(action).toContain("getServerEnv");
    expect(action).toContain("/auth/confirm?next=/auth/update-password");
    expect(action).not.toContain(".from(");
    expect(action).not.toContain("recordAudit");
  });

  it("supports both recovery token-hash and PKCE code exchanges", () => {
    const route = readFileSync(join(process.cwd(), confirmRoutePath), "utf8");

    expect(route).toContain("verifyOtp");
    expect(route).toContain("exchangeCodeForSession");
    expect(route).toContain("safeNext");
    expect(route).toContain('value.startsWith("//")');
  });

  it("recovery password updates require an authenticated recovery session", () => {
    const action = readFileSync(join(process.cwd(), recoveryActionPath), "utf8");
    const page = readFileSync(join(process.cwd(), recoveryPagePath), "utf8");

    expect(action).toContain("supabase.auth.getUser()");
    expect(action).toContain("supabase.auth.updateUser");
    expect(action).not.toContain("currentPassword");
    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain('redirect("/login?recovery=expired")');
  });
});
