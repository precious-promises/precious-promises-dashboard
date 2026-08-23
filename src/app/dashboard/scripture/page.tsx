import {
  AlertTriangle,
  BookCheck,
  BookOpen,
  Library,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { verifyScripture } from "@/app/dashboard/content/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CONTENT_LIBRARY_PATH } from "@/config/navigation";
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

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof BookOpen;
}) {
  return (
    <div className="rounded-2xl border border-edge bg-panel/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-primary">
            {value}
          </p>
        </div>
        <span className="rounded-xl border border-edge bg-panel-raised/70 p-2 text-highlight">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
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
  const allItems = await listScriptureItems(null);
  const items = filter
    ? allItems.filter(
        (item) => item.scripture_verification_status === filter,
      )
    : allItems;

  const manuallyVerified = allItems.filter(
    (item) => item.scripture_verification_status === "manually_verified",
  ).length;
  const verificationRequired = allItems.filter(
    (item) => item.scripture_verification_status === "verification_required",
  ).length;
  const unverified = allItems.filter(
    (item) => item.scripture_verification_status === "unverified",
  ).length;
  const readyToVerify = allItems.filter(
    (item) =>
      item.scripture_verification_status !== "manually_verified" &&
      canManuallyVerify({
        scripture_reference: item.scripture_reference,
        scripture_text: item.scripture_text,
      }),
  ).length;

  return (
    <DashboardShell
      title="Scripture Studio"
      pathname="/dashboard/scripture"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_35%),linear-gradient(135deg,rgba(12,20,42,0.96),rgba(7,11,22,0.96))] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-dim/40 bg-gold-dim/10 px-3 py-1 text-xs font-medium text-gold">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Scripture integrity centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Scripture Studio
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Review every content item carrying Scripture and see exactly
                where verification stands. This surface never generates,
                completes, corrects or translates verse wording.
              </p>
            </div>

            <Link
              href={CONTENT_LIBRARY_PATH}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-edge-strong bg-panel-raised/70 px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              <Library className="size-4" aria-hidden="true" />
              Content Library
            </Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Scripture Items"
            value={allItems.length}
            note="Content items with Scripture recorded."
            icon={BookOpen}
          />
          <Metric
            label="Verified"
            value={manuallyVerified}
            note="Items explicitly marked manually verified."
            icon={BookCheck}
          />
          <Metric
            label="Needs Verification"
            value={verificationRequired}
            note="Items whose current Scripture requires verification."
            icon={AlertTriangle}
          />
          <Metric
            label="Unverified"
            value={unverified}
            note="Recorded Scripture not yet manually verified."
            icon={BookOpen}
          />
          <Metric
            label="Ready to Verify"
            value={readyToVerify}
            note="Items with both a reference and verse text present."
            icon={ShieldCheck}
          />
        </section>

        {verificationRequired > 0 ? (
          <div className="rounded-2xl border border-highlight/30 bg-highlight/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-highlight"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-ink-primary">
                  Scripture attention required
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  {verificationRequired} {verificationRequired === 1 ? "item has" : "items have"} Scripture marked as requiring verification. Review the stored reference and wording before approval or publishing.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <SectionCard
          title="Verification queue"
          description="Filter the real Scripture review set by its stored verification status."
          action={
            <StatusBadge tone="inactive">
              {items.length} {items.length === 1 ? "item" : "items"}
            </StatusBadge>
          }
        >
          <nav
            aria-label="Verification filter"
            className="flex flex-wrap gap-2"
          >
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
        </SectionCard>

        {items.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
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
                  href={CONTENT_LIBRARY_PATH}
                  className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Go to Content Library
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const verifiable = canManuallyVerify({
                scripture_reference: item.scripture_reference,
                scripture_text: item.scripture_text,
              });
              const alreadyVerified =
                item.scripture_verification_status === "manually_verified";

              return (
                <li key={item.id} className="min-w-0">
                  <SectionCard
                    title={item.title}
                    headingLevel={3}
                    description={
                      item.scripture_verified_at
                        ? `Verified on ${new Date(item.scripture_verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                        : "No manual verification timestamp recorded"
                    }
                    action={
                      <StatusBadge
                        tone={
                          alreadyVerified
                            ? "configured"
                            : item.scripture_verification_status ===
                                "verification_required"
                              ? "accent"
                              : "inactive"
                        }
                      >
                        {
                          SCRIPTURE_VERIFICATION_LABELS[
                            item.scripture_verification_status
                          ]
                        }
                      </StatusBadge>
                    }
                  >
                    <ScriptureReadOnly item={item} showLockNote={false} />

                    <div className="mt-4 rounded-xl border border-edge/70 bg-panel-raised/30 px-3.5 py-3">
                      <p className="text-xs font-medium text-ink-primary">
                        Verification action
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {alreadyVerified
                          ? "This stored Scripture has already been manually verified. Editing its wording through the Content Library resets that proof."
                          : verifiable
                            ? "Reference and verse text are present. Mark verified only after personally checking the stored wording against the intended source."
                            : "Manual verification is unavailable until both the Scripture reference and verse text are recorded."}
                      </p>
                    </div>

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
                            className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
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

        <div className="rounded-2xl border border-edge bg-panel/55 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-gold"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Scripture truth boundary
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Scripture Studio reads and verifies the wording already stored on
                a content item. It does not generate, complete, correct or
                translate a verse. Manual verification is a human assertion
                about the current stored wording; changing that wording through
                the Content Library resets verification. Declarations, prayers
                and other user-written prose remain separate from Scripture.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
