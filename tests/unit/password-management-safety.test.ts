// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("password management safety", () => {
  const actionPath = "src/app/dashboard/settings/password-actions.ts";
  const formPath = "src/components/settings/password-form.tsx";
  const pagePath = "src/app/dashboard/settings/password/page.tsx";

  it("changes only the authenticated Supabase Auth password", () => {
    const action = readFileSync(join(process.cwd(), actionPath), "utf8");

    expect(action).toContain("supabase.auth.getUser()");
    expect(action).toContain("supabase.auth.updateUser");
    expect(action).toContain("currentPassword");
    expect(action).not.toContain(".from(");
    expect(action).not.toContain("recordAudit");
    expect(action).not.toContain("console.");
  });

  it("never renders or persists submitted password values", () => {
    const files = [actionPath, formPath, pagePath];

    for (const file of files) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      expect(contents, file).not.toContain("defaultValue={state");
      expect(contents, file).not.toContain("value={state");
      expect(contents, file).not.toContain("localStorage");
      expect(contents, file).not.toContain("sessionStorage");
    }
  });

  it("requires current, new and confirmed password inputs", () => {
    const form = readFileSync(join(process.cwd(), formPath), "utf8");

    expect(form).toContain('name="currentPassword"');
    expect(form).toContain('name="newPassword"');
    expect(form).toContain('name="confirmPassword"');
    expect(form).toContain('autoComplete="current-password"');
    expect(form.match(/autoComplete="new-password"/g)?.length).toBe(2);
  });

  it("keeps the change-password page behind authenticated dashboard access", () => {
    const page = readFileSync(join(process.cwd(), pagePath), "utf8");

    expect(page).toContain("supabase.auth.getUser()");
    expect(page).toContain("redirect(LOGIN_PATH)");
    expect(page).toContain("robots: { index: false, follow: false }");
  });
});
