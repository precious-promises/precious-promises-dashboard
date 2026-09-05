import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
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
    <div className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.035em] text-ink-primary">
            {value}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/35 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

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
    ? allItems.filter((item) => item.scripture_verification_status === filter)
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
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(112,55,221,0.22),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.16),transparent_27%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative flex flex-col gap-5 px-5 py-6 sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Scripture Integrity Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Verify Scripture with a clear human-controlled record
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Review every content item carrying Scripture, see exactly where
                verification stands, and make the human verification decision.
                Verse wording remains controlled through Content Library.
              </p>
            </div>

            <Link
              href="/dashboard/content"
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              <Library className="size-4" aria-hidden="true" />
              Content Library
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric
            label="Scripture Items"
            value={allItems.length}
            note="Content items with a recorded Scripture reference."
            icon={BookOpen}
          />
          <Metric
            label="Verified"
            value={manuallyVerified}
            note="Items carrying an explicit manual verification record."
            icon={CheckCircle2}
          />
          <Metric
            label="Verification Required"
            value={verificationRequired}
            note="Items explicitly marked as needing a new verification decision."
            icon={AlertTriangle}
          />
          <Metric
            label="Unverified"
            value={unverified}
            note="Recorded Scripture without a manual verification decision."
            icon={ShieldCheck}
          />
          <Metric
            label="Ready to Verify"
            value={readyToVerify}
            note="Unverified items with both reference and stored verse text present."
            icon={CheckCircle2}
          />
        </section>

        <SectionCard
          title="Verification queue"
          description="Filter the review surface by the stored Scripture verification status."
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
                      ? "rounded-full border border-[#7138dc]/35 bg-[#7138dc]/15 px-3.5 py-1.5 text-xs font-medium text-[#c8b8ff]"
                      : "rounded-full border border-edge px-3.5 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-white/[0.04] hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Showing {items.length} of {allItems.length} Scripture items.
          </p>
        </SectionCard>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90">
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
                  className="rounded-xl border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
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
                  >
                    <ScriptureReadOnly item={item} showLockNote={false} />

                    {!alreadyVerified && !verifiable ? (
                      <div className="mt-3 rounded-xl border border-edge bg-white/[0.02] px-3 py-2 text-xs leading-5 text-ink-muted">
                        Manual verification is unavailable until both the
                        Scripture reference and stored verse wording are
                        present.
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/dashboard/content/${item.id}`}
                        className="rounded-xl border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                      >
                        View content
                      </Link>

                      {alreadyVerified ? (
                        <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-2 text-xs font-medium text-emerald-300">
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                          Manual verification recorded
                        </span>
                      ) : (
                        <form action={verifyScripture}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            disabled={!verifiable}
                            className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(103,46,214,0.25)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
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

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/35 bg-gold/10 text-gold">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Scripture truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Scripture Studio never generates, completes, corrects or
                translates a verse. Manual verification records a human review
                decision; it does not prove that an external Bible source was
                queried. Changing Scripture wording belongs in Content Library
                and must reset verification before the content can rely on the
                previous approval path again.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
