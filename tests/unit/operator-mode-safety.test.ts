// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Operator Mode safety boundaries", () => {
  it("keeps automation behind an explicit owner switch", () => {
    const migration = read(
      "supabase/migrations/20260919170000_create_operator_mode.sql",
    );
    expect(migration).toMatch(
      /automation_enabled boolean not null default false/,
    );
    expect(migration).toMatch(
      /automation_submit_for_review boolean not null default true/,
    );
  });

  it("blocks automation over unverified Scripture", () => {
    const operator = read("src/lib/automation/operator.ts");
    expect(operator).toMatch(/scripture_verification_status/);
    expect(operator).toMatch(/manually_verified/);
    expect(operator).toMatch(/blockedUnverifiedScripture/);
  });

  it("records automated AI use as prepared, never human accepted", () => {
    const generations = read("src/lib/ai/generations.ts");
    const types = read("src/lib/ai/types.ts");
    expect(types).toMatch(/"prepared"/);
    expect(generations).toMatch(/markGenerationPrepared/);
    expect(generations).toMatch(/ai_generation_prepared/);
  });

  it("does not approve, schedule or publish inside the Operator engine", () => {
    const operator = read("src/lib/automation/operator.ts");
    expect(operator).not.toMatch(/review_state:\s*"approved"/);
    expect(operator).not.toMatch(/\.from\(["']scheduled_posts["']\)/);
    expect(operator).not.toMatch(/runPublishDispatcher|publishClaimedPost/);
    expect(operator).toMatch(/review_state:\s*"ready_for_review"/);
  });

  it("references Scripture from video scenes rather than copying verse text", () => {
    const operator = read("src/lib/automation/operator.ts");
    expect(operator).toMatch(/scene_type:\s*"scripture"/);
    expect(operator).toMatch(/text_source:\s*"content_scripture"/);
    expect(operator).toMatch(/text_content:\s*null/);
  });

  it("exposes Operator Mode as a real dashboard route", () => {
    const navigation = read("src/config/navigation.ts");
    expect(navigation).toMatch(/OPERATOR_MODE_PATH = "\/dashboard\/operator"/);
    expect(navigation).toMatch(/label:\s*"Operator Mode"/);
  });

  it("schedules automation without removing human gates", () => {
    const fn = read("netlify/functions/operator-mode.ts");
    const page = read("src/app/dashboard/operator/page.tsx");
    expect(fn).toMatch(/schedule:\s*"0 \*\/6 \* \* \*"/);
    expect(page).toMatch(/never marks Scripture verified/i);
    expect(page).toMatch(/never approves content/i);
  });
});
