/**
 * The generated-media bucket, described.
 *
 * Pure vocabulary and validation — no client, no I/O — so it can be imported
 * by tests and by either runtime. Everything that actually touches the bucket
 * lives in `./generated.ts` and requires the trusted worker credential.
 */

/** The one private bucket this application generates files into. */
export const GENERATED_MEDIA_BUCKET = "generated-media";

/**
 * What this application can generate. Each kind carries its own MIME
 * allowlist and size ceiling, enforced before a byte is written — a file that
 * claims to be a rendered video but is not video/mp4 is refused, not stored.
 */
export const GENERATED_KINDS = ["rendered_video", "voiceover"] as const;
export type GeneratedKind = (typeof GENERATED_KINDS)[number];

export const GENERATED_KIND_LABELS: Record<GeneratedKind, string> = {
  rendered_video: "Rendered video",
  voiceover: "Voiceover",
};

interface KindRules {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
  extension: string;
}

export const GENERATED_KIND_RULES: Record<GeneratedKind, KindRules> = {
  rendered_video: {
    allowedMimeTypes: ["video/mp4"],
    // Long-form renders are real files. Two gigabytes is a ceiling against
    // runaway output, not a promise the storage plan can hold it.
    maxBytes: 2 * 1024 * 1024 * 1024,
    extension: "mp4",
  },
  voiceover: {
    allowedMimeTypes: ["audio/mpeg"],
    maxBytes: 100 * 1024 * 1024,
    extension: "mp3",
  },
};

/**
 * How long a signed download URL lives.
 *
 * Ten minutes: long enough to start a download or preview, short enough that
 * a leaked URL is a narrow window rather than a standing grant. There are no
 * permanent public URLs to generated media, anywhere.
 */
export const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Build an object key.
 *
 * Always `<ownerId>/<kind>/<name>.<ext>`, always constructed here from typed
 * parts, never accepted from a request. The owner prefix is the ownership
 * boundary every read path re-checks.
 */
export function generatedObjectKey(
  ownerId: string,
  kind: GeneratedKind,
  name: string,
): string {
  return `${ownerId}/${kind}/${sanitiseObjectName(name)}.${GENERATED_KIND_RULES[kind].extension}`;
}

/**
 * Strip anything that could traverse, escape or confuse a path.
 *
 * Keys are built from UUIDs this code generated, so in practice this changes
 * nothing — which is exactly when a sanitiser is cheapest to keep.
 */
export function sanitiseObjectName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-{2,}/g, "-");
  const trimmed = cleaned.replace(/^-+|-+$/g, "");
  return trimmed === "" ? "unnamed" : trimmed.slice(0, 120);
}

/** Whether an object key belongs to this owner. The read-path boundary. */
export function keyBelongsToOwner(key: string, ownerId: string): boolean {
  return ownerId !== "" && key.startsWith(`${ownerId}/`);
}

export type GeneratedMediaRefusal =
  | "wrong_mime_type"
  | "too_large"
  | "empty_file"
  | "not_owner"
  | "no_worker_credential"
  | "not_found"
  | "storage_error";

export const GENERATED_MEDIA_REFUSAL_MESSAGES: Record<
  GeneratedMediaRefusal,
  string
> = {
  wrong_mime_type:
    "The file's type does not match what this kind of generated media is allowed to be.",
  too_large: "The file is larger than the ceiling for this kind of media.",
  empty_file: "The file is empty. Nothing was stored.",
  not_owner: "That file does not belong to this owner.",
  no_worker_credential:
    "No trusted worker credential is configured, so generated media cannot be read or written.",
  not_found: "That file does not exist in generated storage.",
  storage_error: "The storage service refused the operation.",
};

/** Validate a prospective upload. Pure; the caller supplies the facts. */
export function validateGeneratedUpload(input: {
  kind: GeneratedKind;
  contentType: string;
  sizeBytes: number;
}): GeneratedMediaRefusal | null {
  const rules = GENERATED_KIND_RULES[input.kind];
  if (input.sizeBytes <= 0) {
    return "empty_file";
  }
  if (input.sizeBytes > rules.maxBytes) {
    return "too_large";
  }
  if (!rules.allowedMimeTypes.includes(input.contentType)) {
    return "wrong_mime_type";
  }
  return null;
}
