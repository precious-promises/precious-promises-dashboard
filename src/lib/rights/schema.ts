import { z } from "zod";

import { LICENCE_STATUSES } from "./types";

/** Licence form validation. No `owner_id`, no legal conclusions. */

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

const optionalDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
);

export const licenceRecordSchema = z
  .object({
    asset_label: z.string().trim().min(1, "Name the asset.").max(200),
    media_asset_id: z.preprocess(
      blankToUndefined,
      z
        .string()
        .uuid()
        .nullable()
        .optional()
        .transform((value) => value ?? null),
    ),
    rights_source: optionalText(200),
    licence_type: optionalText(100),
    licensor: optionalText(200),
    permitted_use: optionalText(1000),
    proof_reference: optionalText(500),
    starts_on: optionalDate,
    expires_on: optionalDate,
    status: z.enum(LICENCE_STATUSES).default("needs_review"),
    notes: optionalText(2000),
  })
  .refine(
    (values) =>
      values.expires_on === null ||
      values.starts_on === null ||
      values.expires_on >= values.starts_on,
    {
      path: ["expires_on"],
      message: "The expiry cannot be before the start.",
    },
  );

export type LicenceRecordValues = z.infer<typeof licenceRecordSchema>;
export type LicenceFieldErrors = Partial<
  Record<keyof LicenceRecordValues, string>
>;

export function licenceValuesFrom(formData: FormData): Record<string, unknown> {
  return {
    asset_label: formData.get("asset_label"),
    media_asset_id: formData.get("media_asset_id"),
    rights_source: formData.get("rights_source"),
    licence_type: formData.get("licence_type"),
    licensor: formData.get("licensor"),
    permitted_use: formData.get("permitted_use"),
    proof_reference: formData.get("proof_reference"),
    starts_on: formData.get("starts_on"),
    expires_on: formData.get("expires_on"),
    status: formData.get("status") ?? undefined,
    notes: formData.get("notes"),
  };
}

export type LicenceParseResult =
  | { success: true; data: LicenceRecordValues }
  | { success: false; fieldErrors: LicenceFieldErrors };

export function parseLicenceForm(
  values: Record<string, unknown>,
): LicenceParseResult {
  const result = licenceRecordSchema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: LicenceFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof LicenceRecordValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
