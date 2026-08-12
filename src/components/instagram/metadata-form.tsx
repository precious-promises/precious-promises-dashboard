"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { InstagramMetadataActionState } from "@/app/dashboard/captions/actions";
import { saveInstagramMetadata } from "@/app/dashboard/captions/actions";
import {
  INSTAGRAM_LIMITS,
  INSTAGRAM_MEDIA_TYPES,
  INSTAGRAM_MEDIA_TYPE_LABELS,
  MEDIA_DELIVERY,
} from "@/lib/instagram/config";
import type { InstagramMediaMetadata } from "@/lib/instagram/types";
import type { MediaAsset } from "@/lib/media/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save Instagram settings"}
    </button>
  );
}

/**
 * Instagram-specific publishing settings for one platform variant.
 *
 * The media-type control shows all three options and marks two of them as
 * unpublishable, rather than hiding them. Hiding would suggest they do not
 * exist; showing them with the reason attached says what is actually true —
 * Meta fetches photos and carousels from a publicly reachable URL, and this
 * application will not expose media to the open internet to satisfy that.
 */
export function InstagramMetadataForm({
  platformVariantId,
  contentItemId,
  metadata,
  imageAssets,
}: {
  platformVariantId: string;
  contentItemId: string;
  metadata: InstagramMediaMetadata | null;
  imageAssets: MediaAsset[];
}) {
  const [state, formAction] = useActionState(
    saveInstagramMetadata,
    {} as InstagramMetadataActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input
        type="hidden"
        name="platform_variant_id"
        value={platformVariantId}
      />
      <input type="hidden" name="content_item_id" value={contentItemId} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm text-ink-secondary"
        >
          {state.notice}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className={LABEL}>Media type</legend>
        {INSTAGRAM_MEDIA_TYPES.map((type) => {
          const delivery = MEDIA_DELIVERY[type];
          return (
            <label
              key={type}
              className="flex items-start gap-2 text-sm text-ink-primary"
            >
              <input
                type="radio"
                name="media_type"
                value={type}
                defaultChecked={(metadata?.media_type ?? "reels") === type}
                className="mt-1 accent-highlight"
              />
              <span>
                {INSTAGRAM_MEDIA_TYPE_LABELS[type]}
                {delivery.supported ? null : (
                  <span className="ml-2 rounded border border-edge-strong/70 px-1.5 py-0.5 text-[11px] text-ink-muted">
                    cannot be published
                  </span>
                )}
                <span className="block text-xs text-ink-muted">
                  {delivery.detail}
                </span>
              </span>
            </label>
          );
        })}
        {errors.media_type ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.media_type}</p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="cover_media_asset_id" className={LABEL}>
          Reel cover
        </label>
        <select
          id="cover_media_asset_id"
          name="cover_media_asset_id"
          defaultValue={metadata?.cover_media_asset_id ?? ""}
          className={FIELD}
        >
          <option value="">No custom cover</option>
          {imageAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-muted">
          Chosen from your imported media. Changing it withdraws approval,
          because it changes what an audience sees first.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-primary">
        <input
          type="checkbox"
          name="share_to_feed"
          defaultChecked={metadata?.share_to_feed ?? true}
          className="mt-1 accent-highlight"
        />
        <span>
          Also show this Reel on the main feed
          <span className="block text-xs text-ink-muted">
            Off means it appears only in the Reels tab.
          </span>
        </span>
      </label>

      <SaveButton />

      <p className="text-xs leading-5 text-ink-muted">
        The caption is built from this variant&rsquo;s wording, the verified
        Scripture and its hashtags, in that order and kept visually separate.
        Instagram allows {INSTAGRAM_LIMITS.captionCharacters} characters,{" "}
        {INSTAGRAM_LIMITS.hashtags} hashtags and {INSTAGRAM_LIMITS.mentions} @
        mentions — all three are checked before anything is sent.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        The first comment is stored for you to paste by hand. Posting it
        automatically would need a comment-management permission this
        application does not request.
      </p>
    </form>
  );
}
