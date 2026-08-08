import { updateVideoProject } from "@/app/dashboard/video/actions";
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_LABELS,
  VIDEO_PROJECT_STATUSES,
  VIDEO_PROJECT_STATUS_LABELS,
  type VideoProject,
} from "@/lib/video/types";

/**
 * The editor's top bar controls: name, format, status, save.
 *
 * A plain form rather than a client component — there is no field-level
 * validation to show and nothing to keep in sync, so the server round trip is
 * the whole interaction and it works without JavaScript.
 *
 * `ready_for_review` here means the owner considers the composition finished.
 * It queues nothing, renders nothing and publishes nothing.
 */
export function ProjectSettingsForm({ project }: { project: VideoProject }) {
  return (
    <form
      action={updateVideoProject}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="project_id" value={project.id} />
      <input
        type="hidden"
        name="content_item_id"
        value={project.content_item_id}
      />

      <div className="min-w-0 flex-1 basis-56">
        <label
          htmlFor="name"
          className="mb-1 block text-xs font-medium text-ink-secondary"
        >
          Project name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={200}
          defaultValue={project.name}
          className="w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
        />
      </div>

      <div>
        <label
          htmlFor="aspect_ratio"
          className="mb-1 block text-xs font-medium text-ink-secondary"
        >
          Format
        </label>
        <select
          id="aspect_ratio"
          name="aspect_ratio"
          defaultValue={project.aspect_ratio}
          className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ASPECT_RATIO_LABELS[ratio]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="status"
          className="mb-1 block text-xs font-medium text-ink-secondary"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={project.status}
          className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
        >
          {VIDEO_PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {VIDEO_PROJECT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        Save project
      </button>
    </form>
  );
}
