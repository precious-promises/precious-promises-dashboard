"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  licenceValuesFrom,
  parseLicenceForm,
  type LicenceFieldErrors,
} from "@/lib/rights/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Rights register write paths. Administrative records only — nothing here
 * blocks or unblocks publishing, and nothing states a legal conclusion.
 */

const RIGHTS_PATH = "/dashboard/rights";

export interface LicenceActionState {
  error?: string;
  notice?: string;
  fieldErrors?: LicenceFieldErrors;
}

export async function createLicenceRecord(
  _previous: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const parsed = parseLicenceForm(licenceValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (parsed.data.media_asset_id !== null) {
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id")
      .eq("id", parsed.data.media_asset_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!asset) {
      return { error: "That linked media asset could not be found." };
    }
  }

  const { data, error } = await supabase
    .from("licence_records")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "The licence record could not be saved." };
  }

  await recordAudit(
    "licence_record_created",
    "licence_record",
    (data as { id: string }).id,
    { status: parsed.data.status },
  );

  revalidatePath(RIGHTS_PATH);
  return { notice: "Recorded. A register entry, not a legal conclusion." };
}

export async function updateLicenceRecord(
  _previous: LicenceActionState,
  formData: FormData,
): Promise<LicenceActionState> {
  const recordId = formData.get("licence_record_id");
  if (typeof recordId !== "string" || recordId === "") {
    return { error: "That record could not be found." };
  }

  const parsed = parseLicenceForm(licenceValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  // The same proof the create path makes: a linked asset must be the
  // owner's. An update is not a quieter door.
  if (parsed.data.media_asset_id !== null) {
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id")
      .eq("id", parsed.data.media_asset_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!asset) {
      return { error: "That linked media asset could not be found." };
    }
  }

  const { data, error } = await supabase
    .from("licence_records")
    .update(parsed.data)
    .eq("id", recordId)
    .eq("owner_id", user.id)
    .select("id");

  if (error || !data || data.length === 0) {
    return { error: "The licence record could not be updated." };
  }

  await recordAudit("licence_record_updated", "licence_record", recordId, {
    status: parsed.data.status,
  });

  revalidatePath(RIGHTS_PATH);
  return { notice: "Record updated." };
}

export async function deleteLicenceRecord(formData: FormData): Promise<void> {
  const recordId = formData.get("licence_record_id");
  if (typeof recordId !== "string" || recordId === "") {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data } = await supabase
    .from("licence_records")
    .delete()
    .eq("id", recordId)
    .eq("owner_id", user.id)
    .select("id");

  if (data && data.length > 0) {
    await recordAudit("licence_record_deleted", "licence_record", recordId, {});
  }

  revalidatePath(RIGHTS_PATH);
  redirect(RIGHTS_PATH);
}
