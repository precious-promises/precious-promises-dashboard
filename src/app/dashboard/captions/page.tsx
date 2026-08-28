import {
  CheckCircle2,
  MessageSquareQuote,
  Sparkles,
  SplitSquareVertical,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { draftedGenerationsFor } from "@/app/dashboard/ai/actions";
import { AiDraftPanel } from "@/components/ai/draft-panel";
import { ItemPicker } from "@/components/content/item-picker";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InstagramMetadataForm } from "@/components/instagram/metadata-form";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { TikTokMetadataForm } from "@/components/tiktok/metadata-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { VariantForm } from "@/components/variants/variant-form";
import { YouTubeMetadataForm } from "@/components/youtube/metadata-form";
import { isAiConfigured } from "@/lib/ai/server-config";
import { VARIANT_GENERATION_TYPES } from "@/lib/ai/types";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import { getContentItem, listContentItems } from "@/lib/content/repository";
import { loadInstagramMetadata } from "@/lib/instagram/repository";
import { listMediaAssets } from "@/lib/media/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTikTokCapability } from "@/lib/tiktok/capability";
import { loadTikTokMetadata } from "@/lib/tiktok/repository";
import { listVariantsForItem } from "@/lib/variants/repository";
import {
  PLATFORM_LABELS,
  REVIEW_STATE_LABELS,
  VARIANT_PLATFORMS,
  type VariantPlatform,
} from "@/lib/variants/types";
import { loadChannelPlaylists } from "@/lib/youtube/channel";
import { loadYouTubeMetadata } from "@/lib/youtube/repository";

export const metadata: Metadata = {
  title: "Caption Studio · Precious Promises",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function parsePlatform(value: string | string[] | undefined): VariantPlatform {
  const raw = firstParam(value);
  return VARIANT_PLATFORMS.includes(raw as VariantPlatform)
    ? (raw as VariantPlatform)
    : "youtube";
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

/**
 * Caption Studio.
 *
 * One platform at a time, because a variant is per-platform by definition and
 * showing three editors at once invites copy-paste between them — which is
 * exactly what platform variants exist to avoid.
 */
export default async function CaptionStudioPage(
  props: PageProps<"/dashboard/captions">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const selectedId = firstParam(searchParams.item);
  const platform = parsePlatform(searchParams.platform);

  const items = await listContentItems(EMPTY_FILTERS);
  const item = selectedId ? await getContentItem(selectedId) : null;
  const variants = item ? await listVariantsForItem(item.id) : [];
  const current =
    variants.find((variant) => variant.platform === platform) ?? null;

  const drafts = item ? await draftedGenerationsFor(item.id) : [];
  const variantDrafts = drafts.filter((draft) =>
    VARIANT_GENERATION_TYPES.includes(draft.generation_type),
  );

  const youtubeMetadata =
    platform === "youtube" && current
      ? await loadYouTubeMetadata(current.id)
      : null;
  const needsImageAssets =
    (platform === "youtube" || platform === "instagram") && current !== null;
  const imageAssets = needsImageAssets
    ? (await listMediaAssets()).filter((asset) => asset.media_type === "image")
    : [];

  const instagramMetadata =
    platform === "instagram" && current
      ? await loadInstagramMetadata(current.id)
      : null;

  const tiktokMetadata =
    platform === "tiktok" && current
      ? await loadTikTokMetadata(current.id)
      : null;
  const tiktokCapability =
    platform === "tiktok" && current ? await loadTikTokCapability() : null;

  const { playlists, reason: playlistsReason } =
    platform === "youtube" && current
      ? await loadChannelPlaylists(user.id)
      : { playlists: [], reason: null };

  const readyCount = variants.filter(
    (variant) => variant.review_state === "ready_for_review",
  ).length;
  const draftCount = variants.filter(
    (variant) => variant.review_state === "draft",
  ).length;
  const scriptureRecorded = Boolean(
    item?.scripture_reference && item.scripture_text,
  );

  return (
    <DashboardShell
      title="Caption Studio"
      pathname="/dashboard/captions"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-edge bg-panel/80 px-5 py-6 shadow-sm sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_66%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-ink-muted uppercase">
                <MessageSquareQuote className="size-4 text-highlight" />
                Platform copy centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Caption Studio
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
                Build each platform variant deliberately. YouTube, Instagram and
                TikTok keep separate wording, review state and publishing
                settings instead of sharing one generic caption.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/scripts"
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary"
              >
                Script Studio
              </Link>
              <Link
                href="/dashboard/approvals"
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft"
              >
                Approval Queue
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Content Items"
            value={items.length}
            detail="Real content available to select."
          />
          <Metric
            label="Platform Variants"
            value={variants.length}
            detail={
              item
                ? "Saved variants for the selected item."
                : "Choose an item to inspect variants."
            }
          />
          <Metric
            label="Draft"
            value={draftCount}
            detail="Variants still in authoring state."
          />
          <Metric
            label="Ready for Review"
            value={readyCount}
            detail="Human review requested; nothing published."
          />
          <Metric
            label="AI Drafts"
            value={variantDrafts.length}
            detail={
              isAiConfigured()
                ? "Saved AI variant drafts."
                : "AI provider not configured."
            }
          />
        </div>

        <section className="rounded-2xl border border-edge bg-panel/70 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-ink-muted uppercase">
                <SplitSquareVertical className="size-4 text-highlight" />
                Working item
              </div>
              <ItemPicker
                action="/dashboard/captions"
                items={items}
                selectedId={selectedId}
                extraParams={{ platform }}
              />
            </div>
            {item ? (
              <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3 text-sm">
                <p className="font-medium text-ink-primary">{item.title}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Scripture{" "}
                  {scriptureRecorded ? "recorded" : "not fully recorded"}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-panel/70">
            <EmptyState
              icon={MessageSquareQuote}
              title="No content to write captions for yet."
              description="Create a content item first, then come back to write its platform variants."
              action={
                <Link
                  href="/dashboard/content/new"
                  className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Create Content
                </Link>
              }
            />
          </div>
        ) : !item ? (
          <div className="rounded-2xl border border-edge bg-panel/70">
            <EmptyState
              icon={MessageSquareQuote}
              title="Choose a content item."
              description="Select an item above to write and review its platform-specific captions."
            />
          </div>
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <SectionCard
                  title="Platform variants"
                  description="Each platform has its own wording and review state. A missing variant is not treated as complete."
                >
                  <nav
                    aria-label="Platform"
                    className="grid gap-2 sm:grid-cols-3"
                  >
                    {VARIANT_PLATFORMS.map((option) => {
                      const isActive = option === platform;
                      const existing = variants.find(
                        (variant) => variant.platform === option,
                      );

                      return (
                        <Link
                          key={option}
                          href={`/dashboard/captions?item=${item.id}&platform=${option}`}
                          aria-current={isActive ? "page" : undefined}
                          className={
                            isActive
                              ? "rounded-xl border border-highlight/50 bg-highlight/15 px-4 py-3 text-sm text-ink-primary"
                              : "rounded-xl border border-edge bg-panel-raised/35 px-4 py-3 text-sm text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium">
                              {PLATFORM_LABELS[option]}
                            </span>
                            {existing ? (
                              <StatusBadge
                                tone={
                                  existing.review_state === "ready_for_review"
                                    ? "accent"
                                    : "inactive"
                                }
                              >
                                {REVIEW_STATE_LABELS[existing.review_state]}
                              </StatusBadge>
                            ) : (
                              <span className="text-xs text-ink-muted">
                                None
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-ink-muted">
                            {existing
                              ? "Stored independently for this platform."
                              : "No saved variant yet."}
                          </p>
                        </Link>
                      );
                    })}
                  </nav>
                </SectionCard>
              </div>

              <aside className="xl:sticky xl:top-6 xl:self-start">
                <SectionCard
                  title="Scripture source"
                  description="Read-only. Caption wording cannot alter the stored verse."
                >
                  <ScriptureReadOnly item={item} />
                  <div className="mt-4 border-t border-edge/70 pt-4">
                    <Link
                      href={`/dashboard/scripture?verification=${item.scripture_verification}`}
                      className="text-xs font-medium text-highlight hover:underline"
                    >
                      Open Scripture Studio
                    </Link>
                  </div>
                </SectionCard>
              </aside>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
              <SectionCard
                title={`${PLATFORM_LABELS[platform]} variant`}
                description={
                  current
                    ? `Editing the existing ${PLATFORM_LABELS[platform]} variant. Saving a wording change follows the existing approval-invalidation path.`
                    : `No ${PLATFORM_LABELS[platform]} variant exists yet. Saving creates one.`
                }
              >
                <VariantForm
                  contentItemId={item.id}
                  platform={platform}
                  variant={current}
                />
              </SectionCard>

              <div className="flex flex-col gap-4">
                <SectionCard
                  title="Variant evidence"
                  description="What the database currently records for this selected platform."
                >
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3 border-b border-edge/60 pb-3">
                      <dt className="text-ink-muted">Platform</dt>
                      <dd className="font-medium text-ink-primary">
                        {PLATFORM_LABELS[platform]}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-b border-edge/60 pb-3">
                      <dt className="text-ink-muted">Variant</dt>
                      <dd className="font-medium text-ink-primary">
                        {current ? "Saved" : "Not created"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-b border-edge/60 pb-3">
                      <dt className="text-ink-muted">Review state</dt>
                      <dd className="font-medium text-ink-primary">
                        {current
                          ? REVIEW_STATE_LABELS[current.review_state]
                          : "None"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-muted">AI drafting</dt>
                      <dd className="font-medium text-ink-primary">
                        {isAiConfigured() ? "Configured" : "Not configured"}
                      </dd>
                    </div>
                  </dl>
                </SectionCard>

                <SectionCard
                  title="Copy workflow"
                  description="The hand-offs that remain separate from writing."
                >
                  <div className="space-y-3 text-sm text-ink-secondary">
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" />
                      <p>Save platform-specific wording.</p>
                    </div>
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" />
                      <p>Mark the variant ready for human review.</p>
                    </div>
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-highlight" />
                      <p>
                        Approval, scheduling and publishing remain separate
                        steps.
                      </p>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </section>

            <SectionCard
              title="AI drafting"
              description="Draft wording on request, then decide what to keep. Accepting a draft updates the variant through the same save path as a hand edit, including approval invalidation."
            >
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-edge/70 bg-panel-raised/35 px-4 py-3 text-xs text-ink-muted">
                <Sparkles className="size-4 text-highlight" />
                AI output is draft prose. It is not Scripture verification,
                approval, scheduling or publication.
              </div>
              <AiDraftPanel
                contentItemId={item.id}
                offeredTypes={VARIANT_GENERATION_TYPES}
                drafts={variantDrafts}
                variants={variants.map((variant) => ({
                  id: variant.id,
                  platform: variant.platform,
                }))}
                configured={isAiConfigured()}
                hasScripture={scriptureRecorded}
              />
            </SectionCard>

            {platform === "instagram" && current ? (
              <SectionCard
                title="Instagram publishing settings"
                description="What Meta itself needs, separate from the wording. Changing any of it withdraws approval."
              >
                <InstagramMetadataForm
                  platformVariantId={current.id}
                  contentItemId={item.id}
                  metadata={instagramMetadata}
                  imageAssets={imageAssets}
                />
              </SectionCard>
            ) : null}

            {platform === "tiktok" && current && tiktokCapability ? (
              <SectionCard
                title="TikTok publishing settings"
                description="What TikTok itself needs, separate from the wording. The audience options come from TikTok, for your account. Changing any of it withdraws approval."
              >
                <TikTokMetadataForm
                  platformVariantId={current.id}
                  contentItemId={item.id}
                  metadata={tiktokMetadata}
                  capability={tiktokCapability}
                />
              </SectionCard>
            ) : null}

            {platform === "youtube" && current ? (
              <SectionCard
                title="YouTube publishing settings"
                description="What YouTube itself needs, separate from the wording. Changing any of it withdraws approval."
              >
                <YouTubeMetadataForm
                  platformVariantId={current.id}
                  contentItemId={item.id}
                  metadata={youtubeMetadata}
                  imageAssets={imageAssets}
                  playlists={playlists}
                  playlistsReason={playlistsReason}
                />
              </SectionCard>
            ) : null}

            <section className="rounded-2xl border border-highlight/20 bg-highlight/[0.05] px-5 py-5">
              <p className="text-xs font-semibold tracking-[0.16em] text-highlight uppercase">
                Caption truth boundary
              </p>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-ink-secondary">
                Captions, titles, descriptions, hashtags, first comments, calls
                to action and thumbnail text are authored platform copy. They
                are not Scripture. Marking a variant ready for review publishes
                nothing. Approval, scheduling, a provider-confirmed post and a
                live-watchable result are separate states and must remain
                separately evidenced.
              </p>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
