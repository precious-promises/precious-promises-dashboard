"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { isValidTimeZone } from "@/lib/schedule/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VOICE_MODELS } from "@/lib/voice/config";

/**
 * Settings writes. Preferences only; no credential is ever read from or
 * written to this path, and nothing here echoes a secret.
 */

const SETTINGS_PATH = "/dashboard/settings";

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

const optionalText = (max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(max)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  );

const settingsSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine(isValidTimeZone, "That is not a recognised IANA timezone."),
  default_aspect_ratio: z.enum(["9:16", "16:9", "1:1"]),
  default_cta: optionalText(300),
  brand_line: optionalText(200),
  elevenlabs_voice_id: optionalText(120),
  elevenlabs_model_id: z.preprocess(
    blankToUndefined,
    z
      .enum(VOICE_MODELS.map((model) => model.id) as [string, ...string[]])
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  ),
});

export type SettingsFieldErrors = Partial<
  Record<keyof z.infer<typeof settingsSchema>, string>
>;

export interface SettingsActionState {
  error?: string;
  notice?: string;
  fieldErrors?: SettingsFieldErrors;
}

export async function saveSettings(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    timezone: formData.get("timezone"),
    default_aspect_ratio: formData.get("default_aspect_ratio"),
    default_cta: formData.get("default_cta"),
    brand_line: formData.get("brand_line"),
    elevenlabs_voice_id: formData.get("elevenlabs_voice_id"),
    elevenlabs_model_id: formData.get("elevenlabs_model_id"),
  });

  if (!parsed.success) {
    const fieldErrors: SettingsFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof SettingsFieldErrors] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { error } = await supabase.from("app_settings").upsert(
    {
      ...parsed.data,
      owner_id: user.id,
    },
    { onConflict: "owner_id" },
  );

  if (error) {
    return { error: "The settings could not be saved." };
  }

  // Which settings changed, never their values — a timezone is harmless but
  // the discipline is uniform.
  await recordAudit("settings_updated", "app_settings", user.id, {
    fields: Object.keys(parsed.data).join(","),
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/dashboard");
  return { notice: "Settings saved." };
}
