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
        className="rounded-md border border-white/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        Log out
      </button>
    </form>
  );
}
