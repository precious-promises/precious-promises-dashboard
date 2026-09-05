import { Crown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Precious Promises brand treatment used in the authenticated workspace.
 *
 * The reference dashboard uses a compact gold crown/wordmark rather than a
 * generic application tile. The mark stays text-and-icon based so it remains
 * crisp at every density without introducing an unverified image asset.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-gold-dim/35 bg-gold/5 shadow-[0_10px_30px_rgba(0,0,0,0.2)]"
      >
        <Crown className="size-6 text-gold" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block truncate text-[10px] font-semibold tracking-[0.22em] text-gold uppercase">
          Precious
        </span>
        <span className="mt-1 block truncate text-[11px] font-semibold tracking-[0.18em] text-gold uppercase">
          Promises
        </span>
      </span>
    </div>
  );
}
