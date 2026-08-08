import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { verifyScripture } from "@/app/dashboard/content/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { listScriptureItems } from "@/lib/content/repository";
import {
  SCRIPTURE_VERIFICATION_LABELS,
  SCRIPTURE_VERIFICATION_STATUSES,
  type ScriptureVerificationStatus,
} from "@/lib/content/types";
import { canManuallyVerify } from "@/lib/content/verification";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Scripture Studio · Precious Promises",
  robots: { index: false, follow: false },
};

const FILTERS = [
  { value: "", label: "All" },
  ...SCRIPTURE_VERIFICATION_STATUSES.map((status) => ({
    value: status,
    label: SCRIPTURE_VERIFICATION_LABELS[status],
  })),
] as const;

function parseFilter(
  value: string | string[] | undefined,
): ScriptureVerificationStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return SCRIPTURE_VERIFICATION_STATUSES.includes(
    raw as ScriptureVerificationStatus,
  )
    ? (raw as ScriptureVerificationStatus)
    : null;
}

/**
 * Scripture Studio.
 *
 * A review surface, not an editor. Scripture can be **read** and **verified**
 * here; changing the wording happens in the Content Library, through the same
 * path that already resets verification.
 *
 * Nothing on this page generates, completes, corrects or translates a verse.
 */
export default async function ScriptureStudioPage(
  props: PageProps<"/dashboard/scripture">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const filter = parseFilter(searchParams.verification);
  const items = await listScriptureItems(filter);

  return (
    <DashboardShell
      title="Scripture Studio"
      pathname="/dashboard/scripture"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Scripture Studio
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Every content item carrying Scripture, and where its verification
            stands. Verse wording is entered and edited in the Content Library —
            this page reads and verifies it.
          </p>
        </div>

        <nav aria-label="Verification filter" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => {
            const isActive = (filter ?? "") === option.value;
            const href = option.value
              ? `/dashboard/scripture?verification=${option.value}`
              : "/dashboard/scripture";
            return (
              <Link
                key={option.label}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "rounded-full border border-highlight/50 bg-highlight/15 px-3.5 py-1.5 text-xs font-medium text-ink-primary"
                    : "rounded-full border border-edge px-3.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                }
              >
                {option.label}
              </Link>
            );
          })}
        </nav>

        {items.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={BookOpen}
              title={
                filter
                  ? "No Scripture matches this filter."
                  : "No Scripture recorded yet."
              }
              description="Scripture is entered on a content item in the Content Library. Once a reference is recorded, it appears here for verification."
              action={
                <Link
                  href="/dashboard/content"
                  className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Go to Content Library
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((item) => {
              const verifiable = canManuallyVerify({
                scripture_reference: item.scripture_reference,
                scripture_text: item.scripture_text,
              });
              const alreadyVerified =
                item.scripture_verification_status === "manually_verified";

              return (
                <li key={item.id}>
                  <SectionCard
                    title={item.title}
                    headingLevel={3}
                    description={
                      item.scripture_verified_at
                        ? `Verified on ${new Date(item.scripture_verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                        : undefined
                    }
                  >
                    <ScriptureReadOnly item={item} showLockNote={false} />

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/dashboard/content/${item.id}`}
                        className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                      >
                        View content
                      </Link>

                      {alreadyVerified ? null : (
                        <form action={verifyScripture}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            disabled={!verifiable}
                            className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Mark manually verified
                          </button>
                        </form>
                      )}
                    </div>
                  </SectionCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
