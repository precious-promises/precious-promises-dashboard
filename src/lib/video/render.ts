import type { AspectRatio, VideoProject, VideoScene } from "./types";

/**
 * Rendering: the model, the state machine, and the seam.
 *
 * **No rendering provider is connected.** Nothing in this application produces
 * a video file. That is a fact recorded here rather than hidden behind a stub,
 * because a stub returning a plausible job would be indistinguishable from a
 * working renderer at the call site — and a "completed" render with no file is
 * exactly the failure the project rules forbid.
 *
 * The recommended architecture, and why rendering cannot live in a Next.js
 * request, is documented in docs/stage-4-video-studio.md.
 */

export const RENDER_STATUSES = [
  "queued",
  "rendering",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

export const RENDER_STATUS_LABELS: Record<RenderStatus, string> = {
  queued: "Queued",
  rendering: "Rendering",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Statuses from which nothing further happens. */
export const TERMINAL_RENDER_STATUSES: readonly RenderStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export function isTerminalRenderStatus(status: RenderStatus): boolean {
  return TERMINAL_RENDER_STATUSES.includes(status);
}

/**
 * The permitted moves.
 *
 * Read as: from → the statuses that may follow.
 *
 * Note there is no edge into `completed` from anywhere but `rendering`. A job
 * cannot jump from queued to completed, so a request that was never picked up
 * by a worker cannot be written down as a finished render.
 */
const RENDER_TRANSITIONS: Record<RenderStatus, readonly RenderStatus[]> = {
  queued: ["rendering", "failed", "cancelled"],
  rendering: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRender(
  from: RenderStatus,
  to: RenderStatus,
): boolean {
  return RENDER_TRANSITIONS[from].includes(to);
}

export const RENDER_PROVIDERS = [
  "none",
  "remotion_worker",
  "remotion_lambda",
] as const;
export type RenderProviderId = (typeof RENDER_PROVIDERS)[number];

export const RENDER_PROVIDER_LABELS: Record<RenderProviderId, string> = {
  none: "No provider connected",
  remotion_worker: "Remotion worker (container)",
  remotion_lambda: "Remotion Lambda",
};

export interface RenderJob {
  id: string;
  owner_id: string;
  project_id: string;
  status: RenderStatus;
  provider: RenderProviderId;
  project_revision: number;
  failure_reason: string | null;
  output_media_asset_id: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Everything a renderer needs, with no database or HTTP types in it. */
export interface RenderRequest {
  project: Pick<VideoProject, "id" | "name" | "current_revision">;
  aspectRatio: AspectRatio;
  scenes: VideoScene[];
}

export interface RenderAccepted {
  accepted: true;
  providerJobId: string;
}

export interface RenderRefused {
  accepted: false;
  /** Why the render did not start. Shown to the owner verbatim. */
  reason: string;
}

export type RenderOutcome = RenderAccepted | RenderRefused;

/**
 * The seam a real renderer slots into.
 *
 * `submit` returns whether the provider *accepted* the job — never whether a
 * video exists. Completion is reported later by the worker updating the job,
 * so no code path in this application can mark a render finished.
 */
export interface RenderProvider {
  readonly id: RenderProviderId;
  isConnected(): Promise<boolean>;
  submit(request: RenderRequest): Promise<RenderOutcome>;
}

/**
 * The provider registry.
 *
 * Stage 4 hard-coded `null`; Stage 11 made this a registry the same way the
 * analytics adapters register themselves. This module stays pure and
 * client-safe — the Remotion provider registers from a server-only module
 * (`@/lib/render/register`), so a browser bundle that imports this file gets
 * an empty registry and the same honest `null` it always did.
 */
let registeredFactory: (() => RenderProvider | null) | null = null;

export function registerRenderProvider(
  factory: () => RenderProvider | null,
): void {
  registeredFactory = factory;
}

/** Intended for tests. */
export function clearRenderProvider(): void {
  registeredFactory = null;
}

/**
 * The configured provider, or `null`.
 *
 * `null` still means exactly what it meant in Stage 4: nothing can render,
 * and callers must handle the absence. A registered factory may itself
 * return `null` when the runtime is not configured for rendering — a
 * provider that exists in code is not a provider that is connected.
 */
export function getRenderProvider(): RenderProvider | null {
  return registeredFactory === null ? null : registeredFactory();
}

export const NO_PROVIDER_REASON =
  "No rendering provider is registered in this runtime, so nothing was rendered.";

/**
 * Ask for a render.
 *
 * With no provider configured this always refuses, and the refusal is what
 * gets written to `render_jobs` as a failure. A request that quietly sat in
 * `queued` forever would look like work in progress; a recorded failure is the
 * truth.
 */
export async function requestRender(
  request: RenderRequest,
): Promise<RenderOutcome> {
  const provider = getRenderProvider();
  if (provider === null) {
    return { accepted: false, reason: NO_PROVIDER_REASON };
  }

  if (!(await provider.isConnected())) {
    return {
      accepted: false,
      reason: `${RENDER_PROVIDER_LABELS[provider.id]} is not reachable.`,
    };
  }

  return provider.submit(request);
}

export interface RenderCapability {
  connected: boolean;
  providerId: RenderProviderId;
  detail: string;
}

/** Connection state, for display. Honest by construction. */
export function describeRenderCapability(): RenderCapability {
  const provider = getRenderProvider();
  if (provider === null) {
    return {
      connected: false,
      providerId: "none",
      detail:
        "Preview runs in your browser. Server rendering needs a worker with a headless browser and FFmpeg, which is not deployed.",
    };
  }
  return {
    connected: true,
    providerId: provider.id,
    detail: RENDER_PROVIDER_LABELS[provider.id],
  };
}
