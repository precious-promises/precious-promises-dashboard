import { cn } from "@/lib/utils";

/**
 * The sidebar brand block: product name and what the product is.
 *
 * Not a link — the dashboard nav item already goes home, and a second
 * identical destination just adds a redundant tab stop.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-sm font-semibold text-gold"
      >
        PP
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight text-ink-primary">
          Precious Promises
        </span>
        <span className="block truncate text-xs text-ink-muted">
          Content &amp; Growth
        </span>
      </span>
    </div>
  );
}
