import { cn } from "@/lib/utils";

export type StatusTone = "coming-soon" | "configured" | "inactive" | "accent";

const TONE_CLASSES: Record<StatusTone, string> = {
  "coming-soon": "border-edge-strong/70 bg-panel-raised/60 text-ink-muted",
  configured: "border-positive/25 bg-positive/10 text-positive",
  inactive: "border-edge-strong/70 bg-panel-raised/50 text-ink-muted",
  accent: "border-gold-dim/50 bg-gold/10 text-gold",
};

export interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}

/**
 * Small textual status marker.
 *
 * The label always carries the meaning in words. Tone only reinforces it, so
 * the badge still reads correctly without colour perception.
 */
export function StatusBadge({
  children,
  tone = "coming-soon",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium tracking-wide whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
