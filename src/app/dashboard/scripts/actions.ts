"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseScriptRevision, scriptValuesFrom } from "@/lib/scripts/schema";
import type { ScriptFieldErrors } from "@/lib/scripts/schema";
import { nextRevisionNumber } from "@/lib/scripts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Script write path.
 *
 * Saving always **inserts** a new revision. Nothing here updates an existing
 * one, so history cannot be lost by an ordinary save — the point of numbered
 * revisions is that what was written before is still readable afterwards.
 *
 * The payload contains no Scripture fields, so this action structurally cannot
 * alter `content_items.scripture_text` or `scripture_reference`.
 */

export interface ScriptActionState {
  error?: string;
  fieldErrors?: ScriptFieldErrors;
}

export async function saveScriptRevision(
  _previous: ScriptActionState,
  formData: FormData,
): Promise<ScriptActionState> {
  const contentItemId = formData.get("content_item_id");
  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }

  const parsed = parseScriptRevision(scriptValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Confirm the parent item is the caller's before writing anything against
  // it. RLS enforces this too; checking here turns a policy rejection into a
  // clear message rather than an opaque failure.
  const { data: item } = await supabase
    .from("content_items")
    .select("id")
    .eq("id", contentItemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!item) {
    return { error: "That content item could not be found." };
  }

  const { data: latest } = await supabase
    .from("script_revisions")
    .select("revision_number")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", user.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const revisionNumber = nextRevisionNumber(latest?.revision_number ?? null);

  const { error } = await supabase.from("script_revisions").insert({
    ...parsed.data,
    content_item_id: contentItemId,
    // From the session. Never from the submission.
    owner_id: user.id,
    revision_number: revisionNumber,
  });

  if (error) {
    // A unique-constraint collision means a concurrent save took this number.
    // Saying so is more useful than a generic failure.
    return {
      error:
        "Could not save this revision. If you have another tab open, reload and try again.",
    };
  }

  revalidatePath("/dashboard/scripts");
  revalidatePath(`/dashboard/content/${contentItemId}`);
  redirect(`/dashboard/scripts?item=${contentItemId}`);
}
