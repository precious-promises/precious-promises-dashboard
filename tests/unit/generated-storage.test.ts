// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GENERATED_KIND_RULES,
  GENERATED_KINDS,
  GENERATED_MEDIA_BUCKET,
  generatedObjectKey,
  keyBelongsToOwner,
  sanitiseObjectName,
  SIGNED_URL_TTL_SECONDS,
  validateGeneratedUpload,
} from "@/lib/storage/generated-config";

/**
 * Generated-media storage safety.
 *
 * The bucket is private, keys are owner-prefixed and constructed — never
 * accepted — and access is signed and short-lived. These tests pin each of
 * those properties, because any one of them failing quietly would turn a
 * private store into a public one.
 */

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260815090000_create_production_automation.sql",
  ),
  "utf8",
);

describe("the generated-media bucket is private", () => {
  it("is created with public = false in the migration", () => {
    expect(MIGRATION).toMatch(
      /insert into storage\.buckets[\s\S]*?'generated-media'[\s\S]*?false/,
    );
  });

  it("grants the browser no storage.objects policy at all", () => {
    // Access is exclusively through the trusted worker credential plus the
    // owner-prefix check in code. A browser-facing policy on the bucket would
    // be a second, wider door.
    expect(MIGRATION).not.toMatch(/create policy[^;]*on storage\.objects/i);
  });

  it("keeps signed URLs short-lived", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });

  it("never builds a public URL anywhere in the storage module", () => {
    for (const file of ["generated.ts", "generated-config.ts"]) {
      const contents = readFileSync(
        join(process.cwd(), "src/lib/storage", file),
        "utf8",
      );
      expect(contents, file).not.toMatch(/getPublicUrl/);
      expect(contents, file).not.toMatch(/public.*url.*permanent/i);
    }
  });
});

describe("object keys", () => {
  it("are always owner-prefixed", () => {
    for (const kind of GENERATED_KINDS) {
      const key = generatedObjectKey("owner-1", kind, "file-a");
      expect(key.startsWith("owner-1/")).toBe(true);
      expect(keyBelongsToOwner(key, "owner-1")).toBe(true);
      expect(keyBelongsToOwner(key, "owner-2")).toBe(false);
    }
  });

  it("never lets an empty owner claim anything", () => {
    expect(keyBelongsToOwner("anything/at/all", "")).toBe(false);
  });

  it("is not fooled by an owner id that prefixes another", () => {
    const key = generatedObjectKey("owner-10", "voiceover", "n");
    expect(keyBelongsToOwner(key, "owner-1")).toBe(false);
  });

  it("sanitises traversal and separator characters out of names", () => {
    expect(sanitiseObjectName("../../etc/passwd")).not.toContain("/");
    expect(sanitiseObjectName("../../etc/passwd")).not.toContain("..");
    expect(sanitiseObjectName("a b?c*d")).toBe("a-b-c-d");
    expect(sanitiseObjectName("")).toBe("unnamed");
    expect(sanitiseObjectName("////")).toBe("unnamed");
    expect(sanitiseObjectName("x".repeat(400)).length).toBeLessThanOrEqual(120);
  });

  it("derives the extension from the kind, never from input", () => {
    expect(generatedObjectKey("o", "rendered_video", "n.exe")).toMatch(
      /\.mp4$/,
    );
    expect(generatedObjectKey("o", "voiceover", "n.exe")).toMatch(/\.mp3$/);
  });
});

describe("upload validation", () => {
  it("refuses the wrong MIME type per kind", () => {
    expect(
      validateGeneratedUpload({
        kind: "rendered_video",
        contentType: "video/webm",
        sizeBytes: 100,
      }),
    ).toBe("wrong_mime_type");
    expect(
      validateGeneratedUpload({
        kind: "voiceover",
        contentType: "audio/wav",
        sizeBytes: 100,
      }),
    ).toBe("wrong_mime_type");
  });

  it("refuses an empty file", () => {
    expect(
      validateGeneratedUpload({
        kind: "voiceover",
        contentType: "audio/mpeg",
        sizeBytes: 0,
      }),
    ).toBe("empty_file");
  });

  it("refuses a file over the kind's ceiling", () => {
    expect(
      validateGeneratedUpload({
        kind: "voiceover",
        contentType: "audio/mpeg",
        sizeBytes: GENERATED_KIND_RULES.voiceover.maxBytes + 1,
      }),
    ).toBe("too_large");
  });

  it("accepts a well-formed upload", () => {
    expect(
      validateGeneratedUpload({
        kind: "rendered_video",
        contentType: "video/mp4",
        sizeBytes: 1024,
      }),
    ).toBeNull();
  });
});

describe("boundaries stay where they are", () => {
  it("names exactly the two generated kinds", () => {
    expect([...GENERATED_KINDS]).toEqual(["rendered_video", "voiceover"]);
  });

  it("uses the one private bucket", () => {
    expect(GENERATED_MEDIA_BUCKET).toBe("generated-media");
  });

  it("keeps Google Drive read-only — no upload call anywhere in its module", () => {
    // Stage 8's boundary, re-asserted now that this stage writes files: the
    // only writable store is the private bucket. Drive stays a source.
    const driveFiles = ["client.ts", "config.ts", "import.ts", "media.ts"];
    for (const file of driveFiles) {
      let contents = "";
      try {
        contents = readFileSync(
          join(process.cwd(), "src/lib/drive", file),
          "utf8",
        );
      } catch {
        continue;
      }
      expect(contents, file).not.toMatch(/uploadType|multipart\/related/i);
      expect(contents, file).not.toMatch(/method:\s*["'](POST|PATCH|PUT)/);
    }
  });
});
