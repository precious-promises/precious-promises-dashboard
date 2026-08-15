import {
  registerRenderProvider,
  type RenderOutcome,
  type RenderProvider,
  type RenderRequest,
} from "@/lib/video/render";

import { resolveRenderConfig } from "./server-config";

/**
 * The Remotion worker provider, registered as a side effect of importing
 * this module — the same pattern the analytics adapters use. Server-only:
 * nothing in a browser bundle imports this, so the registry stays empty
 * there and `getRenderProvider()` keeps returning `null`.
 *
 * `submit` accepts or refuses; it never renders. Rendering happens in
 * `src/lib/render/worker.ts` under a background-capable context, and only
 * that worker — never this provider — can move a job towards `completed`.
 */
class RemotionWorkerProvider implements RenderProvider {
  readonly id = "remotion_worker" as const;

  async isConnected(): Promise<boolean> {
    return resolveRenderConfig().config !== null;
  }

  async submit(request: RenderRequest): Promise<RenderOutcome> {
    const { config, problems } = resolveRenderConfig();
    if (config === null) {
      return { accepted: false, reason: problems.join(" ") };
    }

    if (request.scenes.length === 0) {
      return {
        accepted: false,
        reason: "The project has no scenes, so there is nothing to render.",
      };
    }

    return {
      accepted: true,
      providerJobId: `remotion-${request.project.id}-r${request.project.current_revision}`,
    };
  }
}

const provider = new RemotionWorkerProvider();

registerRenderProvider(() => provider);

export { RemotionWorkerProvider };
