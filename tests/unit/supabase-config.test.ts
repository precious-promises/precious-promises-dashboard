// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  parseSupabaseConfig,
  SupabaseConfigError,
} from "@/lib/supabase/config";

/**
 * Fake values only. These are shaped like real Supabase values but belong to no
 * project, so this suite never needs credentials.
 */
const VALID = {
  url: "https://example-project.supabase.co",
  publishableKey: "sb_publishable_test_value",
};

describe("parseSupabaseConfig", () => {
  it("accepts a valid project URL and publishable key", () => {
    expect(parseSupabaseConfig(VALID)).toEqual(VALID);
  });

  it("rejects a malformed project URL", () => {
    expect(() => parseSupabaseConfig({ ...VALID, url: "not-a-url" })).toThrow(
      SupabaseConfigError,
    );
  });

  it("rejects a non-http(s) URL", () => {
    expect(() =>
      parseSupabaseConfig({ ...VALID, url: "postgres://user:pw@host:5432" }),
    ).toThrow(SupabaseConfigError);
  });

  it("rejects a missing publishable key", () => {
    expect(() => parseSupabaseConfig({ url: VALID.url })).toThrow(
      SupabaseConfigError,
    );
  });

  it("rejects an empty publishable key", () => {
    expect(() => parseSupabaseConfig({ ...VALID, publishableKey: "" })).toThrow(
      SupabaseConfigError,
    );
  });

  it("names the environment variable rather than the internal field", () => {
    let caught: unknown;
    try {
      parseSupabaseConfig({ url: "nope", publishableKey: "" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SupabaseConfigError);
    const variables = (caught as SupabaseConfigError).issues.map(
      (issue) => issue.variable,
    );
    expect(variables).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(variables).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("does not echo the rejected value in the error message", () => {
    const secretish = "sb_publishable_do_not_leak_me";

    let caught: unknown;
    try {
      parseSupabaseConfig({ url: secretish, publishableKey: "x" });
    } catch (error) {
      caught = error;
    }

    const message = (caught as SupabaseConfigError).message;
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).not.toContain(secretish);
  });
});
