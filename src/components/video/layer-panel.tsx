import { Plus } from "lucide-react";

import { addScene } from "@/app/dashboard/video/actions";
import {
  SCENE_TYPE_HINTS,
  SCENE_TYPE_LABELS,
  SCENE_TYPES,
} from "@/lib/video/types";

/**
 * The layer palette.
 *
 * One button per layer type. Adding a Scripture layer creates a scene that
 * references the content item's verified verse — it does not copy the verse
 * anywhere, and the button says so.
 */
export function LayerPanel({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col gap-2">
      {SCENE_TYPES.map((type) => (
        <form key={type} action={addScene}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="scene_type" value={type} />
          <button
            type="submit"
            className="group flex w-full items-start gap-2.5 rounded-lg border border-edge bg-panel-raised/40 px-3 py-2.5 text-left transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            <Plus
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-ink-muted group-hover:text-highlight"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink-primary">
                {SCENE_TYPE_LABELS[type]}
              </span>
              <span className="block text-xs text-ink-muted">
                {SCENE_TYPE_HINTS[type]}
              </span>
            </span>
          </button>
        </form>
      ))}
    </div>
  );
}
