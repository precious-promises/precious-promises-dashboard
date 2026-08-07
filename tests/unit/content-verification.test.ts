// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  canManuallyVerify,
  markManuallyVerified,
  resolveVerificationAfterEdit,
  scriptureChanged,
  type VerificationState,
} from "@/lib/content/verification";

/**
 * The Scripture verification rule.
 *
 * Approval attaches to a specific wording of a specific reference. These tests
 * exist because the failure they prevent — an item that claims to be verified
 * while carrying text nobody checked — would be invisible in the interface.
 */

const VERIFIED: VerificationState = {
  scripture_verification_status: "manually_verified",
  scripture_verified_at: "2026-08-01T10:00:00.000Z",
  scripture_verified_by: "11111111-1111-1111-1111-111111111111",
};

const UNVERIFIED: VerificationState = {
  scripture_verification_status: "unverified",
  scripture_verified_at: null,
  scripture_verified_by: null,
};

const REFERENCE = {
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises...",
};

describe("scriptureChanged", () => {
  it("sees an altered reference", () => {
    expect(
      scriptureChanged(REFERENCE, {
        ...REFERENCE,
        scripture_reference: "2 Peter 1:5",
      }),
    ).toBe(true);
  });

  it("sees a single altered word in the text", () => {
    expect(
      scriptureChanged(REFERENCE, {
        ...REFERENCE,
        scripture_text: "Whereby are given unto us exceeding great promises...",
      }),
    ).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(
      scriptureChanged(REFERENCE, {
        scripture_reference: "  2 Peter 1:4  ",
        scripture_text: `${REFERENCE.scripture_text}\n`,
      }),
    ).toBe(false);
  });

  it("treats null and empty string as the same absence", () => {
    expect(
      scriptureChanged(
        { scripture_reference: null, scripture_text: null },
        { scripture_reference: "", scripture_text: "   " },
      ),
    ).toBe(false);
  });

  it("sees Scripture being removed", () => {
    expect(
      scriptureChanged(REFERENCE, {
        scripture_reference: null,
        scripture_text: null,
      }),
    ).toBe(true);
  });
});

describe("resolveVerificationAfterEdit", () => {
  it("invalidates verification when the reference changes", () => {
    const result = resolveVerificationAfterEdit(VERIFIED, REFERENCE, {
      ...REFERENCE,
      scripture_reference: "2 Peter 1:5",
    });

    expect(result.scripture_verification_status).toBe("verification_required");
  });

  it("invalidates verification when the text changes", () => {
    const result = resolveVerificationAfterEdit(VERIFIED, REFERENCE, {
      ...REFERENCE,
      scripture_text: "Something a human never checked.",
    });

    expect(result.scripture_verification_status).toBe("verification_required");
  });

  it("clears the verification metadata it invalidates", () => {
    // Leaving verified_at behind would let the interface show a verification
    // date for wording that was never verified.
    const result = resolveVerificationAfterEdit(VERIFIED, REFERENCE, {
      ...REFERENCE,
      scripture_text: "Changed.",
    });

    expect(result.scripture_verified_at).toBeNull();
    expect(result.scripture_verified_by).toBeNull();
  });

  it("keeps verification when the Scripture is untouched", () => {
    // Editing a title says nothing about the verse.
    expect(
      resolveVerificationAfterEdit(VERIFIED, REFERENCE, REFERENCE),
    ).toEqual(VERIFIED);
  });

  it("keeps verification through a whitespace-only edit", () => {
    const result = resolveVerificationAfterEdit(VERIFIED, REFERENCE, {
      scripture_reference: " 2 Peter 1:4 ",
      scripture_text: REFERENCE.scripture_text,
    });

    expect(result.scripture_verification_status).toBe("manually_verified");
  });

  it("leaves an unverified item unverified", () => {
    const result = resolveVerificationAfterEdit(UNVERIFIED, REFERENCE, {
      ...REFERENCE,
      scripture_text: "Changed.",
    });

    expect(result.scripture_verification_status).toBe("unverified");
  });

  it("keeps an item that already needs re-verification in that state", () => {
    const needsVerification: VerificationState = {
      scripture_verification_status: "verification_required",
      scripture_verified_at: null,
      scripture_verified_by: null,
    };

    const result = resolveVerificationAfterEdit(needsVerification, REFERENCE, {
      ...REFERENCE,
      scripture_text: "Changed again.",
    });

    expect(result.scripture_verification_status).toBe("verification_required");
  });
});

describe("markManuallyVerified", () => {
  it("records who verified and when", () => {
    const result = markManuallyVerified(
      "22222222-2222-2222-2222-222222222222",
      "2026-08-07T12:00:00.000Z",
    );

    expect(result).toEqual({
      scripture_verification_status: "manually_verified",
      scripture_verified_at: "2026-08-07T12:00:00.000Z",
      scripture_verified_by: "22222222-2222-2222-2222-222222222222",
    });
  });
});

describe("canManuallyVerify", () => {
  it("allows verification when a reference is present", () => {
    expect(canManuallyVerify(REFERENCE)).toBe(true);
  });

  it("refuses when there is no reference to verify", () => {
    // Confirming an empty field would record an assertion about nothing.
    expect(
      canManuallyVerify({ scripture_reference: null, scripture_text: null }),
    ).toBe(false);
    expect(
      canManuallyVerify({ scripture_reference: "   ", scripture_text: "x" }),
    ).toBe(false);
  });
});
