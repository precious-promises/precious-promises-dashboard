import { BookOpen, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  approveBibleStudy,
  markBibleStudyScriptureVerified,
  rejectBibleStudy,
} from "@/app/dashboard/bible-study/actions";
import { BibleStudyCreateForm } from "@/components/bible-study/study-create-form";
import { BibleStudyRenderer } from "@/components/bible-study/study-renderer";
import { StudyTools } from "@/components/bible-study/study-tools";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { bibleStudyProviderConfigured } from "@/lib/bible-study/server-config";
import type { BibleStudyRevisionRecord } from "@/lib/bible-study/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Bible Study · Precious Promises",
  robots: { index: false, follow: false },
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function BibleStudyPage(
  props: PageProps<"/dashboard/bible-study">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_PATH);

  const searchParams = await props.searchParams;
  const selectedIdRaw = searchParams.revision;
  const selectedId = Array.isArray(selectedIdRaw)
    ? selectedIdRaw[0]
    : selectedIdRaw;

  const { data: rows } = await supabase
    .from("bible_study_revisions")
    .select("*")
    .eq("owner_id", user.id)
    .eq("generation_status", "completed")
    .order("created_at", { ascending: false })
    .limit(30);

  const revisions = (rows ?? []) as BibleStudyRevisionRecord[];
  const selected =
    revisions.find((row) => row.id === selectedId) ?? revisions[0] ?? null;

  return (
    <DashboardShell
      title="Bible Study"
      pathname="/dashboard/bible-study"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] px-5 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:px-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.28),transparent_34%),radial-gradient(circle_at_88%_5%,rgba(201,169,97,0.12),transparent_30%)]"
          />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
              <BookOpen className="size-4" aria-hidden="true" />
              Precious Promises Master Specification
            </div>
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary">
              Create one canonical Bible Study
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              Claude and OpenAI use the same provider-independent study
              standard. Generated Scripture, context and lexical claims remain
              review material: nothing becomes approved until you verify the
              Scripture and approve the study.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-5">
          <BibleStudyCreateForm
            anthropicReady={bibleStudyProviderConfigured("anthropic")}
            openAiReady={bibleStudyProviderConfigured("openai")}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-4 print:hidden">
            <h3 className="text-sm font-semibold text-ink-primary">
              Saved studies
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Reopen without spending tokens.
            </p>
            <div className="mt-4 space-y-2">
              {revisions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-edge p-3 text-xs text-ink-muted">
                  No generated studies saved yet.
                </p>
              ) : (
                revisions.map((revision) => (
                  <Link
                    key={revision.id}
                    href={`/dashboard/bible-study?revision=${revision.id}`}
                    className={`block rounded-xl border px-3 py-3 text-xs transition ${selected?.id === revision.id ? "border-[#7d39e6] bg-[#7d39e6]/10" : "border-edge/70 hover:border-edge-strong"}`}
                  >
                    <span className="block font-semibold text-ink-primary">
                      {revision.canonical_study.title}
                    </span>
                    <span className="mt-1 block text-ink-muted">
                      {revision.canonical_study.main_passage.reference} ·{" "}
                      {revision.provider}
                    </span>
                    <span className="mt-1 block text-ink-muted">
                      {formatDate(revision.created_at)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </aside>

          <main className="min-w-0">
            {selected ? (
              <div className="space-y-4">
                <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-4 print:border-0 print:bg-white print:text-black">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        tone={
                          selected.scripture_verification_status ===
                          "manually_verified"
                            ? "configured"
                            : "inactive"
                        }
                      >
                        {selected.scripture_verification_status ===
                        "manually_verified"
                          ? "SCRIPTURE VERIFIED"
                          : "SCRIPTURE REVIEW REQUIRED"}
                      </StatusBadge>
                      <StatusBadge
                        tone={
                          selected.review_state === "approved"
                            ? "configured"
                            : "accent"
                        }
                      >
                        {selected.review_state
                          .replaceAll("_", " ")
                          .toUpperCase()}
                      </StatusBadge>
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      {selected.provider} · {selected.model} · revision{" "}
                      {selected.revision_number}
                    </p>
                  </div>

                  <StudyTools
                    study={selected.canonical_study}
                    revisionId={selected.id}
                  />

                  <div className="mt-5">
                    <BibleStudyRenderer study={selected.canonical_study} />
                  </div>

                  <div className="mt-6 rounded-xl border border-edge/70 p-4 print:hidden">
                    <div className="flex items-start gap-3">
                      <ShieldCheck
                        className="mt-0.5 size-5 text-gold"
                        aria-hidden="true"
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-ink-primary">
                          Human review gate
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-ink-muted">
                          Quality control can detect missing structure, but it
                          cannot certify AI-quoted Scripture or
                          lexical/historical claims. Verify them before
                          approval.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selected.scripture_verification_status !==
                      "manually_verified" ? (
                        <form action={markBibleStudyScriptureVerified}>
                          <input
                            type="hidden"
                            name="revision_id"
                            value={selected.id}
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-ink-primary"
                          >
                            I verified the Scripture
                          </button>
                        </form>
                      ) : null}
                      {selected.review_state !== "approved" ? (
                        <form action={approveBibleStudy}>
                          <input
                            type="hidden"
                            name="revision_id"
                            value={selected.id}
                          />
                          <button
                            type="submit"
                            disabled={
                              selected.scripture_verification_status !==
                              "manually_verified"
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#080b12] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckCircle2
                              className="size-4"
                              aria-hidden="true"
                            />
                            Approve study
                          </button>
                        </form>
                      ) : null}
                      {selected.review_state !== "approved" ? (
                        <form action={rejectBibleStudy} className="flex gap-2">
                          <input
                            type="hidden"
                            name="revision_id"
                            value={selected.id}
                          />
                          <input
                            name="reason"
                            placeholder="Reason / requested change"
                            className="min-w-[220px] rounded-lg border border-edge bg-[#070b14] px-3 py-2 text-xs text-ink-primary"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-red-900/60 px-3 py-2 text-xs font-semibold text-red-200"
                          >
                            Reject
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-edge/70 p-4 text-xs leading-5 text-ink-muted print:hidden">
                    <p>
                      <strong className="text-ink-secondary">QC:</strong>{" "}
                      {selected.validation_report.wordCount} words ·{" "}
                      {selected.validation_report.scriptureBlocks} Scripture
                      evidence blocks.
                    </p>
                    {selected.validation_report.warnings.map(
                      (warning, index) => (
                        <p key={index} className="mt-1">
                          • {warning}
                        </p>
                      ),
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-edge p-10 text-center text-sm text-ink-muted">
                Generate your first Bible Study above.
              </div>
            )}
          </main>
        </section>
      </div>
    </DashboardShell>
  );
}
