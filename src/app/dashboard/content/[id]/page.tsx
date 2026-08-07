import { AlertTriangle, ArrowLeft, BookOpen, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  archiveContent,
  restoreContent,
  updateContent,
  verifyScripture,
} from "@/app/dashboard/content/actions";
import { ContentForm } from "@/components/content/content-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getContentItem } from "@/lib/content/repository";
import {
  CONTENT_STATUS_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
} from "@/lib/content/types";
import { canManuallyVerify } from "@/lib/content/verification";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Content · Precious Promises",
  robots: { index: false, follow: false },
};

export default async function ContentDetailPage(
  props: PageProps<"/dashboard/content/[id]">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { id } = await props.params;
  const item = await getContentItem(id);

  // Another owner's id and a non-existent id are indistinguishable here, on
  // purpose: a 404 for both means the response cannot be used to discover
  // which ids exist.
  if (!item) {
    notFound();
  }

  const verifiable = canManuallyVerify({
    scripture_reference: item.scripture_reference,
    scripture_text: item.scripture_text,
  });

  return (
    <DashboardShell
      title="Content"
      pathname="/dashboard/content"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div>
          <Link
            href="/dashboard/content"
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Content Library
          </Link>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">
              {item.title}
            </h2>
            <StatusBadge
              tone={item.status === "ready_for_review" ? "accent" : "inactive"}
            >
              {CONTENT_STATUS_LABELS[item.status]}
            </StatusBadge>
          </div>
        </div>

        <SectionCard
          title="Scripture verification"
          action={
            <StatusBadge
              tone={
                item.scripture_verification_status === "manually_verified"
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
          {item.scripture_reference ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-gold">
                <BookOpen aria-hidden="true" className="size-4" />
                {item.scripture_reference}
                <span className="text-ink-muted">
                  {item.scripture_translation}
                </span>
              </p>
              {item.scripture_text ? (
                <blockquote className="border-l-2 border-gold-dim/50 pl-3 text-sm leading-6 text-ink-secondary">
                  {item.scripture_text}
                </blockquote>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              No Scripture reference recorded for this item.
            </p>
          )}

          {item.scripture_verification_status === "verification_required" ? (
            <p
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-gold-dim/40 bg-gold/10 px-3.5 py-2.5 text-sm text-ink-secondary"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-gold"
              />
              <span>
                The Scripture changed after it was verified, so the earlier
                confirmation no longer applies. Check it against your source and
                verify again.
              </span>
            </p>
          ) : null}

          {item.scripture_verification_status === "manually_verified" &&
          item.scripture_verified_at ? (
            <p className="mt-4 text-xs text-ink-muted">
              Verified on{" "}
              {new Date(item.scripture_verified_at).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "long", year: "numeric" },
              )}
              .
            </p>
          ) : null}

          {item.scripture_verification_status !== "manually_verified" ? (
            <form action={verifyScripture} className="mt-4">
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                disabled={!verifiable}
                className="inline-flex items-center gap-2 rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check aria-hidden="true" className="size-4" />
                Mark Scripture as verified
              </button>
              {!verifiable ? (
                <span className="ml-3 text-xs text-ink-muted">
                  Add a Scripture reference before verifying.
                </span>
              ) : null}
            </form>
          ) : null}
        </SectionCard>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink-primary">
            Edit content
          </h3>
          <ContentForm
            action={updateContent}
            submitLabel="Save changes"
            item={item}
          />
        </div>

        <SectionCard title="Lifecycle">
          {item.status === "archived" ? (
            <form action={restoreContent} className="flex items-center gap-3">
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Restore to draft
              </button>
              <span className="text-xs text-ink-muted">
                This item is archived.
              </span>
            </form>
          ) : (
            <form action={archiveContent} className="flex items-center gap-3">
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Archive
              </button>
              <span className="text-xs text-ink-muted">
                Archiving retires the item. It is retained, not deleted.
              </span>
            </form>
          )}
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
