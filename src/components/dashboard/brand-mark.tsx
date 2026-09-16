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
        className="flex size-10 shrink-0 items-center justify-center "
      >
        <Crown className="size-8 text-gold" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block truncate font-serif text-[15px] tracking-[0.1em] text-gold uppercase">
          Precious
        </span>
        <span className="mt-1 block truncate text-[10px] font-medium tracking-[0.26em] text-gold uppercase">
          Promises
        </span>
      </span>
    </div>
  );
}
