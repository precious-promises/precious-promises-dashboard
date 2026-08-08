// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  approvalBlockers,
  approvalValidity,
  APPROVAL_INVALIDATED_REASON,
  canApproveVariant,
  canTransitionReview,
  INVALIDATED_REVIEW_STATE,
  invalidationUpdate,
  requiresImage,
  requiresVideo,
  type ApprovalContext,
} from "@/lib/approvals/rules";
import { CONTENT_TYPES } from "@/lib/content/types";
import { REVIEW_STATES } from "@/lib/variants/types";

/**
 * What makes a variant approvable, and what takes approval away.
 *
 * The highest-stakes rule here is the Scripture one: an approved post carrying
 * a verse must carry a verse somebody checked against a source.
 */

function context(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    variant: {
      review_state: "ready_for_review",
      title: "A title",
      caption: "A caption",
      description: null,
    },
    item: {
      status: "draft",
      content_type: "youtube_short",
      scripture_reference: "2 Peter 1:4",
      scripture_text: "…",
      scripture_verification_status: "manually_verified",
    },
    hasVideo: true,
    mediaCount: 0,
    ...overrides,
  };
}

describe("approval eligibility", () => {
  it("approves a complete, verified, ready variant", () => {
    expect(canApproveVariant(context())).toBe(true);
    expect(approvalBlockers(context())).toEqual([]);
  });

  it("refuses a variant that is not ready for review", () => {
    for (const state of ["draft", "approved", "rejected"] as const) {
      const blockers = approvalBlockers(
        context({
          variant: { ...context().variant, review_state: state },
        }),
      );

      expect(blockers.map((blocker) => blocker.code)).toContain(
        "not_awaiting_review",
      );
    }
  });

  it("refuses when Scripture is not manually verified", () => {
    for (const status of ["unverified", "verification_required"] as const) {
      const blockers = approvalBlockers(
        context({
          item: {
            ...context().item,
            scripture_verification_status: status,
          },
        }),
      );

      expect(
        blockers.map((blocker) => blocker.code),
        status,
      ).toContain("scripture_not_verified");
    }
  });

  it("does not demand verification of an item with no Scripture", () => {
    const blockers = approvalBlockers(
      context({
        item: {
          ...context().item,
          scripture_reference: null,
          scripture_text: null,
          scripture_verification_status: "unverified",
        },
      }),
    );

    expect(blockers.map((blocker) => blocker.code)).not.toContain(
      "scripture_not_verified",
    );
  });

  it("refuses an empty variant", () => {
    const blockers = approvalBlockers(
      context({
        variant: {
          review_state: "ready_for_review",
          title: null,
          caption: "   ",
          description: null,
        },
      }),
    );

    expect(blockers.map((blocker) => blocker.code)).toContain("variant_empty");
  });

  it("refuses an archived item", () => {
    const blockers = approvalBlockers(
      context({ item: { ...context().item, status: "archived" } }),
    );

    expect(blockers.map((blocker) => blocker.code)).toContain("item_archived");
  });

  it("refuses a video content type with no composition", () => {
    const blockers = approvalBlockers(context({ hasVideo: false }));

    expect(blockers.map((blocker) => blocker.code)).toContain("missing_video");
  });

  it("refuses an image content type with no media attached", () => {
    const blockers = approvalBlockers(
      context({
        item: { ...context().item, content_type: "instagram_image" },
        hasVideo: false,
        mediaCount: 0,
      }),
    );

    expect(blockers.map((blocker) => blocker.code)).toContain("missing_image");
    expect(blockers.map((blocker) => blocker.code)).not.toContain(
      "missing_video",
    );
  });

  it("returns every blocker rather than only the first", () => {
    const blockers = approvalBlockers(
      context({
        variant: {
          review_state: "draft",
          title: null,
          caption: null,
          description: null,
        },
        item: {
          ...context().item,
          scripture_verification_status: "unverified",
        },
        hasVideo: false,
      }),
    );

    expect(blockers.length).toBeGreaterThanOrEqual(4);
  });

  it("classifies every content type as needing a video or an image", () => {
    for (const type of CONTENT_TYPES) {
      expect(
        requiresVideo(type) || requiresImage(type),
        `${type} must have a production requirement`,
      ).toBe(true);
    }
  });

  it("treats still images and carousels as image content", () => {
    expect(requiresImage("instagram_image")).toBe(true);
    expect(requiresImage("instagram_carousel")).toBe(true);
    expect(requiresVideo("instagram_image")).toBe(false);
  });
});

describe("approval validity", () => {
  it("reports a variant that was never approved", () => {
    expect(
      approvalValidity({ review_state: "draft", approval_hash: null }, true),
    ).toBe("not_approved");
  });

  it("reports a matching approval as valid", () => {
    expect(
      approvalValidity({ review_state: "approved", approval_hash: "a" }, true),
    ).toBe("valid");
  });

  it("reports an approval whose content moved as invalidated", () => {
    expect(
      approvalValidity({ review_state: "approved", approval_hash: "a" }, false),
    ).toBe("invalidated");
  });

  it("treats an approved row with no stored hash as not approved", () => {
    // The database refuses this combination; the domain refuses to trust it.
    expect(
      approvalValidity({ review_state: "approved", approval_hash: null }, true),
    ).toBe("not_approved");
  });
});

describe("invalidation", () => {
  it("falls back to ready for review, not draft", () => {
    // The wording is still finished work awaiting a decision. What changed is
    // that the decision no longer applies.
    expect(INVALIDATED_REVIEW_STATE).toBe("ready_for_review");
    expect(invalidationUpdate().review_state).toBe("ready_for_review");
  });

  it("clears every piece of approval metadata", () => {
    const update = invalidationUpdate();

    expect(update.approved_at).toBeNull();
    expect(update.approved_by).toBeNull();
    expect(update.approval_hash).toBeNull();
  });

  it("has a reason that says what happened", () => {
    expect(APPROVAL_INVALIDATED_REASON).toMatch(/content change/i);
  });
});

describe("review state machine", () => {
  it("only reaches approved from ready for review", () => {
    for (const from of REVIEW_STATES) {
      expect(canTransitionReview(from, "approved"), from).toBe(
        from === "ready_for_review",
      );
    }
  });

  it("cannot approve a draft in one step", () => {
    expect(canTransitionReview("draft", "approved")).toBe(false);
  });

  it("sends a rejected variant back to draft, not straight to review", () => {
    expect(canTransitionReview("rejected", "draft")).toBe(true);
    expect(canTransitionReview("rejected", "ready_for_review")).toBe(false);
    expect(canTransitionReview("rejected", "approved")).toBe(false);
  });

  it("lets an approved variant fall back when its content changes", () => {
    expect(canTransitionReview("approved", "ready_for_review")).toBe(true);
  });

  it("never allows a state to transition to itself", () => {
    for (const state of REVIEW_STATES) {
      expect(canTransitionReview(state, state), state).toBe(false);
    }
  });
});
