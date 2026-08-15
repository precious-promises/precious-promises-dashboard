// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXPIRY_WARNING_DAYS,
  LICENCE_STATUS_LABELS,
  LICENCE_STATUSES,
  licenceWarnings,
  SUGGESTED_RIGHTS_ENTRIES,
  type LicenceRecord,
} from "@/lib/rights/types";

/**
 * The Rights & Licences register: an administrative record that warns.
 * Warnings are information for Dave, never automatic blocks — and nothing
 * here or anywhere phrases itself as legal advice.
 */

function record(overrides: Partial<LicenceRecord>): LicenceRecord {
  return {
    id: "r1",
    owner_id: "owner",
    asset_label: "Background track",
    media_asset_id: null,
    rights_source: "Licensed library",
    licence_type: "Standard licence",
    licensor: null,
    permitted_use: null,
    proof_reference: "invoice-42",
    starts_on: null,
    expires_on: null,
    status: "active",
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-08-15T09:00:00Z");

describe("licence vocabulary", () => {
  it("labels every status", () => {
    for (const status of LICENCE_STATUSES) {
      expect(LICENCE_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("warnings", () => {
  it("warns about an expired licence", () => {
    const warnings = licenceWarnings(
      [record({ expires_on: "2026-08-01" })],
      NOW,
    );
    expect(warnings.map((warning) => warning.kind)).toContain("expired");
  });

  it("warns ahead of an expiry inside the window", () => {
    const warnings = licenceWarnings(
      [record({ expires_on: "2026-09-01" })],
      NOW,
    );
    expect(warnings.map((warning) => warning.kind)).toContain("expiring");
    expect(warnings[0]!.detail).toContain(String(EXPIRY_WARNING_DAYS));
  });

  it("does not warn about an expiry far in the future", () => {
    const warnings = licenceWarnings(
      [record({ expires_on: "2027-08-15" })],
      NOW,
    );
    expect(warnings).toEqual([]);
  });

  it("surfaces restricted assets and empty records", () => {
    const warnings = licenceWarnings(
      [
        record({ id: "restricted", status: "restricted" }),
        record({
          id: "empty",
          rights_source: null,
          licence_type: null,
          proof_reference: null,
        }),
      ],
      NOW,
    );

    expect(warnings.map((warning) => warning.kind).sort()).toEqual([
      "missing_information",
      "restricted",
    ]);
  });

  it("returns plain data — a warning can never block anything", () => {
    // The type has no `blocking` field and the function only describes. The
    // gate that decides what may publish lives in publishing/gate.ts and does
    // not import this module.
    const gate = readFileSync(
      join(process.cwd(), "src/lib/publishing/gate.ts"),
      "utf8",
    );
    expect(gate).not.toContain("licence");
    expect(gate).not.toContain("rights/");
  });
});

describe("the register stays administrative", () => {
  it("says it is a record, not legal advice, in the module and the page", () => {
    const types = readFileSync(
      join(process.cwd(), "src/lib/rights/types.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "src/app/dashboard/rights/page.tsx"),
      "utf8",
    );

    expect(types).toMatch(/not legal advice/i);
    expect(page).toMatch(/not legal advice/i);
  });

  it("suggests the rights questions this product already carries", () => {
    const labels = SUGGESTED_RIGHTS_ENTRIES.map((entry) => entry.label);
    expect(labels.join(" ")).toMatch(/Remotion/);
    expect(labels.join(" ")).toMatch(/ElevenLabs/);
    expect(labels.join(" ")).toMatch(/KJV/);
  });
});
