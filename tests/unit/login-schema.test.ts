// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseLoginInput } from "@/lib/auth/login-schema";

describe("parseLoginInput", () => {
  it("accepts a well-formed email and password", () => {
    const result = parseLoginInput({
      email: "owner@example.com",
      password: "a-password",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("owner@example.com");
    }
  });

  it("trims surrounding whitespace from the email", () => {
    const result = parseLoginInput({
      email: "  owner@example.com  ",
      password: "a-password",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("owner@example.com");
    }
  });

  it("rejects a malformed email", () => {
    const result = parseLoginInput({ email: "not-an-email", password: "pw" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBe("Enter a valid email address");
    }
  });

  it("rejects a missing email", () => {
    const result = parseLoginInput({ password: "pw" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBeDefined();
    }
  });

  it("rejects an empty password", () => {
    const result = parseLoginInput({
      email: "owner@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.password).toBe("Enter your password");
    }
  });

  it("reports both fields when both are missing", () => {
    const result = parseLoginInput({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBeDefined();
      expect(result.fieldErrors.password).toBeDefined();
    }
  });

  it("never returns the submitted password in its errors", () => {
    const password = "correct-horse-battery-staple";
    const result = parseLoginInput({ email: "bad", password });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.fieldErrors)).not.toContain(password);
    }
  });

  it("does not enforce a password policy at sign-in", () => {
    // Sign-in validates shape only. Rejecting a short password here would
    // leak that it could not possibly be the stored one.
    const result = parseLoginInput({
      email: "owner@example.com",
      password: "x",
    });

    expect(result.success).toBe(true);
  });
});
