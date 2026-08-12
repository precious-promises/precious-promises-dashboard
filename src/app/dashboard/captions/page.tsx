import { MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ItemPicker } from "@/components/content/item-picker";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { VariantForm } from "@/components/variants/variant-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { InstagramMetadataForm } from "@/components/instagram/metadata-form";
import { TikTokMetadataForm } from "@/components/tiktok/metadata-form";
import { YouTubeMetadataForm } from "@/components/youtube/metadata-form";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import { getContentItem, listContentItems } from "@/lib/content/repository";
import { listMediaAssets } from "@/lib/media/repository";
import { listVariantsForItem } from "@/lib/variants/repository";
import { loadChannelPlaylists } from "@/lib/youtube/channel";
import { loadInstagramMetadata } from "@/lib/instagram/repository";
import { loadTikTokCapability } from "@/lib/tiktok/capability";
import { loadTikTokMetadata } from "@/lib/tiktok/repository";
import { loadYouTubeMetadata } from "@/lib/youtube/repository";
import {
  PLATFORM_LABELS,
  REVIEW_STATE_LABELS,
  VARIANT_PLATFORMS,
  type VariantPlatform,
} from "@/lib/variants/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const current = variants.find((v) => v.platform === platform) ?? null;

  // Only loaded for the YouTube tab, and only when a variant exists to attach
  // them to. There is nothing to configure until there is something to publish.
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

  // The TikTok tab needs more than stored settings: it needs to know what
  // TikTok currently permits this creator, because the audience options may
  // only ever be the ones TikTok itself returned. Loaded only for this tab —
  // it is a live API call, and making it on every page view would be a request
  // to TikTok for a form nobody opened.
  const tiktokMetadata =
    platform === "tiktok" && current
      ? await loadTikTokMetadata(current.id)
      : null;
  const tiktokCapability =
    platform === "tiktok" && current ? await loadTikTokCapability() : null;

  // Playlists come from the connected channel, never from a text field. When
  // nothing is connected this returns an empty list and the reason why.
  const { playlists, reason: playlistsReason } =
    platform === "youtube" && current
      ? await loadChannelPlaylists(user.id)
      : { playlists: [], reason: null };

  return (
    <DashboardShell
      title="Caption Studio"
      pathname="/dashboard/captions"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Caption Studio
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Write the per-platform wording. Each platform keeps its own variant
            — nothing is copied between them.
          </p>
        </div>

        <div className="pp-glass rounded-xl border border-edge px-4 py-4">
          <ItemPicker
            action="/dashboard/captions"
            items={items}
            selectedId={selectedId}
            extraParams={{ platform }}
          />
        </div>

        {items.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
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
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={MessageSquareQuote}
              title="Choose a content item."
              description="Select an item above to write its platform captions."
            />
          </div>
        ) : (
          <>
            <SectionCard
              title="Scripture"
              description="Read-only. Edit it in the Content Library."
            >
              <ScriptureReadOnly item={item} />
            </SectionCard>

            <nav aria-label="Platform" className="flex flex-wrap gap-2">
              {VARIANT_PLATFORMS.map((option) => {
                const isActive = option === platform;
                const existing = variants.find((v) => v.platform === option);
                return (
                  <Link
                    key={option}
                    href={`/dashboard/captions?item=${item.id}&platform=${option}`}
                    aria-current={isActive ? "page" : undefined}
                    className={
                      isActive
                        ? "flex items-center gap-2 rounded-full border border-highlight/50 bg-highlight/15 px-4 py-1.5 text-xs font-medium text-ink-primary"
                        : "flex items-center gap-2 rounded-full border border-edge px-4 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                    }
                  >
                    {PLATFORM_LABELS[option]}
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
                      <span className="text-ink-muted">None</span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <SectionCard
              title={`${PLATFORM_LABELS[platform]} variant`}
              description={
                current
                  ? `Editing the existing ${PLATFORM_LABELS[platform]} draft.`
                  : `No ${PLATFORM_LABELS[platform]} variant yet. Saving creates one.`
              }
            >
              <VariantForm
                contentItemId={item.id}
                platform={platform}
                variant={current}
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
          </>
        )}
      </div>
    </DashboardShell>
  );
}
