"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { TikTokMetadataActionState } from "@/app/dashboard/captions/actions";
import { saveTikTokMetadata } from "@/app/dashboard/captions/actions";
import type { TikTokCapability } from "@/lib/tiktok/capability";
import {
  CAPTION_WARNING_CHARACTERS,
  DELIVERY_MODES,
  DELIVERY_MODE_DETAIL,
  DELIVERY_MODE_LABELS,
  PRIVACY_LEVEL_LABELS,
  type DeliveryMode,
} from "@/lib/tiktok/config";
import type { TikTokVideoMetadata } from "@/lib/tiktok/types";

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
      {pending ? "Saving…" : "Save TikTok settings"}
    </button>
  );
}

/**
 * TikTok publishing settings for one platform variant.
 *
 * Two rules shape every control here.
 *
 * **The audience list comes from TikTok, not from this file.** TikTok refuses a
 * privacy level it did not return for this specific creator, and it returns the
 * public options only to an application it has audited. So the select is built
 * from `capability.privacyLevelOptions` and shows nothing when that list is
 * empty — offering a "Post publicly" option that TikTok would reject is exactly
 * the button this product must not have.
 *
 * **A delivery mode nobody could carry out is not offered as a choice.** A mode
 * outside `capability.availableModes` is still listed, disabled, with the
 * reason attached — hiding it would suggest it does not exist, when the truth
 * is that a permission is missing and can be granted.
 */
export function TikTokMetadataForm({
  platformVariantId,
  contentItemId,
  metadata,
  capability,
}: {
  platformVariantId: string;
  contentItemId: string;
  metadata: TikTokVideoMetadata | null;
  capability: TikTokCapability;
}) {
  const [state, formAction] = useActionState(
    saveTikTokMetadata,
    {} as TikTokMetadataActionState,
  );
  const errors = state.fieldErrors ?? {};

  const [mode, setMode] = useState<DeliveryMode>(
    metadata?.delivery_mode ?? "inbox",
  );
  const [commercial, setCommercial] = useState(
    metadata?.is_commercial_content ?? false,
  );

  const canPostDirectly = capability.availableModes.includes("direct_post");

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

      {capability.problems.length > 0 ? (
        <ul className="list-disc space-y-1 rounded-lg border border-edge bg-panel-raised/40 px-5 py-3 text-xs leading-5 text-ink-muted">
          {capability.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className={LABEL}>How this should reach TikTok</legend>
        {DELIVERY_MODES.map((option) => {
          const available = capability.availableModes.includes(option);
          return (
            <label
              key={option}
              className="flex items-start gap-2 text-sm text-ink-primary"
            >
              <input
                type="radio"
                name="delivery_mode"
                value={option}
                checked={mode === option}
                disabled={!available}
                onChange={() => setMode(option)}
                className="mt-1 accent-highlight"
              />
              <span>
                {DELIVERY_MODE_LABELS[option]}
                {available ? null : (
                  <span className="ml-2 rounded border border-edge-strong/70 px-1.5 py-0.5 text-[11px] text-ink-muted">
                    unavailable
                  </span>
                )}
                <span className="block text-xs text-ink-muted">
                  {DELIVERY_MODE_DETAIL[option]}
                </span>
              </span>
            </label>
          );
        })}
        {errors.delivery_mode ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.delivery_mode}</p>
        ) : null}
      </fieldset>

      {mode === "direct_post" ? (
        <div>
          <label htmlFor="privacy_level" className={LABEL}>
            Who can see it
          </label>
          {capability.privacyLevelOptions.length === 0 ? (
            <p className="rounded-lg border border-edge bg-panel-raised/40 px-3.5 py-2.5 text-sm text-ink-muted">
              TikTok has not told this application which audiences your account
              may use, so none can be offered. Nothing is assumed on your
              behalf.
            </p>
          ) : (
            <select
              id="privacy_level"
              name="privacy_level"
              defaultValue={metadata?.privacy_level ?? ""}
              className={FIELD}
            >
              <option value="">Choose an audience</option>
              {capability.privacyLevelOptions.map((level) => (
                <option key={level} value={level}>
                  {PRIVACY_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1.5 text-xs text-ink-muted">
            This list comes from TikTok, for your account, read just now. TikTok
            refuses anything not on it.
          </p>
          {errors.privacy_level ? (
            <p className="mt-1.5 text-sm text-red-300">
              {errors.privacy_level}
            </p>
          ) : null}
        </div>
      ) : (
        // The field still submits, so a saved audience is not silently dropped
        // when the owner is looking at a mode that does not use it.
        <input
          type="hidden"
          name="privacy_level"
          value={metadata?.privacy_level ?? ""}
        />
      )}

      {mode === "direct_post" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className={LABEL}>Interaction</legend>

          <label className="flex items-start gap-2 text-sm text-ink-primary">
            <input
              type="checkbox"
              name="disable_comment"
              defaultChecked={
                metadata?.disable_comment ?? capability.commentDisabled
              }
              className="mt-1 accent-highlight"
            />
            <span>
              Turn comments off
              {capability.commentDisabled ? (
                <span className="block text-xs text-ink-muted">
                  Your account has comments off already, so this must stay
                  ticked — TikTok refuses a post that enables them.
                </span>
              ) : null}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-ink-primary">
            <input
              type="checkbox"
              name="disable_duet"
              defaultChecked={metadata?.disable_duet ?? capability.duetDisabled}
              className="mt-1 accent-highlight"
            />
            <span>
              Turn Duet off
              {capability.duetDisabled ? (
                <span className="block text-xs text-ink-muted">
                  Your account has Duet off already, so this must stay ticked.
                </span>
              ) : null}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-ink-primary">
            <input
              type="checkbox"
              name="disable_stitch"
              defaultChecked={
                metadata?.disable_stitch ?? capability.stitchDisabled
              }
              className="mt-1 accent-highlight"
            />
            <span>
              Turn Stitch off
              {capability.stitchDisabled ? (
                <span className="block text-xs text-ink-muted">
                  Your account has Stitch off already, so this must stay ticked.
                </span>
              ) : null}
            </span>
          </label>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className={LABEL}>Commercial content disclosure</legend>

        <label className="flex items-start gap-2 text-sm text-ink-primary">
          <input
            type="checkbox"
            name="is_commercial_content"
            checked={commercial}
            onChange={(event) => setCommercial(event.target.checked)}
            className="mt-1 accent-highlight"
          />
          <span>
            This post promotes a product or service
            <span className="block text-xs text-ink-muted">
              A declaration with legal weight. Leave it off unless it is true.
            </span>
          </span>
        </label>

        {commercial ? (
          <>
            <label className="ml-6 flex items-start gap-2 text-sm text-ink-primary">
              <input
                type="checkbox"
                name="is_your_brand"
                defaultChecked={metadata?.is_your_brand ?? false}
                className="mt-1 accent-highlight"
              />
              <span>
                Your own brand
                <span className="block text-xs text-ink-muted">
                  You are promoting something of your own.
                </span>
              </span>
            </label>

            <label className="ml-6 flex items-start gap-2 text-sm text-ink-primary">
              <input
                type="checkbox"
                name="is_branded_content"
                defaultChecked={metadata?.is_branded_content ?? false}
                className="mt-1 accent-highlight"
              />
              <span>
                Branded content
                <span className="block text-xs text-ink-muted">
                  A paid partnership with a third party. TikTok does not allow
                  branded content to be posted privately.
                </span>
              </span>
            </label>
          </>
        ) : null}

        {errors.is_commercial_content ? (
          <p className="mt-1.5 text-sm text-red-300">
            {errors.is_commercial_content}
          </p>
        ) : null}
      </fieldset>

      <SaveButton />

      <p className="text-xs leading-5 text-ink-muted">
        The caption is built from this variant&rsquo;s wording, the verified
        Scripture and its hashtags, in that order and kept visually separate.
        Anything longer than {CAPTION_WARNING_CHARACTERS} characters is refused
        before it is sent.
      </p>
      <p className="text-xs leading-5 text-ink-muted">
        Changing any of these settings withdraws this variant&rsquo;s approval.
        {canPostDirectly
          ? " Switching between a draft upload and a direct post is the largest change of all — it is the difference between something you publish and something this dashboard publishes for you."
          : ""}
      </p>
    </form>
  );
}
