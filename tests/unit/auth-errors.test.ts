// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  GENERIC_AUTH_ERROR_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  toSafeAuthErrorMessage,
} from "@/lib/auth/errors";

describe("toSafeAuthErrorMessage", () => {
  it("maps invalid credentials to the shared failure message", () => {
    expect(
      toSafeAuthErrorMessage({ code: "invalid_credentials", status: 400 }),
    ).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("gives an unknown account the same message as a wrong password", () => {
    // Account enumeration defence: these two must be indistinguishable.
    const unknownAccount = toSafeAuthErrorMessage({ code: "user_not_found" });
    const wrongPassword = toSafeAuthErrorMessage({
      code: "invalid_credentials",
    });

    expect(unknownAccount).toBe(wrongPassword);
  });

  it("explains an unconfirmed account", () => {
    expect(toSafeAuthErrorMessage({ code: "email_not_confirmed" })).toMatch(
      /not been confirmed/i,
    );
  });

  it("reports rate limiting distinctly so the user knows to wait", () => {
    expect(toSafeAuthErrorMessage({ status: 429 })).toMatch(/too many/i);
    expect(toSafeAuthErrorMessage({ code: "over_request_rate_limit" })).toMatch(
      /too many/i,
    );
  });

  it("falls back to a generic message for unclassified failures", () => {
    expect(toSafeAuthErrorMessage({ code: "something_new", status: 500 })).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
  });

  it("handles a null error", () => {
    expect(toSafeAuthErrorMessage(null)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("never passes an upstream message through to the user", () => {
    const leaky =
      "AuthApiError: invalid login at db.abcdefgh.supabase.co request_id=7f3c9";

    const message = toSafeAuthErrorMessage({
      code: "unexpected_failure",
      status: 500,
      message: leaky,
    });

    expect(message).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(message).not.toContain("supabase.co");
    expect(message).not.toContain("request_id");
  });
});
