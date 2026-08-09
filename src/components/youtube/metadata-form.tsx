"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { YouTubeMetadataActionState } from "@/app/dashboard/captions/actions";
import { saveYouTubeMetadata } from "@/app/dashboard/captions/actions";
import type { MediaAsset } from "@/lib/media/types";
import {
  PRIVACY_LABELS,
  REQUESTABLE_PRIVACY_STATUSES,
  SHORTS_GUIDANCE,
  YOUTUBE_LIMITS,
} from "@/lib/youtube/config";
import type { YouTubeVideoMetadata } from "@/lib/youtube/types";

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
      {pending ? "Saving…" : "Save YouTube settings"}
    </button>
  );
}

/**
 * YouTube-specific publishing settings for one variant.
 *
 * Three things about this form are deliberate and load-bearing:
 *
 * 1. **Made for kids starts unanswered.** It is a legal declaration, not a
 *    preference, so there is no pre-selected option and an upload is refused
 *    while it stays unanswered. A default here would be this system answering
 *    a legal question on Dave's behalf.
 * 2. **Public is not offered.** Google forces uploads from an API client that
 *    has not passed its compliance audit to private regardless of what is
 *    requested, so a “Public” option would promise something the platform
 *    overrides.
 * 3. **Saving invalidates approval.** These settings are part of the approval
 *    fingerprint, because changing a privacy status or a thumbnail changes
 *    what an audience would see. The form says so rather than surprising
 *    anyone.
 */
export function YouTubeMetadataForm({
  platformVariantId,
  contentItemId,
  metadata,
  imageAssets,
}: {
  platformVariantId: string;
  contentItemId: string;
  metadata: YouTubeVideoMetadata | null;
  imageAssets: MediaAsset[];
}) {
  const [state, formAction] = useActionState(
    saveYouTubeMetadata,
    {} as YouTubeMetadataActionState,
  );
  const errors = state.fieldErrors ?? {};

  const kids =
    metadata?.self_declared_made_for_kids === null ||
    metadata?.self_declared_made_for_kids === undefined
      ? ""
      : metadata.self_declared_made_for_kids
        ? "yes"
        : "no";

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
        <legend className={LABEL}>
          Is this content made for children? (required by YouTube)
        </legend>
        <p className="text-xs leading-5 text-ink-muted">
          A legal declaration under COPPA. This dashboard will not answer it for
          you, and an upload is refused until it is answered.
        </p>
        {[
          { value: "", label: "Not answered yet" },
          { value: "no", label: "No — not made for children" },
          { value: "yes", label: "Yes — made for children" },
        ].map((option) => (
          <label
            key={option.value || "unanswered"}
            className="flex items-center gap-2 text-sm text-ink-primary"
          >
            <input
              type="radio"
              name="self_declared_made_for_kids"
              value={option.value}
              defaultChecked={kids === option.value}
              className="accent-highlight"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="privacy_status" className={LABEL}>
          Privacy
        </label>
        <select
          id="privacy_status"
          name="privacy_status"
          defaultValue={metadata?.privacy_status ?? "private"}
          className={FIELD}
        >
          {REQUESTABLE_PRIVACY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PRIVACY_LABELS[status]}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-muted">
          Public is not offered. Google forces uploads from an API client that
          has not passed its compliance audit to private, so requesting public
          would promise something the platform overrides.
        </p>
        {errors.privacy_status ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.privacy_status}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="tags" className={LABEL}>
          Tags
        </label>
        <input
          id="tags"
          name="tags"
          defaultValue={(metadata?.tags ?? []).join(", ")}
          placeholder="promises, scripture, peace"
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          Comma separated. YouTube counts {YOUTUBE_LIMITS.tagsTotalCharacters}{" "}
          characters across all tags together, not per tag.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category_id" className={LABEL}>
            Category id
          </label>
          <input
            id="category_id"
            name="category_id"
            defaultValue={metadata?.category_id ?? ""}
            placeholder="22"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            YouTube&rsquo;s numeric category id. Left blank, YouTube chooses.
          </p>
        </div>

        <div>
          <label htmlFor="default_language" className={LABEL}>
            Language
          </label>
          <input
            id="default_language"
            name="default_language"
            defaultValue={metadata?.default_language ?? ""}
            placeholder="en-GB"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="thumbnail_media_asset_id" className={LABEL}>
          Custom thumbnail
        </label>
        <select
          id="thumbnail_media_asset_id"
          name="thumbnail_media_asset_id"
          defaultValue={metadata?.thumbnail_media_asset_id ?? ""}
          className={FIELD}
        >
          <option value="">No custom thumbnail</option>
          {imageAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-muted">
          Custom thumbnails need a verified channel, and YouTube accepts JPEG or
          PNG up to 2 MB. Setting one is attempted after the video is uploaded
          and is allowed to fail on its own — a rejected thumbnail does not
          un-publish a video.
        </p>
      </div>

      <div>
        <label htmlFor="playlist_id" className={LABEL}>
          Playlist id
        </label>
        <input
          id="playlist_id"
          name="playlist_id"
          defaultValue={metadata?.playlist_id ?? ""}
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          A playlist on the connected channel. Filing the video happens after
          the upload and needs the playlist permission.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-primary">
        <input
          type="checkbox"
          name="contains_synthetic_media"
          defaultChecked={metadata?.contains_synthetic_media ?? false}
          className="mt-1 accent-highlight"
        />
        <span>
          This video contains realistic altered or synthetic media
          <span className="block text-xs text-ink-muted">
            YouTube requires this disclosure when content could be mistaken for
            real people, places or events.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-ink-primary">
        <input
          type="checkbox"
          name="notify_subscribers"
          defaultChecked={metadata?.notify_subscribers ?? true}
          className="mt-1 accent-highlight"
        />
        <span>Notify subscribers when this is uploaded</span>
      </label>

      <SaveButton />

      <p className="text-xs leading-5 text-ink-muted">
        Saving these settings withdraws any approval on this variant, because
        they change what would be published. Re-approve it in the Approval
        Queue.
      </p>
      <p className="text-xs leading-5 text-ink-muted">{SHORTS_GUIDANCE}</p>
    </form>
  );
}
