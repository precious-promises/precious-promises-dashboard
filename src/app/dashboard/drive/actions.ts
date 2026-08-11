"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { isFolder, mediaTypeForMime, safeFilename } from "@/lib/drive/config";
import { driveStorage } from "@/lib/drive/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Importing a Drive file as a media asset.
 *
 * "Import" means **register a reference**, not copy bytes. The file stays in
 * Drive; this records that it exists, what it is, and that it was inside the
 * approved folder when it was imported.
 *
 * Every fact stored comes from the Drive API, not from the form. The form
 * supplies one thing — a file id — and even that is re-verified: `describe`
 * proves the file exists and descends from the approved root before a row is
 * written. A file id typed into the URL of a folder outside the root is
 * refused here, exactly as it would be at publish time.
 */

const DRIVE_PATH = "/dashboard/drive";

function back(folderId: string | null, notice: string): never {
  revalidatePath(DRIVE_PATH);
  const target = folderId
    ? `${DRIVE_PATH}?folder=${encodeURIComponent(folderId)}&notice=${notice}`
    : `${DRIVE_PATH}?notice=${notice}`;
  redirect(target);
}

export async function importDriveFile(formData: FormData): Promise<void> {
  const fileId = formData.get("file_id");
  const folderId = formData.get("folder_id");
  const returnTo = typeof folderId === "string" ? folderId : null;

  if (typeof fileId !== "string" || fileId === "") {
    back(returnTo, "no-file");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  // Re-read from Drive, with containment proved. Nothing about the file is
  // taken from the submission.
  const described = await driveStorage.describe(fileId, user.id);

  if (!described.ok) {
    await recordAudit("drive_asset_rejected", "media_asset", fileId, {
      refusal: described.refusal,
    });
    back(returnTo, described.refusal);
  }

  const file = described.value;

  if (isFolder(file.mimeType)) {
    back(returnTo, "is_folder");
  }

  const mediaType = mediaTypeForMime(file.mimeType);
  if (mediaType === null) {
    await recordAudit("drive_asset_rejected", "media_asset", fileId, {
      refusal: "unsupported_type",
      mime_type: file.mimeType,
    });
    back(returnTo, "unsupported_type");
  }

  const { data: existing } = await supabase
    .from("media_assets")
    .select("id")
    .eq("owner_id", user.id)
    .eq("storage_provider", "google_drive")
    .eq("external_file_id", file.id)
    .maybeSingle();

  if (existing) {
    back(returnTo, "already-imported");
  }

  const { data: created, error } = await supabase
    .from("media_assets")
    .insert({
      owner_id: user.id,
      name: safeFilename(file.name),
      media_type: mediaType,
      storage_provider: "google_drive",
      external_file_id: file.id,
      // Deliberately null. A Drive URL is not a fetchable media source, and
      // storing one would invite something to treat it as one.
      external_url: null,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      duration_seconds: file.durationSeconds,
      source_folder_id: returnTo,
      source_verified_at: new Date().toISOString(),
      // Rights are a human judgement about a file, not something Drive knows.
      rights_status: "unknown",
    })
    .select("id")
    .single();

  if (error || !created) {
    back(returnTo, "import-failed");
  }

  await recordAudit(
    "drive_asset_imported",
    "media_asset",
    (created as { id: string }).id,
    { media_type: mediaType, mime_type: file.mimeType },
  );

  revalidatePath("/dashboard/media");
  back(returnTo, "imported");
}
