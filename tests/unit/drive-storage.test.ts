// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  DriveApiError,
  folderExists,
  getFile,
  listFolder,
  mapFile,
  openFileStream,
  quoteDriveId,
} from "@/lib/drive/api";
import {
  DRIVE_SCOPE,
  FOLDER_MIME_TYPE,
  isFolder,
  mediaTypeForMime,
  safeFilename,
} from "@/lib/drive/config";
import { fileIsInsideRoot, isInsideRoot } from "@/lib/drive/root";
import { parseSize, refusalMessage } from "@/lib/drive/types";

/**
 * Google Drive retrieval, and the folder boundary that governs it.
 *
 * The boundary is the important part. Google grants read access to the whole
 * Drive — it offers no folder-scoped read scope — so containment is enforced
 * here, in application logic, and these tests are what hold it.
 *
 * Every check **fails closed**: anything the walk cannot prove is treated as
 * outside the root.
 */

const ROOT = "root-folder-id";
const TOKEN = "ya29.DRIVE_TEST_TOKEN";
const CONTEXT = { accessToken: TOKEN };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A fake Drive that answers `files.get` from a fixed parent map. */
function driveWith(parents: Record<string, string[]>) {
  return vi.fn(async (url: string) => {
    const match = /\/files\/([^?]+)/.exec(url);
    const id = match ? decodeURIComponent(match[1]) : "";

    if (!(id in parents)) {
      return new Response("", { status: 404 });
    }

    return jsonResponse({
      id,
      name: id,
      mimeType: FOLDER_MIME_TYPE,
      parents: parents[id],
      trashed: false,
    });
  });
}

describe("the access token", () => {
  it("travels only in the Authorization header, never in a URL", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: "f1", mimeType: "video/mp4" }),
    );

    await getFile({ ...CONTEXT, fetchImpl: fetchImpl as never }, "f1");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).not.toContain(TOKEN);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("is not echoed into a thrown error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: `Invalid credentials ${TOKEN}` } }, 401),
    );

    try {
      await listFolder({ ...CONTEXT, fetchImpl: fetchImpl as never }, ROOT);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
    }
  });
});

describe("the folder boundary", () => {
  it("accepts the root itself", async () => {
    const fetchImpl = driveWith({});

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      ROOT,
      ROOT,
    );

    expect(result.inside).toBe(true);
    expect(result.reason).toBe("is_root");
    // Answered without a request at all.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a direct child", async () => {
    const fetchImpl = driveWith({ child: [ROOT] });

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "child",
      ROOT,
    );

    expect(result.inside).toBe(true);
  });

  it("accepts a deeply nested descendant", async () => {
    const fetchImpl = driveWith({
      deep: ["mid2"],
      mid2: ["mid1"],
      mid1: [ROOT],
    });

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "deep",
      ROOT,
    );

    expect(result.inside).toBe(true);
    expect(result.reason).toBe("descends_from_root");
  });

  it("refuses a file that reaches the top of the Drive without meeting the root", async () => {
    const fetchImpl = driveWith({
      outside: ["someone-elses-folder"],
      "someone-elses-folder": [],
    });

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "outside",
      ROOT,
    );

    expect(result.inside).toBe(false);
    expect(result.reason).toBe("no_parents");
  });

  it("refuses a file Drive does not have", async () => {
    const fetchImpl = driveWith({});

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "ghost",
      ROOT,
    );

    expect(result.inside).toBe(false);
    expect(result.reason).toBe("not_found");
  });

  it("refuses rather than hanging when the hierarchy cycles", async () => {
    // Drive's hierarchy is a graph. A cycle must terminate, and terminate as a
    // refusal — never as an accidental acceptance.
    const fetchImpl = driveWith({ a: ["b"], b: ["a"] });

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "a",
      ROOT,
    );

    expect(result.inside).toBe(false);
  });

  it("refuses a chain deeper than the bound rather than trusting it", async () => {
    const parents: Record<string, string[]> = {};
    for (let i = 0; i < 40; i += 1) {
      parents[`f${i}`] = [`f${i + 1}`];
    }
    parents.f40 = [ROOT];

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: driveWith(parents) as never },
      "f0",
      ROOT,
    );

    expect(result.inside).toBe(false);
    expect(result.reason).toBe("depth_exceeded");
  });

  it("refuses when Drive cannot be reached, rather than assuming containment", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await isInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "child",
      ROOT,
    );

    expect(result.inside).toBe(false);
    expect(result.reason).toBe("unreachable");
  });

  it("follows every parent, not just the first", async () => {
    // A file can have several parents. Following only the first would refuse a
    // file that is genuinely inside the root by a second path.
    const fetchImpl = driveWith({
      multi: ["elsewhere", ROOT],
      elsewhere: [],
    });

    const result = await fileIsInsideRoot(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      {
        id: "multi",
        name: "multi",
        mimeType: "video/mp4",
        sizeBytes: 1,
        parents: ["elsewhere", ROOT],
        trashed: false,
        modifiedTime: null,
        width: null,
        height: null,
        durationSeconds: null,
      },
      ROOT,
    );

    expect(result.inside).toBe(true);
  });
});

describe("folder listing", () => {
  it("scopes the query to one folder and excludes the bin", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ files: [] }));

    await listFolder({ ...CONTEXT, fetchImpl: fetchImpl as never }, ROOT);

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    const q = new URL(url).searchParams.get("q") ?? "";

    expect(q).toContain(`'${ROOT}' in parents`);
    expect(q).toContain("trashed = false");
  });

  it("escapes a folder id so it cannot close the literal and add a clause", () => {
    // This is a query language taking a caller-supplied value.
    expect(quoteDriveId("a'b")).toBe("'a\\'b'");
    expect(quoteDriveId("a\\b")).toBe("'a\\\\b'");
  });

  it("drops entries Drive returned without an id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        files: [{ name: "no id" }, { id: "ok", mimeType: "video/mp4" }],
      }),
    );

    const listing = await listFolder(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      ROOT,
    );

    expect(listing.files.map((file) => file.id)).toEqual(["ok"]);
  });

  it("recognises a folder", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: ROOT, mimeType: FOLDER_MIME_TYPE, trashed: false }),
    );

    expect(
      await folderExists({ ...CONTEXT, fetchImpl: fetchImpl as never }, ROOT),
    ).toBe(true);
  });
});

describe("file mapping", () => {
  it("parses Drive's string size without turning absence into zero", () => {
    expect(parseSize("12345")).toBe(12345);
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize("")).toBeNull();
    expect(parseSize("not a number")).toBeNull();
  });

  it("reads dimensions and duration when Drive supplies them", () => {
    const file = mapFile({
      id: "v1",
      name: "clip.mp4",
      mimeType: "video/mp4",
      size: "5000",
      parents: [ROOT],
      videoMediaMetadata: {
        width: 1080,
        height: 1920,
        durationMillis: "45000",
      },
    });

    expect(file?.width).toBe(1080);
    expect(file?.durationSeconds).toBe(45);
  });

  it("returns null for something that is not a file resource", () => {
    expect(mapFile(null)).toBeNull();
    expect(mapFile({ name: "no id" })).toBeNull();
  });
});

describe("what can be published", () => {
  it("allows only a small set of media types", () => {
    expect(mediaTypeForMime("video/mp4")).toBe("video");
    expect(mediaTypeForMime("image/png")).toBe("image");
    expect(mediaTypeForMime("audio/mpeg")).toBe("audio");
  });

  it("refuses a Google Doc, which has no bytes to download", () => {
    expect(mediaTypeForMime("application/vnd.google-apps.document")).toBeNull();
    expect(mediaTypeForMime(FOLDER_MIME_TYPE)).toBeNull();
    expect(isFolder(FOLDER_MIME_TYPE)).toBe(true);
  });
});

describe("filenames are made safe before they reach a header", () => {
  it("strips newlines, which would be header injection", () => {
    expect(safeFilename("clip\r\nX-Evil: yes.mp4")).not.toContain("\n");
    expect(safeFilename("clip\r\nX-Evil: yes.mp4")).not.toContain("\r");
  });

  it("strips path separators and quotes", () => {
    expect(safeFilename('../../etc/"passwd"')).not.toContain("/");
    expect(safeFilename('a"b')).not.toContain('"');
  });

  it("never returns an empty name", () => {
    expect(safeFilename("   ")).toBe("untitled");
  });

  it("bounds the length", () => {
    expect(safeFilename("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe("downloading", () => {
  it("asks for the bytes, not the metadata", async () => {
    const fetchImpl = vi.fn(async () => new Response("bytes", { status: 200 }));

    await openFileStream({ ...CONTEXT, fetchImpl: fetchImpl as never }, "f1");

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(new URL(url).searchParams.get("alt")).toBe("media");
  });

  it("throws a classified error rather than returning an error page", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));

    await expect(
      openFileStream({ ...CONTEXT, fetchImpl: fetchImpl as never }, "f1"),
    ).rejects.toThrow(DriveApiError);
  });
});

describe("the scope is stated honestly", () => {
  const SRC_ROOT = join(process.cwd(), "src");

  function sourceFiles(): string[] {
    return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry) => join(SRC_ROOT, entry));
  }

  it("requests read-only access, never write", () => {
    expect(DRIVE_SCOPE).toContain("drive.readonly");
  });

  it("has no code path that writes to Drive", () => {
    // A read-only scope could not write anyway, but nothing should be trying:
    // the absence is the design, not an accident of the grant.
    const driveFiles = sourceFiles().filter((file) =>
      file.includes(join("src", "lib", "drive")),
    );

    expect(driveFiles.length).toBeGreaterThan(0);
    for (const file of driveFiles) {
      const contents = readFileSync(file, "utf8");
      expect(contents, file).not.toMatch(
        /method:\s*["'](POST|PATCH|DELETE)["']/,
      );
    }
  });

  it("gives every refusal a sentence the owner can act on", () => {
    for (const refusal of [
      "outside_root",
      "not_found",
      "trashed",
      "unsupported_type",
      "no_size",
    ] as const) {
      expect(refusalMessage(refusal).length, refusal).toBeGreaterThan(15);
    }
  });
});
