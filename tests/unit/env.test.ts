import { describe, expect, it } from "vitest";

import {
  EnvValidationError,
  parsePublicEnv,
  parseServerEnv,
} from "@/lib/env/schema";

/**
 * A minimal server environment: only the variables Block 2 actually requires.
 * No real credentials are involved anywhere in this suite.
 */
const MINIMAL_SERVER_ENV = { APP_URL: "http://localhost:3000" };

describe("parseServerEnv", () => {
  it("accepts a valid APP_URL", () => {
    const env = parseServerEnv(MINIMAL_SERVER_ENV);

    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("accepts an https APP_URL", () => {
    const env = parseServerEnv({ APP_URL: "https://dashboard.example.com" });

    expect(env.APP_URL).toBe("https://dashboard.example.com");
  });

  it("rejects an APP_URL that is not a URL", () => {
    expect(() => parseServerEnv({ APP_URL: "not-a-url" })).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a missing APP_URL", () => {
    expect(() => parseServerEnv({})).toThrow(EnvValidationError);
  });

  it("rejects an empty APP_URL, because .env writes unset values as ''", () => {
    expect(() => parseServerEnv({ APP_URL: "" })).toThrow(EnvValidationError);
  });

  it("names the offending variable without echoing its value", () => {
    const secret = "postgres://user:hunter2@db.internal:5432";

    let caught: unknown;
    try {
      parseServerEnv({ APP_URL: secret });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.issues).toEqual([
      { variable: "APP_URL", message: expect.stringContaining("http(s) URL") },
    ]);
    expect(error.message).toContain("APP_URL");
    expect(error.message).not.toContain("hunter2");
    expect(error.message).not.toContain(secret);
  });

  it("allows every future integration variable to be absent during Block 2", () => {
    const env = parseServerEnv(MINIMAL_SERVER_ENV);

    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.TOKEN_ENCRYPTION_KEY).toBeUndefined();
    expect(env.AI_API_KEY).toBeUndefined();
    expect(env.TRIGGER_SECRET_KEY).toBeUndefined();
    expect(env.META_APP_ID).toBeUndefined();
    expect(env.TIKTOK_CLIENT_KEY).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_DRIVE_ROOT_FOLDER_ID).toBeUndefined();
    expect(env.ELEVENLABS_API_KEY).toBeUndefined();
  });

  it("treats blank future integration variables as absent", () => {
    const env = parseServerEnv({
      ...MINIMAL_SERVER_ENV,
      ELEVENLABS_API_KEY: "",
      GOOGLE_CLIENT_ID: "   ",
    });

    expect(env.ELEVENLABS_API_KEY).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("validates an optional redirect URI when one is supplied", () => {
    expect(() =>
      parseServerEnv({
        ...MINIMAL_SERVER_ENV,
        GOOGLE_REDIRECT_URI: "nonsense",
      }),
    ).toThrow(EnvValidationError);
  });
});

describe("parsePublicEnv", () => {
  it("allows the Supabase variables to be absent during Block 2", () => {
    const env = parsePublicEnv({});

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("rejects a malformed NEXT_PUBLIC_SUPABASE_URL when one is supplied", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(EnvValidationError);
  });

  it("does not carry server-only variables through the public parser", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-value",
      TOKEN_ENCRYPTION_KEY: "encryption-key-value",
    });

    expect(Object.keys(env)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(Object.keys(env)).not.toContain("TOKEN_ENCRYPTION_KEY");
    expect(JSON.stringify(env)).not.toContain("service-role-value");
    expect(JSON.stringify(env)).not.toContain("encryption-key-value");
  });
});
