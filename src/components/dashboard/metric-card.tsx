import type { LucideIcon } from "lucide-react";

export interface MetricCardProps {
  label: string;
  /**
   * The count. Every metric is 0 today because no content tables exist — this
   * is a real zero, not a placeholder for a number we have but cannot show.
   */
  value: number;
  icon: LucideIcon;
  /** Why the number is what it is. Keeps a zero from reading as a failure. */
  note: string;
}

/**
 * A single compact metric.
 *
 * The value is passed in rather than fetched here, so wiring these to real
 * queries later is a change at the page level and not in this component.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  note,
}: MetricCardProps) {
  return (
    <div className="pp-glass rounded-xl border border-edge px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-secondary">{label}</p>
        <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}
