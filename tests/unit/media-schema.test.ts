// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseMediaForm } from "@/lib/media/schema";
import { STORAGE_PROVIDER_STATUS } from "@/lib/storage/provider";

const VALID = {
  name: "Sunrise background",
  media_type: "video",
  storage_provider: "google_drive",
  external_file_id: "1AbCdEfGhIjK",
  mime_type: "video/mp4",
  size_bytes: "10485760",
  width: "1920",
  height: "1080",
  duration_seconds: "45",
  rights_status: "owned",
};

describe("parseMediaForm", () => {
  it("accepts a complete asset record", () => {
    const result = parseMediaForm(VALID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sunrise background");
      expect(result.data.size_bytes).toBe(10485760);
      expect(result.data.width).toBe(1920);
    }
  });

  it("requires a name", () => {
    const result = parseMediaForm({ ...VALID, name: "  " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.name).toBe("Enter a name");
    }
  });

  it("requires a known media type", () => {
    const result = parseMediaForm({ ...VALID, media_type: "hologram" });

    expect(result.success).toBe(false);
  });

  it("requires a known storage provider", () => {
    const result = parseMediaForm({ ...VALID, storage_provider: "dropbox" });

    expect(result.success).toBe(false);
  });

  it("defaults rights status to unknown rather than assuming ownership", () => {
    const result = parseMediaForm({
      name: "Clip",
      media_type: "video",
      storage_provider: "external",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rights_status).toBe("unknown");
    }
  });

  it("rejects a negative size", () => {
    const result = parseMediaForm({ ...VALID, size_bytes: "-1" });

    expect(result.success).toBe(false);
  });

  it("rejects a non-http external URL", () => {
    const result = parseMediaForm({
      ...VALID,
      storage_provider: "external",
      external_url: "javascript:alert(1)",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an https external URL", () => {
    const result = parseMediaForm({
      ...VALID,
      storage_provider: "external",
      external_url: "https://example.com/clip.mp4",
    });

    expect(result.success).toBe(true);
  });

  it("never accepts owner_id from a submission", () => {
    const result = parseMediaForm({
      ...VALID,
      owner_id: "99999999-9999-9999-9999-999999999999",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("owner_id");
    }
  });
});

describe("storage providers", () => {
  it("explains every provider, whether or not it has an adapter", () => {
    for (const status of STORAGE_PROVIDER_STATUS) {
      expect(status.detail.length, status.provider).toBeGreaterThan(10);
    }
  });

  it("reports Google Drive as implemented, because Stage 8 built it", () => {
    // "Implemented" is a fact about this repository. Whether a connection
    // exists, and whether any given file can be read, are runtime questions
    // with their own answers.
    const drive = STORAGE_PROVIDER_STATUS.find(
      (status) => status.provider === "google_drive",
    );

    expect(drive?.implemented).toBe(true);
    expect(drive?.detail).toMatch(/approved/i);
  });

  it("reports supabase_storage as implemented, because Stage 11 built it", () => {
    const supabase = STORAGE_PROVIDER_STATUS.find(
      (entry) => entry.provider === "supabase_storage",
    );
    expect(supabase?.implemented).toBe(true);
    expect(supabase?.detail).toMatch(/private/i);
  });

  it("still has no adapter for external URLs", () => {
    const external = STORAGE_PROVIDER_STATUS.find(
      (entry) => entry.provider === "external",
    );
    expect(external?.implemented).toBe(false);
  });

  it("refuses to fetch arbitrary external URLs, and says why", () => {
    const external = STORAGE_PROVIDER_STATUS.find(
      (status) => status.provider === "external",
    );

    expect(external?.detail).toMatch(/URL fetcher/i);
  });
});
