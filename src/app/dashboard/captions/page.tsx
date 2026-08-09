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
import { YouTubeMetadataForm } from "@/components/youtube/metadata-form";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import { getContentItem, listContentItems } from "@/lib/content/repository";
import { listMediaAssets } from "@/lib/media/repository";
import { listVariantsForItem } from "@/lib/variants/repository";
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
  const imageAssets =
    platform === "youtube" && current
      ? (await listMediaAssets()).filter(
          (asset) => asset.media_type === "image",
        )
      : [];

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
                />
              </SectionCard>
            ) : null}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
