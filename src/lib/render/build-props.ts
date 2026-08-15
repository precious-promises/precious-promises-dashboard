import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import type { ScriptRevision } from "@/lib/scripts/types";
import { createSignedDownloadUrl } from "@/lib/storage/generated";
import { resolveScene } from "@/lib/video/preview";
import type {
  ProductionAsset,
  VideoProject,
  VideoScene,
} from "@/lib/video/types";

import type {
  RenderScene,
  RenderSceneBody,
  RenderVideoProps,
} from "@/remotion/props";

/**
 * Turn stored records into render props.
 *
 * Scene text is resolved through exactly the same functions the preview
 * uses — Scripture from the verified content record, script text from the
 * referenced revision — so the rendered words are the stored words, always.
 *
 * Media in a composition must resolve to a URL the headless browser can
 * read. Generated files resolve to short-lived signed URLs. **Drive-hosted
 * media is refused, not skipped**: a render that silently dropped the
 * voiceover Dave attached would be a quiet lie, so an unresolvable slot
 * fails the build with the slot named.
 */

export interface PropsBuildFailure {
  ok: false;
  category: "invalid_composition" | "storage_error";
  reason: string;
}

export type PropsBuildResult =
  { ok: true; props: RenderVideoProps } | PropsBuildFailure;

function fail(
  category: PropsBuildFailure["category"],
  reason: string,
): PropsBuildFailure {
  return { ok: false, category, reason };
}

async function signedUrlFor(
  client: SupabaseClient,
  asset: MediaAsset,
  slotLabel: string,
): Promise<{ ok: true; url: string } | PropsBuildFailure> {
  if (
    asset.storage_provider !== "supabase_storage" ||
    !asset.external_file_id
  ) {
    return fail(
      "invalid_composition",
      `${slotLabel} is stored in ${asset.storage_provider}, which cannot yet be streamed into a render. Only generated media can be composed today; the slot must be cleared or replaced before rendering.`,
    );
  }

  const signed = await createSignedDownloadUrl(
    client,
    asset.owner_id,
    asset.external_file_id,
    // The render may run for many minutes on long compositions; the read
    // URL must outlive it. One hour, still expiring.
    3600,
  );
  if (!signed.ok) {
    return fail(
      "storage_error",
      `${slotLabel} could not be opened from generated storage.`,
    );
  }
  return { ok: true, url: signed.value };
}

function bodyFor(
  scene: VideoScene,
  item: ContentItem | null,
  script: ScriptRevision | null,
): RenderSceneBody {
  const resolved = resolveScene(scene, item, script);

  if (resolved.body.kind === "scripture") {
    const { reference, text, translation } = resolved.body;
    if (reference === null || text === null || text.trim() === "") {
      return { kind: "none" };
    }
    return { kind: "scripture", text, reference, translation };
  }

  const text = resolved.body.text;
  if (text === null || text.trim() === "") {
    return { kind: "none" };
  }
  return { kind: "prose", text };
}

export async function buildRenderProps(
  client: SupabaseClient,
  input: {
    project: VideoProject;
    scenes: VideoScene[];
    item: ContentItem | null;
    script: ScriptRevision | null;
    productionAssets: { slot: ProductionAsset; asset: MediaAsset | null }[];
    brandLine: string | null;
  },
): Promise<PropsBuildResult> {
  if (input.scenes.length === 0) {
    return fail("invalid_composition", "The project has no scenes to render.");
  }

  // A Scripture scene with no recorded verse cannot be rendered honestly.
  for (const scene of input.scenes) {
    if (scene.scene_type === "scripture") {
      const body = bodyFor(scene, input.item, input.script);
      if (body.kind !== "scripture") {
        return fail(
          "invalid_composition",
          "A Scripture scene has no recorded verse. Record the passage on the content item before rendering — the renderer will not substitute anything.",
        );
      }
    }
  }

  const assetById = new Map(
    input.productionAssets
      .filter((entry) => entry.asset !== null)
      .map((entry) => [entry.slot.media_asset_id, entry.asset as MediaAsset]),
  );

  const scenes: RenderScene[] = [];
  for (const scene of input.scenes) {
    let backgroundUrl: string | null = null;
    let backgroundKind: "video" | "image" | null = null;

    if (scene.media_asset_id !== null) {
      const asset = assetById.get(scene.media_asset_id) ?? null;
      if (asset !== null) {
        const url = await signedUrlFor(
          client,
          asset,
          `The background on scene ${scene.scene_order}`,
        );
        if (!url.ok) {
          return url;
        }
        backgroundUrl = url.url;
        backgroundKind = asset.media_type === "image" ? "image" : "video";
      }
    }

    scenes.push({
      id: scene.id,
      sceneType: scene.scene_type,
      durationSeconds: Number(scene.duration_seconds),
      transition: scene.transition,
      textPosition: scene.text_position,
      textAlign: scene.text_align,
      textAnimation: scene.text_animation,
      body: bodyFor(scene, input.item, input.script),
      backgroundUrl,
      backgroundKind,
    });
  }

  let voiceoverUrl: string | null = null;
  const voiceoverSlot = input.productionAssets.find(
    (entry) => entry.slot.role === "voiceover",
  );
  if (voiceoverSlot && voiceoverSlot.asset) {
    const url = await signedUrlFor(
      client,
      voiceoverSlot.asset,
      "The voiceover",
    );
    if (!url.ok) {
      return url;
    }
    voiceoverUrl = url.url;
  }

  return {
    ok: true,
    props: {
      title: input.project.name,
      aspectRatio: input.project.aspect_ratio,
      scenes,
      brandLine: input.brandLine,
      voiceoverUrl,
    },
  };
}
