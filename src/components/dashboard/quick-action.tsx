import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";

export interface QuickActionLinkProps {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * A quick action that actually goes somewhere.
 *
 * The variant promised when `QuickAction` was written: an action becomes a
 * link when the route behind it exists, rather than a disabled button restyled
 * to look enabled.
 */
export function QuickActionLink({
  href,
  label,
  description,
  icon: Icon,
}: QuickActionLinkProps) {
  return (
    <Link
      href={href}
      className="flex w-full flex-col gap-2 rounded-xl border border-edge bg-panel-raised/40 px-4 py-4 text-left transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
    >
      <Icon aria-hidden="true" className="size-5 text-highlight" />
      <span className="text-sm font-medium text-ink-primary">{label}</span>
      <span className="text-xs leading-5 text-ink-muted">{description}</span>
    </Link>
  );
}

export interface QuickActionProps {
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * A quick-action tile.
 *
 * Every action in Stage 1 is unbuilt, so this renders a genuinely `disabled`
 * button rather than a styled-to-look-disabled div. That keeps it out of the
 * tab order and makes assistive technology announce it as unavailable, instead
 * of inviting a click that would do nothing.
 *
 * When an action becomes real it gains an href and becomes a link — at which
 * point this component gets a variant, not a hack.
 */
export function QuickAction({
  label,
  description,
  icon: Icon,
}: QuickActionProps) {
  return (
    <button
      type="button"
      disabled
      aria-describedby={`${label.replace(/\s+/g, "-").toLowerCase()}-status`}
      className="group flex w-full cursor-not-allowed flex-col gap-2 rounded-xl border border-edge bg-panel-raised/40 px-4 py-4 text-left opacity-70"
    >
      <span className="flex items-center justify-between gap-2">
        <Icon aria-hidden="true" className="size-5 text-highlight/70" />
        <StatusBadge>Coming soon</StatusBadge>
      </span>
      <span className="text-sm font-medium text-ink-primary">{label}</span>
      <span
        id={`${label.replace(/\s+/g, "-").toLowerCase()}-status`}
        className="text-xs leading-5 text-ink-muted"
      >
        {description}
      </span>
    </button>
  );
}
