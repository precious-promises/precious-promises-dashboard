import {
  INSTAGRAM_API_VERSION,
  INSTAGRAM_GRAPH_BASE,
  INSTAGRAM_UPLOAD_BASE,
} from "./config";
import { InstagramApiError } from "./errors";
import {
  mapContainerStatus,
  permalinkFrom,
  type ContainerStatus,
  type InstagramAccount,
} from "./types";

/**
 * The Instagram Platform API client.
 *
 * `fetch` is injected throughout, so every call is testable without a network,
 * an account or a credential.
 *
 * **The access token goes in an `Authorization: Bearer` header.** Meta also
 * accepts it as an `access_token` query parameter, and much example code uses
 * that — this does not. A token in a query string is a token in browser
 * history, proxy logs and referrer headers.
 */

export interface InstagramRequestContext {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function jsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;

  if (text.trim() !== "") {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new InstagramApiError(response.status, body);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

/**
 * Who this authorisation belongs to.
 *
 * Called before a connection is recorded. A token proves somebody authorised
 * something; this proves which account — and a connection recorded without it
 * would present as working and fail every publish.
 */
export async function fetchAccount(
  context: InstagramRequestContext,
): Promise<InstagramAccount | null> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/me`);
  url.searchParams.set("fields", "id,username,account_type");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    id?: string;
    username?: string;
    account_type?: string;
  } | null;

  if (!body?.id) {
    return null;
  }

  return {
    id: body.id,
    // An account with no username is recorded as having none rather than being
    // given an invented handle.
    username: body.username ?? "",
    accountType: body.account_type ?? null,
  };
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export interface ReelContainerInput {
  igUserId: string;
  caption: string;
  shareToFeed: boolean;
  /** Bytes are uploaded separately; this only opens the container. */
  fileSizeBytes: number;
}

/**
 * Create a resumable Reel container.
 *
 * `upload_type=resumable` is what makes this path possible at all: it returns
 * a container whose bytes are POSTed directly to Meta, rather than a container
 * that expects Meta to fetch a publicly reachable URL.
 *
 * That distinction is the whole reason Reels are publishable here and images
 * are not — see `MEDIA_DELIVERY` in `./config`.
 */
export async function createReelContainer(
  context: InstagramRequestContext,
  input: ReelContainerInput,
): Promise<string> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(input.igUserId)}/media`,
  );

  const body = new URLSearchParams({
    media_type: "REELS",
    upload_type: "resumable",
    caption: input.caption,
    share_to_feed: input.shareToFeed ? "true" : "false",
  });

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const parsed = (await jsonOrThrow(response)) as { id?: string } | null;

  if (!parsed?.id) {
    throw new InstagramApiError(response.status, {
      error: {
        message: "Meta accepted the request but returned no container.",
      },
    });
  }

  return parsed.id;
}

/**
 * Send a Reel's bytes to an open container.
 *
 * `offset` and `file_size` are what make this resumable: a interrupted upload
 * can resume from the byte Meta already holds rather than starting again.
 *
 * Note the host — `rupload.facebook.com`, not the Graph API base. Posting this
 * to the Graph host fails in a way whose error message does not explain why.
 */
export async function uploadReelBytes(
  context: InstagramRequestContext,
  containerId: string,
  body: BodyInit,
  media: { fileSizeBytes: number; offset?: number },
): Promise<void> {
  const url = `${INSTAGRAM_UPLOAD_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(containerId)}`;

  const response = await (context.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      offset: String(media.offset ?? 0),
      file_size: String(media.fileSizeBytes),
    },
    body,
    duplex: "half",
  } as RequestInit);

  await jsonOrThrow(response);
}

export interface ContainerState {
  status: ContainerStatus;
  /** Meta's own error text, already classified by the caller. */
  errorMessage: string | null;
}

/**
 * Ask Meta what became of a container.
 *
 * A container must be `FINISHED` before it can be published. Publishing an
 * `IN_PROGRESS` container fails; publishing one that errored fails
 * differently. Polling is Meta's documented guidance, not an optimisation.
 */
export async function fetchContainerState(
  context: InstagramRequestContext,
  containerId: string,
): Promise<ContainerState> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(containerId)}`,
  );
  url.searchParams.set("fields", "status_code,status");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    status_code?: string;
    status?: string;
  } | null;

  return {
    status: mapContainerStatus(body?.status_code ?? null),
    errorMessage: body?.status ?? null,
  };
}

/**
 * Publish a finished container.
 *
 * Returns Meta's own media id — the only thing that proves a post exists, and
 * the only value that will let Stage 6 write `posted`.
 */
export async function publishContainer(
  context: InstagramRequestContext,
  igUserId: string,
  containerId: string,
): Promise<string> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(igUserId)}/media_publish`,
  );

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ creation_id: containerId }).toString(),
  });

  const parsed = (await jsonOrThrow(response)) as { id?: string } | null;

  if (!parsed?.id) {
    throw new InstagramApiError(response.status, {
      error: {
        message: "Meta accepted the publish but returned no media id.",
      },
    });
  }

  return parsed.id;
}

/**
 * Read a published post back.
 *
 * Used for the permalink, which cannot be constructed from a media id. Returns
 * `null` rather than throwing, because a post that exists but whose permalink
 * could not be read is still a successful publish.
 */
export async function fetchMedia(
  context: InstagramRequestContext,
  mediaId: string,
): Promise<{ permalink: string | null } | null> {
  const url = new URL(
    `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(mediaId)}`,
  );
  url.searchParams.set("fields", "id,permalink");

  try {
    const response = await (context.fetchImpl ?? fetch)(url.toString(), {
      method: "GET",
      headers: authHeaders(context.accessToken),
    });

    const body = (await jsonOrThrow(response)) as {
      permalink?: string;
    } | null;

    return body ? { permalink: permalinkFrom(body) } : null;
  } catch {
    return null;
  }
}
