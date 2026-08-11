import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { allNavItems } from "@/config/navigation";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import type { ContentItem } from "@/lib/content/types";

/**
 * Scripture safety.
 *
 * The rule these protect: **user-written prose must never be presented as
 * Scripture, and no writing surface may alter a verse.** Both failures would
 * be invisible in a screenshot and permanent once published.
 */

const ITEM: Pick<
  ContentItem,
  | "scripture_reference"
  | "scripture_text"
  | "scripture_translation"
  | "scripture_verification_status"
> = {
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises...",
  scripture_translation: "KJV",
  scripture_verification_status: "manually_verified",
};

describe("ScriptureReadOnly", () => {
  it("renders the verse and reference exactly as stored", () => {
    render(<ScriptureReadOnly item={ITEM} />);

    expect(screen.getByText(ITEM.scripture_text!)).toBeInTheDocument();
    expect(screen.getByText("2 Peter 1:4")).toBeInTheDocument();
    expect(screen.getByText("KJV")).toBeInTheDocument();
  });

  it("exposes no editable control", () => {
    // A writing surface must not become a route to altering a verse.
    const { container } = render(<ScriptureReadOnly item={ITEM} />);

    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(container.querySelectorAll("[contenteditable]")).toHaveLength(0);
    expect(container.querySelectorAll("form")).toHaveLength(0);
  });

  it("says where Scripture is edited instead", () => {
    render(<ScriptureReadOnly item={ITEM} />);

    expect(screen.getByText(/read-only here/i)).toBeInTheDocument();
  });

  it("marks up the verse as a quotation with its reference", () => {
    const { container } = render(<ScriptureReadOnly item={ITEM} />);

    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("figure")).not.toBeNull();
  });

  it("says plainly when no Scripture is recorded", () => {
    render(
      <ScriptureReadOnly
        item={{ ...ITEM, scripture_reference: null, scripture_text: null }}
      />,
    );

    expect(screen.getByText(/No Scripture recorded/i)).toBeInTheDocument();
  });
});

/**
 * A static scan for the wording failure: prose the owner wrote being labelled
 * as Scripture, or quoted as though it were a verse.
 */
// process.cwd() rather than import.meta.url: this suite runs under jsdom,
// where import.meta.url is not a file URL.
const SRC_ROOT = join(process.cwd(), "src");

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx$/.test(entry))
    .map((entry) => join(SRC_ROOT, entry));
}

describe("declarations and prayers are never presented as Scripture", () => {
  it("renders no declaration or prayer through the Scripture component", () => {
    // ScriptureReadOnly is the only component that presents text as a verse.
    // Nothing may pass a declaration or prayer into it.
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!contents.includes("<ScriptureReadOnly")) {
        continue;
      }

      const usages = contents.match(/<ScriptureReadOnly[\s\S]*?\/>/g) ?? [];
      for (const usage of usages) {
        expect(
          usage,
          `${file} passes prose into the Scripture panel`,
        ).not.toMatch(/declaration|prayer|hook|outro/i);
      }
    }
  });

  it("keeps the script sections labelled as the owner's own words", () => {
    const hints = readFileSync(join(SRC_ROOT, "lib/scripts/types.ts"), "utf8");

    // The declaration and prayer hints must say what they are not.
    expect(hints).toMatch(/declaration[\s\S]*?not Scripture/i);
    expect(hints).toMatch(/prayer[\s\S]*?not Scripture/i);
  });
});

describe("navigation after Stage 8", () => {
  it("activates exactly the thirteen built areas", () => {
    const available = allNavItems().filter(
      (item) => item.status === "available",
    );

    expect(available.map((item) => item.label)).toEqual([
      "Dashboard",
      "Production Board",
      "Content Library",
      "Scripture Studio",
      "Script Studio",
      "Caption Studio",
      "Video Creation Studio",
      "Media Assets",
      "Google Drive Browser",
      "Calendar",
      "Approval Queue",
      "Publish Queue",
      "Connected Accounts",
    ]);
  });

  it("leaves the remaining 6 areas unbuilt and unlinkable", () => {
    const comingSoon = allNavItems().filter(
      (item) => item.status === "coming-soon",
    );

    expect(comingSoon).toHaveLength(6);
    for (const item of comingSoon) {
      expect(item.href, `${item.label} must not be linkable`).toBeUndefined();
    }
  });

  it("renders the studios as real links", () => {
    render(<SidebarNav pathname="/dashboard/scripture" />);

    expect(
      screen.getByRole("link", { name: "Scripture Studio" }),
    ).toHaveAttribute("href", "/dashboard/scripture");
    expect(screen.getByRole("link", { name: "Script Studio" })).toHaveAttribute(
      "href",
      "/dashboard/scripts",
    );
    expect(
      screen.getByRole("link", { name: "Caption Studio" }),
    ).toHaveAttribute("href", "/dashboard/captions");
    expect(
      screen.getByRole("link", { name: "Video Creation Studio" }),
    ).toHaveAttribute("href", "/dashboard/video");
  });

  it("still refuses to link publishing modules", () => {
    render(<SidebarNav pathname="/dashboard" />);

    for (const label of ["YouTube & Playlists", "Growth Centre", "Analytics"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });
});
