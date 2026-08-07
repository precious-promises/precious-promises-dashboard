import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The empty state for a panel with nothing in it yet.
 *
 * These are honest, not apologetic: nothing here is "loading" or "coming
 * shortly" — the description says plainly what will appear and what has to
 * happen first.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-4 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full border border-edge bg-panel-raised/70 text-ink-muted"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-base font-medium text-ink-primary">{title}</p>
      <p className="max-w-md text-sm leading-6 text-ink-secondary">
        {description}
      </p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
