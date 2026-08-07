"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  contentFormValuesFrom,
  parseContentForm,
  parseContentUpdate,
  type ContentFieldErrors,
} from "@/lib/content/schema";
import type { ContentStatus } from "@/lib/content/types";
import {
  canManuallyVerify,
  markManuallyVerified,
  resolveVerificationAfterEdit,
} from "@/lib/content/verification";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Content write paths.
 *
 * Two rules are enforced here rather than in the forms, because a form is a
 * suggestion and an action is the gate:
 *
 * 1. **`owner_id` comes from the session.** It is never read from `formData`.
 *    The schemas do not even define the field, so a smuggled value is stripped
 *    before it reaches this layer, and RLS would reject it regardless.
 * 2. **Editing verified Scripture invalidates the verification**, via
 *    `resolveVerificationAfterEdit`. Every update path runs through it.
 */

export interface ContentActionState {
  error?: string;
  fieldErrors?: ContentFieldErrors;
}

const LIBRARY_PATH = "/dashboard/content";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createContent(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const parsed = parseContentForm(contentFormValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("content_items")
    .insert({
      ...parsed.data,
      // From the session. Never from the submission.
      owner_id: user.id,
      // Defaults are explicit rather than relying on the column default, so
      // the intent is visible where the row is created.
      status: "draft" satisfies ContentStatus,
      scripture_verification_status: "unverified",
    })
    .select("id")
    .single();

  if (error) {
    return { error: "Could not save this content item. Please try again." };
  }

  revalidatePath(LIBRARY_PATH);
  redirect(`${LIBRARY_PATH}/${data.id}`);
}

export async function updateContent(
  _previous: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { error: "Missing content item." };
  }

  const parsed = parseContentUpdate({
    ...(contentFormValuesFrom(formData) as Record<string, unknown>),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    redirect("/login");
  }

  // Read the current row first — the verification rule is a function of what
  // the Scripture *was*, which only the stored row knows.
  const { data: existing, error: readError } = await supabase
    .from("content_items")
    .select(
      "id, scripture_reference, scripture_text, scripture_verification_status, scripture_verified_at, scripture_verified_by",
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (readError || !existing) {
    return { error: "That content item could not be found." };
  }

  const verification = resolveVerificationAfterEdit(
    {
      scripture_verification_status: existing.scripture_verification_status,
      scripture_verified_at: existing.scripture_verified_at,
      scripture_verified_by: existing.scripture_verified_by,
    },
    {
      scripture_reference: existing.scripture_reference,
      scripture_text: existing.scripture_text,
    },
    {
      scripture_reference: parsed.data.scripture_reference ?? null,
      scripture_text: parsed.data.scripture_text ?? null,
    },
  );

  const { error } = await supabase
    .from("content_items")
    .update({ ...parsed.data, ...verification })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "Could not save your changes. Please try again." };
  }

  revalidatePath(LIBRARY_PATH);
  revalidatePath(`${LIBRARY_PATH}/${id}`);
  return {};
}

/** Move an item to archived. Content is retired, never deleted, by default. */
export async function archiveContent(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return;
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("content_items")
    .update({ status: "archived" satisfies ContentStatus })
    .eq("id", id)
    .eq("owner_id", user.id);

  revalidatePath(LIBRARY_PATH);
  revalidatePath(`${LIBRARY_PATH}/${id}`);
  redirect(`${LIBRARY_PATH}/${id}`);
}

/** Return an archived item to draft. */
export async function restoreContent(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return;
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("content_items")
    .update({ status: "draft" satisfies ContentStatus })
    .eq("id", id)
    .eq("owner_id", user.id);

  revalidatePath(LIBRARY_PATH);
  revalidatePath(`${LIBRARY_PATH}/${id}`);
  redirect(`${LIBRARY_PATH}/${id}`);
}

/**
 * Record that a human has checked the Scripture against a source.
 *
 * This asserts something about the wording currently stored, so it refuses
 * when there is no reference to verify.
 */
export async function verifyScripture(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return;
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    redirect("/login");
  }

  const { data: existing } = await supabase
    .from("content_items")
    .select("id, scripture_reference, scripture_text")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (
    !existing ||
    !canManuallyVerify({
      scripture_reference: existing.scripture_reference,
      scripture_text: existing.scripture_text,
    })
  ) {
    return;
  }

  await supabase
    .from("content_items")
    .update(markManuallyVerified(user.id, new Date().toISOString()))
    .eq("id", id)
    .eq("owner_id", user.id);

  revalidatePath(`${LIBRARY_PATH}/${id}`);
  redirect(`${LIBRARY_PATH}/${id}`);
}
