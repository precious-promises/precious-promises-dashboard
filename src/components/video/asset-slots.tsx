import {
  clearProductionAsset,
  setProductionAsset,
} from "@/app/dashboard/video/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MediaAsset } from "@/lib/media/types";
import {
  PRODUCTION_ASSET_ROLES,
  PRODUCTION_ASSET_ROLE_HINTS,
  PRODUCTION_ASSET_ROLE_LABELS,
  type ProductionAsset,
} from "@/lib/video/types";

/**
 * Project-level media slots.
 *
 * A slot points at a row in the media library. **No file is uploaded, fetched
 * or played** — no storage provider is connected, so attaching an asset records
 * an intent, and the panel says as much rather than implying the media is
 * present.
 *
 * The voiceover slot takes a file the owner supplies. Nothing here synthesises
 * speech, and the caption slot transcribes nothing.
 */
export function AssetSlots({
  projectId,
  assets,
  mediaAssets,
}: {
  projectId: string;
  assets: ProductionAsset[];
  mediaAssets: MediaAsset[];
}) {
  if (mediaAssets.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-secondary">
          No media assets are recorded yet, so there is nothing to attach.
        </p>
        <p className="text-xs text-ink-muted">
          Slots exist for background video, background image, background audio,
          voiceover, logo and captions. Each takes a file you supply — nothing
          here generates audio, footage or subtitles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {PRODUCTION_ASSET_ROLES.map((role) => {
        const filled = assets.find((asset) => asset.role === role);

        return (
          <div
            key={role}
            className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-primary">
                {PRODUCTION_ASSET_ROLE_LABELS[role]}
              </span>
              <StatusBadge tone={filled ? "configured" : "inactive"}>
                {filled ? "Attached" : "Empty"}
              </StatusBadge>
            </div>

            <p className="mb-2 text-xs text-ink-muted">
              {PRODUCTION_ASSET_ROLE_HINTS[role]}
            </p>

            <form action={setProductionAsset} className="flex flex-wrap gap-2">
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="role" value={role} />
              <label className="sr-only" htmlFor={`asset-${role}`}>
                {PRODUCTION_ASSET_ROLE_LABELS[role]} asset
              </label>
              <select
                id={`asset-${role}`}
                name="media_asset_id"
                defaultValue={filled?.media_asset_id ?? ""}
                className="min-w-0 flex-1 rounded-lg border border-edge bg-panel-raised/50 px-2.5 py-1.5 text-xs text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
              >
                <option value="">Choose an asset…</option>
                {mediaAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Attach
              </button>
            </form>

            {filled ? (
              <form action={clearProductionAsset} className="mt-2">
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  className="text-xs text-ink-muted underline underline-offset-2 transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Clear this slot
                </button>
              </form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
