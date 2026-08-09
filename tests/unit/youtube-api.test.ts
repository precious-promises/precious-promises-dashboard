// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  addToPlaylist,
  fetchMyChannel,
  fetchMyPlaylists,
  fetchProcessingStatus,
  queryUploadStatus,
  setThumbnail,
  startResumableUpload,
  uploadMedia,
} from "@/lib/youtube/api";
import { YOUTUBE_LIMITS } from "@/lib/youtube/config";
import {
  categoryForReason,
  categoryForStatus,
  classifyYouTubeError,
  reasonFrom,
  YouTubeApiError,
} from "@/lib/youtube/errors";
import { mapProcessingStatus, watchUrl } from "@/lib/youtube/types";
import type { VideoResource } from "@/lib/youtube/types";

/**
 * The YouTube Data API client.
 *
 * Every call takes its `fetch` as a parameter, so all of this runs with no
 * network, no account and no credential. The properties under test are the
 * ones that would be expensive to discover against a live channel: where the
 * token goes, what happens to an interrupted upload, and which failures are
 * worth retrying.
 */

const TOKEN = "ya29.a0AfB_TESTACCESSTOKEN";
const CONTEXT = { accessToken: TOKEN };

const RESOURCE: VideoResource = {
  snippet: { title: "Precious promises", description: "A word for today." },
  status: {
    privacyStatus: "private",
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: false,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("the access token", () => {
  it("travels only in the Authorization header, never in a URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));

    await fetchMyChannel({ ...CONTEXT, fetchImpl: fetchImpl as never });

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
      jsonResponse(
        {
          error: {
            code: 401,
            message: `Invalid Credentials for Bearer ${TOKEN}`,
            errors: [{ reason: "authError" }],
          },
        },
        401,
      ),
    );

    try {
      await fetchMyChannel({ ...CONTEXT, fetchImpl: fetchImpl as never });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
      expect((error as YouTubeApiError).safe.message).not.toContain(TOKEN);
    }
  });
});

describe("channel discovery", () => {
  it("reads the channel it was authorised for", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: "UC_channel",
            snippet: { title: "Precious Promises", customUrl: "@promises" },
          },
        ],
      }),
    );

    const channel = await fetchMyChannel({
      ...CONTEXT,
      fetchImpl: fetchImpl as never,
    });

    expect(channel).toEqual({
      id: "UC_channel",
      title: "Precious Promises",
      customUrl: "@promises",
    });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain("mine=true");
  });

  it("returns null when the Google account has no channel", async () => {
    // A real state, not an error. Connecting one as though it were a channel
    // would produce an account that can never upload.
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));

    expect(
      await fetchMyChannel({ ...CONTEXT, fetchImpl: fetchImpl as never }),
    ).toBeNull();
  });

  it("records an untitled channel as untitled rather than inventing a name", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ items: [{ id: "UC_channel", snippet: {} }] }),
    );

    const channel = await fetchMyChannel({
      ...CONTEXT,
      fetchImpl: fetchImpl as never,
    });

    expect(channel?.title).toBe("");
  });

  it("lists real playlists, so one can be chosen rather than typed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: "PL1",
            snippet: { title: "Promises" },
            contentDetails: { itemCount: 12 },
          },
        ],
      }),
    );

    expect(
      await fetchMyPlaylists({ ...CONTEXT, fetchImpl: fetchImpl as never }),
    ).toEqual([{ id: "PL1", title: "Promises", itemCount: 12 }]);
  });
});

describe("starting a resumable upload", () => {
  it("declares the size up front and returns the session URI", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
          status: 200,
          headers: { Location: "https://upload.example/session/abc" },
        }),
    );

    const uri = await startResumableUpload(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      RESOURCE,
      { contentLength: 12_345, contentType: "video/mp4" },
      { notifySubscribers: true },
    );

    expect(uri).toBe("https://upload.example/session/abc");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("uploadType=resumable");
    expect(url).toContain("notifySubscribers=true");
    const headers = init.headers as Record<string, string>;
    // Declaring the length lets YouTube refuse an over-size file before a
    // single byte of it is sent.
    expect(headers["X-Upload-Content-Length"]).toBe("12345");
    expect(headers["X-Upload-Content-Type"]).toBe("video/mp4");
  });

  it("refuses a 2xx that carries no session, rather than uploading nowhere", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    await expect(
      startResumableUpload(
        { ...CONTEXT, fetchImpl: fetchImpl as never },
        RESOURCE,
        { contentLength: 1, contentType: "video/mp4" },
        { notifySubscribers: false },
      ),
    ).rejects.toThrow(YouTubeApiError);
  });

  it("classifies a rejected title as invalid content", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 400,
            message: "Invalid title",
            errors: [{ reason: "invalidTitle" }],
          },
        },
        400,
      ),
    );

    try {
      await startResumableUpload(
        { ...CONTEXT, fetchImpl: fetchImpl as never },
        RESOURCE,
        { contentLength: 1, contentType: "video/mp4" },
        { notifySubscribers: false },
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as YouTubeApiError).safe.code).toBe("invalid_content");
      expect((error as YouTubeApiError).safe.retryable).toBe(false);
    }
  });
});

describe("sending the bytes", () => {
  it("returns the video id YouTube assigned", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "vid_abc123" }));

    expect(
      await uploadMedia(
        "https://upload.example/session/abc",
        new Uint8Array([1, 2, 3]) as unknown as BodyInit,
        { contentLength: 3, contentType: "video/mp4" },
        fetchImpl as never,
      ),
    ).toBe("vid_abc123");
  });

  it("refuses a success with no video id", async () => {
    // Without an id there is nothing that proves a publish happened, and
    // `postedUpdate` would refuse it downstream anyway.
    const fetchImpl = vi.fn(async () => jsonResponse({}));

    await expect(
      uploadMedia(
        "https://upload.example/session/abc",
        new Uint8Array([1]) as unknown as BodyInit,
        { contentLength: 1, contentType: "video/mp4" },
        fetchImpl as never,
      ),
    ).rejects.toThrow(YouTubeApiError);
  });
});

describe("asking an interrupted upload what happened", () => {
  it("reports how many bytes YouTube already holds", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
          status: 308,
          headers: { Range: "bytes=0-524287" },
        }),
    );

    expect(
      await queryUploadStatus(
        "https://upload.example/session/abc",
        1_000_000,
        fetchImpl as never,
      ),
    ).toEqual({ state: "incomplete", bytesReceived: 524_288 });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)["Content-Range"]).toBe(
      "bytes */1000000",
    );
  });

  it("reports no bytes when there is no Range header", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 308 }));

    expect(
      await queryUploadStatus("https://u", 10, fetchImpl as never),
    ).toEqual({ state: "incomplete", bytesReceived: 0 });
  });

  it("returns the existing video id when the upload already completed", async () => {
    // The decisive case: this is what stops a crashed worker publishing a
    // second copy of a video YouTube already accepted.
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "vid_abc123" }));

    expect(
      await queryUploadStatus("https://u", 10, fetchImpl as never),
    ).toEqual({ state: "complete", videoId: "vid_abc123" });
  });

  it("reports an expired session as gone rather than retrying into nothing", async () => {
    for (const status of [404, 410]) {
      const fetchImpl = vi.fn(async () => new Response("", { status }));

      expect(
        await queryUploadStatus("https://u", 10, fetchImpl as never),
        String(status),
      ).toEqual({ state: "gone" });
    }
  });
});

describe("thumbnails", () => {
  it("refuses an oversized image before sending it", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));

    await expect(
      setThumbnail({ ...CONTEXT, fetchImpl: fetchImpl as never }, "vid", {
        bytes: new Uint8Array(YOUTUBE_LIMITS.thumbnailBytes + 1),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(YouTubeApiError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a format YouTube does not accept", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));

    await expect(
      setThumbnail({ ...CONTEXT, fetchImpl: fetchImpl as never }, "vid", {
        bytes: new Uint8Array(10),
        contentType: "image/webp",
      }),
    ).rejects.toThrow(YouTubeApiError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uploads an acceptable image against the video id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));

    await setThumbnail({ ...CONTEXT, fetchImpl: fetchImpl as never }, "vid", {
      bytes: new Uint8Array(10),
      contentType: "image/png",
    });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toContain("videoId=vid");
    expect(url).toContain("uploadType=media");
  });
});

describe("playlists", () => {
  it("files the video under the chosen playlist", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "PLI1" }));

    await addToPlaylist(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "PL1",
      "vid",
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      snippet: {
        playlistId: "PL1",
        resourceId: { kind: "youtube#video", videoId: "vid" },
      },
    });
  });
});

describe("processing status", () => {
  it("distinguishes uploaded from processed", async () => {
    // Uploaded is not published. Conflating them would assert a video is live
    // when YouTube may still be working on it — or may have rejected it.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            processingDetails: { processingStatus: "processing" },
            status: { privacyStatus: "private" },
          },
        ],
      }),
    );

    expect(
      await fetchProcessingStatus(
        { ...CONTEXT, fetchImpl: fetchImpl as never },
        "vid",
      ),
    ).toEqual({
      status: "processing",
      privacyStatus: "private",
      rejectionReason: null,
    });
  });

  it("surfaces a rejection", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            processingDetails: { processingStatus: "failed" },
            status: { privacyStatus: "private", rejectionReason: "copyright" },
          },
        ],
      }),
    );

    const result = await fetchProcessingStatus(
      { ...CONTEXT, fetchImpl: fetchImpl as never },
      "vid",
    );

    expect(result?.status).toBe("processing_failed");
    expect(result?.rejectionReason).toBe("copyright");
  });

  it("maps an unfamiliar status to uploaded rather than inventing one", () => {
    expect(mapProcessingStatus("succeeded")).toBe("processed");
    expect(mapProcessingStatus("terminated")).toBe("processing_failed");
    expect(mapProcessingStatus("something-new")).toBe("uploaded");
    expect(mapProcessingStatus(null)).toBe("uploaded");
  });

  it("returns null for a video YouTube does not know about", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));

    expect(
      await fetchProcessingStatus(
        { ...CONTEXT, fetchImpl: fetchImpl as never },
        "vid",
      ),
    ).toBeNull();
  });
});

describe("error classification", () => {
  it("reads the documented reason out of an error body", () => {
    expect(
      reasonFrom({ error: { errors: [{ reason: "quotaExceeded" }] } }),
    ).toBe("quotaExceeded");
    expect(reasonFrom({})).toBeNull();
    expect(reasonFrom(null)).toBeNull();
  });

  it("treats quota exhaustion as retryable, because the day resets", () => {
    expect(categoryForReason("quotaExceeded")).toBe("provider_rate_limited");
    expect(categoryForReason("rateLimitExceeded")).toBe(
      "provider_rate_limited",
    );
  });

  it("treats a lost authorisation as non-retryable", () => {
    for (const reason of ["authError", "forbidden", "accountSuspended"]) {
      expect(categoryForReason(reason), reason).toBe(
        "provider_permission_revoked",
      );
    }
  });

  it("treats rejected metadata as non-retryable", () => {
    for (const reason of [
      "invalidTitle",
      "invalidDescription",
      "invalidTags",
    ]) {
      expect(categoryForReason(reason), reason).toBe("invalid_content");
    }
  });

  it("returns null for an unfamiliar reason, so the status decides", () => {
    expect(categoryForReason("somethingNobodyHasSeen")).toBeNull();
  });

  it("reads a bare 403 as a permission problem, which stops rather than retries", () => {
    expect(categoryForStatus(403)).toBe("provider_permission_revoked");
    expect(categoryForStatus(429)).toBe("provider_rate_limited");
    expect(categoryForStatus(503)).toBe("provider_unavailable");
    expect(categoryForStatus(400)).toBe("invalid_content");
  });

  it("prefers the reason over the status", () => {
    // A 403 covers both "quota exhausted, try tomorrow" and "this channel is
    // suspended", and those are not the same answer.
    const quota = classifyYouTubeError(403, {
      error: { message: "quota", errors: [{ reason: "quotaExceeded" }] },
    });

    expect(quota.code).toBe("provider_rate_limited");
    expect(quota.retryable).toBe(true);
  });

  it("redacts a credential that appeared in the platform's message", () => {
    const safe = classifyYouTubeError(401, {
      error: { message: "Bearer ya29.leaked-value rejected" },
    });

    expect(safe.message).not.toContain("ya29.leaked-value");
  });
});

describe("watch URLs", () => {
  it("builds the canonical URL for a video id", () => {
    expect(watchUrl("abc123")).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("escapes an id rather than pasting it in raw", () => {
    expect(watchUrl("a b&c")).toBe("https://www.youtube.com/watch?v=a%20b%26c");
  });
});
