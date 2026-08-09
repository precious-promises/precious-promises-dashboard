import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentCard } from "@/components/content/content-card";
import { ContentFiltersBar } from "@/components/content/content-filters";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import type { ContentItem } from "@/lib/content/types";

/**
 * Rendered against real components with plain props — no Supabase mocking.
 */

const ITEM: ContentItem = {
  id: "11111111-1111-1111-1111-111111111111",
  owner_id: "22222222-2222-2222-2222-222222222222",
  title: "Promises of Peace",
  content_type: "youtube_short",
  topic: "Peace",
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises...",
  scripture_translation: "KJV",
  scripture_verification_status: "unverified",
  scripture_verified_at: null,
  scripture_verified_by: null,
  description: null,
  status: "draft",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-05T10:00:00.000Z",
};

describe("ContentCard", () => {
  it("shows the fields a library row needs", () => {
    render(
      <ul>
        <ContentCard item={ITEM} />
      </ul>,
    );

    expect(screen.getByText("Promises of Peace")).toBeInTheDocument();
    expect(screen.getByText("Peace")).toBeInTheDocument();
    expect(screen.getByText("YouTube Short")).toBeInTheDocument();
    expect(screen.getByText("2 Peter 1:4")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
    expect(screen.getByText(/Updated 5 Aug 2026/)).toBeInTheDocument();
  });

  it("links to the item's detail page", () => {
    render(
      <ul>
        <ContentCard item={ITEM} />
      </ul>,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/dashboard/content/${ITEM.id}`,
    );
  });

  it("labels a verified item as verified", () => {
    render(
      <ul>
        <ContentCard
          item={{
            ...ITEM,
            scripture_verification_status: "manually_verified",
            scripture_verified_at: "2026-08-06T10:00:00.000Z",
          }}
        />
      </ul>,
    );

    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("flags an item whose verification was invalidated", () => {
    render(
      <ul>
        <ContentCard
          item={{
            ...ITEM,
            scripture_verification_status: "verification_required",
          }}
        />
      </ul>,
    );

    expect(screen.getByText("Re-verification required")).toBeInTheDocument();
  });

  it("omits the Scripture row when there is no reference", () => {
    render(
      <ul>
        <ContentCard
          item={{ ...ITEM, scripture_reference: null, scripture_text: null }}
        />
      </ul>,
    );

    expect(screen.queryByText("KJV")).toBeNull();
  });
});

describe("ContentFiltersBar", () => {
  it("offers every filter as a labelled control", () => {
    render(<ContentFiltersBar filters={EMPTY_FILTERS} topics={["Peace"]} />);

    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Scripture")).toBeInTheDocument();
  });

  it("submits as a GET form, so a filtered view is shareable", () => {
    const { container } = render(
      <ContentFiltersBar filters={EMPTY_FILTERS} topics={[]} />,
    );

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/dashboard/content");
  });

  it("reflects the filters currently applied", () => {
    render(
      <ContentFiltersBar
        filters={{
          search: "peace",
          contentType: "tiktok_video",
          topic: "Provision",
          status: "archived",
          verification: "manually_verified",
        }}
        topics={["Provision"]}
      />,
    );

    expect(screen.getByLabelText("Search")).toHaveValue("peace");
    expect(screen.getByLabelText("Type")).toHaveValue("tiktok_video");
    expect(screen.getByLabelText("Status")).toHaveValue("archived");
  });
});

describe("content navigation", () => {
  it("renders them as real links", () => {
    render(<SidebarNav pathname="/dashboard/content" />);

    expect(
      screen.getByRole("link", { name: "Content Library" }),
    ).toHaveAttribute("href", "/dashboard/content");
    expect(screen.getByRole("link", { name: "Media Assets" })).toHaveAttribute(
      "href",
      "/dashboard/media",
    );
  });

  it("marks Content Library active on a nested content route", () => {
    render(<SidebarNav pathname="/dashboard/content/new" />);

    expect(
      screen.getByRole("link", { name: "Content Library" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not mark Dashboard active on a nested route", () => {
    // /dashboard as a prefix would otherwise own every page in the app.
    render(<SidebarNav pathname="/dashboard/content" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("still refuses to link the modules that remain unbuilt", () => {
    render(<SidebarNav pathname="/dashboard" />);

    for (const label of ["Publish Queue", "Analytics", "Settings"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });
});
