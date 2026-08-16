/**
 * The Rights & Licences register.
 *
 * An **administrative record, not legal advice** — it tracks what Dave knows
 * about where each asset's rights come from, so the question "may we use
 * this?" has a written answer. Nothing here reaches a legal conclusion, and
 * publishing is never blocked by an empty optional field: the register
 * warns, Dave decides.
 */

export const LICENCE_STATUSES = [
  "active",
  "expiring",
  "expired",
  "needs_review",
  "restricted",
] as const;
export type LicenceStatus = (typeof LICENCE_STATUSES)[number];

export const LICENCE_STATUS_LABELS: Record<LicenceStatus, string> = {
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
  needs_review: "Needs review",
  restricted: "Restricted use",
};

export interface LicenceRecord {
  id: string;
  owner_id: string;
  asset_label: string;
  media_asset_id: string | null;
  rights_source: string | null;
  licence_type: string | null;
  licensor: string | null;
  permitted_use: string | null;
  proof_reference: string | null;
  starts_on: string | null;
  expires_on: string | null;
  status: LicenceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** How close an expiry has to be before the register warns. */
export const EXPIRY_WARNING_DAYS = 30;

export interface LicenceWarning {
  kind: "expiring" | "expired" | "restricted" | "missing_information";
  recordId: string;
  assetLabel: string;
  detail: string;
}

/**
 * Derive the warnings a register should show. Pure, dated by the caller.
 * A warning is information — never an automatic block.
 */
export function licenceWarnings(
  records: readonly LicenceRecord[],
  now: Date = new Date(),
): LicenceWarning[] {
  const warnings: LicenceWarning[] = [];
  const today = now.getTime();
  const warningWindow = EXPIRY_WARNING_DAYS * 86_400_000;

  for (const record of records) {
    if (record.expires_on !== null) {
      const expires = Date.parse(record.expires_on);
      if (!Number.isNaN(expires)) {
        if (expires < today) {
          warnings.push({
            kind: "expired",
            recordId: record.id,
            assetLabel: record.asset_label,
            detail: `The licence recorded for this asset expired on ${record.expires_on}.`,
          });
        } else if (expires - today < warningWindow) {
          warnings.push({
            kind: "expiring",
            recordId: record.id,
            assetLabel: record.asset_label,
            detail: `The licence recorded for this asset expires on ${record.expires_on} — within ${EXPIRY_WARNING_DAYS} days.`,
          });
        }
      }
    }

    if (record.status === "restricted") {
      warnings.push({
        kind: "restricted",
        recordId: record.id,
        assetLabel: record.asset_label,
        detail:
          record.permitted_use ??
          "This asset is marked restricted and its permitted use is not recorded.",
      });
    }

    if (
      record.rights_source === null &&
      record.licence_type === null &&
      record.proof_reference === null
    ) {
      warnings.push({
        kind: "missing_information",
        recordId: record.id,
        assetLabel: record.asset_label,
        detail:
          "No rights source, licence type or proof is recorded for this asset yet.",
      });
    }
  }

  return warnings;
}

/**
 * The rights questions this product already knows it carries, offered as
 * starting points when the register is empty. Notes, not conclusions.
 */
export const SUGGESTED_RIGHTS_ENTRIES: readonly {
  label: string;
  hint: string;
}[] = [
  {
    label: "Scripture translation (KJV)",
    hint: "Record the translation used and any usage notes for it.",
  },
  {
    label: "Background music / ambience",
    hint: "Each track needs its source and licence recorded before it backs a published video.",
  },
  {
    label: "Background video / images",
    hint: "Stock or sourced visuals carry their own licences.",
  },
  {
    label: "ElevenLabs voice output",
    hint: "Record the subscription tier and its commercial usage terms.",
  },
  {
    label: "Remotion (server-side rendering)",
    hint: "Remotion is source-available with a company licence requirement above a team-size threshold. Record which licence applies.",
  },
];
