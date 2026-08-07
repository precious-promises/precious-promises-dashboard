import { Search } from "lucide-react";

import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
  SCRIPTURE_VERIFICATION_STATUSES,
} from "@/lib/content/types";
import type { ContentFilters } from "@/lib/content/filters";

const SELECT_CLASSES =
  "rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";

/**
 * Library filters.
 *
 * A plain GET form rather than client-side state: filters end up in the URL,
 * so a filtered view can be bookmarked, shared and reloaded, and the whole
 * thing works without JavaScript.
 */
export function ContentFiltersBar({
  filters,
  topics,
}: {
  filters: ContentFilters;
  topics: string[];
}) {
  return (
    <form
      method="get"
      action="/dashboard/content"
      className="flex flex-wrap items-end gap-3"
      role="search"
    >
      <div className="min-w-0 flex-1 basis-64">
        <label
          htmlFor="q"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          Search
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.search}
            placeholder="Title, reference or description"
            className="w-full rounded-lg border border-edge bg-panel-raised/50 py-2 pr-3 pl-9 text-sm text-ink-primary outline-none placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="type"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          Type
        </label>
        <select
          id="type"
          name="type"
          defaultValue={filters.contentType ?? ""}
          className={SELECT_CLASSES}
        >
          <option value="">All types</option>
          {CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="topic"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          Topic
        </label>
        <select
          id="topic"
          name="topic"
          defaultValue={filters.topic}
          className={SELECT_CLASSES}
        >
          <option value="">All topics</option>
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="status"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={filters.status ?? ""}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {CONTENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CONTENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="verification"
          className="mb-1.5 block text-xs font-medium text-ink-secondary"
        >
          Scripture
        </label>
        <select
          id="verification"
          name="verification"
          defaultValue={filters.verification ?? ""}
          className={SELECT_CLASSES}
        >
          <option value="">Any verification</option>
          {SCRIPTURE_VERIFICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SCRIPTURE_VERIFICATION_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        Apply
      </button>
    </form>
  );
}
