import { cn } from "@/lib/utils";

export interface SectionCardProps {
  title: string;
  description?: string;
  /** Rendered top-right — typically a StatusBadge. */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Heading level, so each page keeps a sensible document outline. */
  headingLevel?: 2 | 3;
}

/**
 * The standard panel: glass surface, hairline edge, soft depth.
 *
 * The heading level is a prop rather than hardcoded so cards can nest without
 * producing an outline that skips levels.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  headingLevel = 2,
}: SectionCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      className={cn(
        "pp-glass rounded-xl border border-edge shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-edge/70 px-5 py-4">
        <div className="min-w-0">
          <Heading className="text-sm font-semibold tracking-wide text-ink-primary">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 text-sm text-ink-secondary">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
