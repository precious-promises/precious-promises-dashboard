import { LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";

/**
 * Sign-out control.
 *
 * A form posting to a Server Action rather than a client-side handler, so it
 * works without JavaScript and the session is cleared server-side.
 */
export function LogoutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-edge text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight sm:size-auto sm:gap-2 sm:px-3 sm:py-1.5"
      >
        <LogOut aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only sm:text-sm sm:font-medium">
          Log out
        </span>
      </button>
    </form>
  );
}
