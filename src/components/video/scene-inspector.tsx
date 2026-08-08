"use client";

import { ChevronDown, ChevronUp, Scissors, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteScene,
  moveScene,
  splitScene,
  updateScene,
  type SceneActionState,
} from "@/app/dashboard/video/actions";
import type { MediaAsset } from "@/lib/media/types";
import { canSplitScene } from "@/lib/video/scenes";
import {
  SCENE_TEXT_SOURCE_LABELS,
  SCENE_TYPE_HINTS,
  SCENE_TYPE_LABELS,
  SCENE_TYPES,
  TEXT_ALIGNMENTS,
  TEXT_ALIGNMENT_LABELS,
  TEXT_ANIMATION_LABELS,
  TEXT_ANIMATIONS,
  TEXT_POSITION_LABELS,
  TEXT_POSITIONS,
  TRANSITION_LABELS,
  TRANSITIONS,
  type SceneType,
  type VideoScene,
} from "@/lib/video/types";

/**
 * The selected scene's properties.
 *
 * The Scripture rule is enforced in the interface as well as in the schema and
 * the database: choosing the Scripture type removes the text field entirely
 * and fixes the source to the verified verse. There is no state of this form
 * in which a verse can be typed.
 */

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1 block text-xs font-medium text-ink-secondary";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save scene"}
    </button>
  );
}

function OperationButton({
  children,
  title,
  disabled = false,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      title={title}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SceneInspector({
  projectId,
  scene,
  mediaAssets,
  isFirst,
  isLast,
}: {
  projectId: string;
  scene: VideoScene;
  mediaAssets: MediaAsset[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction] = useActionState(
    updateScene,
    {} as SceneActionState,
  );
  const [sceneType, setSceneType] = useState<SceneType>(scene.scene_type);
  const [textSource, setTextSource] = useState(scene.text_source);

  const isScripture = sceneType === "scripture";
  const effectiveSource = isScripture ? "content_scripture" : textSource;
  const errors = state.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="scene_id" value={scene.id} />

        {state.error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          >
            {state.error}
          </p>
        ) : null}

        <div>
          <label htmlFor="scene_type" className={LABEL}>
            Layer
          </label>
          <select
            id="scene_type"
            name="scene_type"
            value={sceneType}
            onChange={(event) => {
              const next = event.target.value as SceneType;
              setSceneType(next);
              if (next === "scripture") {
                setTextSource("content_scripture");
              } else if (textSource === "content_scripture") {
                setTextSource("custom");
              }
            }}
            className={FIELD}
          >
            {SCENE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SCENE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-muted">
            {SCENE_TYPE_HINTS[sceneType]}
          </p>
        </div>

        <div>
          <label htmlFor="text_source" className={LABEL}>
            Words come from
          </label>
          {isScripture ? (
            <>
              {/* Fixed, not merely defaulted: a Scripture scene has one legal
                  source and the form offers no way to change it. */}
              <input
                type="hidden"
                name="text_source"
                value="content_scripture"
              />
              <p className="rounded-lg border border-gold-dim/40 bg-gold/5 px-3 py-2 text-sm text-ink-secondary">
                {SCENE_TEXT_SOURCE_LABELS.content_scripture}
              </p>
            </>
          ) : (
            <select
              id="text_source"
              name="text_source"
              value={effectiveSource}
              onChange={(event) =>
                setTextSource(event.target.value as VideoScene["text_source"])
              }
              className={FIELD}
            >
              <option value="custom">{SCENE_TEXT_SOURCE_LABELS.custom}</option>
              <option value="script_revision">
                {SCENE_TEXT_SOURCE_LABELS.script_revision}
              </option>
            </select>
          )}
          {errors.text_source ? (
            <p className="mt-1 text-sm text-red-300">{errors.text_source}</p>
          ) : null}
        </div>

        {effectiveSource === "custom" ? (
          <div>
            <label htmlFor="text_content" className={LABEL}>
              Words
            </label>
            <textarea
              id="text_content"
              name="text_content"
              rows={5}
              defaultValue={scene.text_content ?? ""}
              aria-invalid={errors.text_content ? true : undefined}
              className={FIELD}
            />
            {errors.text_content ? (
              <p className="mt-1 text-sm text-red-300">{errors.text_content}</p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-edge bg-panel-raised/30 px-3 py-2 text-xs text-ink-muted">
            {isScripture
              ? "The verse is read from the content item. It cannot be edited here, and editing it in the Content Library resets its verification."
              : "This scene reads the latest saved script revision. Switch to “Written here” to type words for this scene alone."}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="duration_seconds" className={LABEL}>
              Duration (seconds)
            </label>
            <input
              id="duration_seconds"
              name="duration_seconds"
              type="number"
              min={0.5}
              max={600}
              step={0.5}
              defaultValue={scene.duration_seconds}
              aria-invalid={errors.duration_seconds ? true : undefined}
              className={FIELD}
            />
            {errors.duration_seconds ? (
              <p className="mt-1 text-sm text-red-300">
                {errors.duration_seconds}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="transition" className={LABEL}>
              Transition in
            </label>
            <select
              id="transition"
              name="transition"
              defaultValue={scene.transition}
              className={FIELD}
            >
              {TRANSITIONS.map((option) => (
                <option key={option} value={option}>
                  {TRANSITION_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="text_position" className={LABEL}>
              Text position
            </label>
            <select
              id="text_position"
              name="text_position"
              defaultValue={scene.text_position}
              className={FIELD}
            >
              {TEXT_POSITIONS.map((option) => (
                <option key={option} value={option}>
                  {TEXT_POSITION_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="text_align" className={LABEL}>
              Text alignment
            </label>
            <select
              id="text_align"
              name="text_align"
              defaultValue={scene.text_align}
              className={FIELD}
            >
              {TEXT_ALIGNMENTS.map((option) => (
                <option key={option} value={option}>
                  {TEXT_ALIGNMENT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="text_animation" className={LABEL}>
              Animation
            </label>
            <select
              id="text_animation"
              name="text_animation"
              defaultValue={scene.text_animation}
              className={FIELD}
            >
              {TEXT_ANIMATIONS.map((option) => (
                <option key={option} value={option}>
                  {TEXT_ANIMATION_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="media_asset_id" className={LABEL}>
              Background
            </label>
            <select
              id="media_asset_id"
              name="media_asset_id"
              defaultValue={scene.media_asset_id ?? ""}
              className={FIELD}
            >
              <option value="">None</option>
              {mediaAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <SaveButton />
      </form>

      {/* Scene operations are separate submissions: forms cannot nest, and a
          delete should not travel with unsaved property edits. */}
      <div className="flex flex-wrap gap-2 border-t border-edge/70 pt-3">
        <form action={moveScene}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="scene_id" value={scene.id} />
          <input type="hidden" name="direction" value="up" />
          <OperationButton title="Move earlier" disabled={isFirst}>
            <ChevronUp aria-hidden="true" className="size-3.5" />
            Earlier
          </OperationButton>
        </form>

        <form action={moveScene}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="scene_id" value={scene.id} />
          <input type="hidden" name="direction" value="down" />
          <OperationButton title="Move later" disabled={isLast}>
            <ChevronDown aria-hidden="true" className="size-3.5" />
            Later
          </OperationButton>
        </form>

        <form action={splitScene}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="scene_id" value={scene.id} />
          <OperationButton
            title="Split this scene into two of half the length"
            disabled={!canSplitScene(scene.duration_seconds)}
          >
            <Scissors aria-hidden="true" className="size-3.5" />
            Split
          </OperationButton>
        </form>

        <form action={deleteScene}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="scene_id" value={scene.id} />
          <OperationButton title="Delete this scene">
            <Trash2 aria-hidden="true" className="size-3.5" />
            Delete
          </OperationButton>
        </form>
      </div>
    </div>
  );
}
