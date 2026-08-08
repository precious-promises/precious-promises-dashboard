import type { ContentItem } from "@/lib/content/types";
import { CONTENT_TYPE_LABELS } from "@/lib/content/types";

/**
 * Content item selector for the studios.
 *
 * A GET form so the chosen item lives in the URL — a studio view can then be
 * bookmarked and shared, and it works without JavaScript.
 */
export function ItemPicker({
  action,
  items,
  selectedId,
  extraParams = {},
  label = "Content item",
}: {
  action: string;
  items: ContentItem[];
  selectedId: string | null;
  extraParams?: Record<string, string>;
  label?: string;
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-3"
    >
      {Object.entries(extraParams).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="min-w-0 flex-1 basis-72">
        <label
          htmlFor="item"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          {label}
        </label>
        <select
          id="item"
          name="item"
          defaultValue={selectedId ?? ""}
          className="w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
        >
          <option value="">Choose a content item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {CONTENT_TYPE_LABELS[item.content_type]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        Open
      </button>
    </form>
  );
}
