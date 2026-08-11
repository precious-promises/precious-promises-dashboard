import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { YouTubeMetadataForm } from "@/components/youtube/metadata-form";
import type {
  YouTubePlaylist,
  YouTubeVideoMetadata,
} from "@/lib/youtube/types";

/**
 * The YouTube settings form.
 *
 * Three refusals are being defended here, and all three are choices this
 * product made rather than limitations it hit:
 *
 * - The made-for-kids declaration has no pre-selected answer.
 * - Public is not offered, because YouTube would override it.
 * - A playlist is chosen from the channel, never typed.
 */

// The form calls a Server Action. Mocking the module keeps this a test of the
// rendered controls rather than of Next's action plumbing.
vi.mock("@/app/dashboard/captions/actions", () => ({
  saveYouTubeMetadata: vi.fn(),
}));

const PLAYLISTS: YouTubePlaylist[] = [
  { id: "PL_healing", title: "Healing Scriptures", itemCount: 12 },
  { id: "PL_peace", title: "Peace and Sleep Scriptures", itemCount: null },
];

function metadata(
  overrides: Partial<YouTubeVideoMetadata> = {},
): YouTubeVideoMetadata {
  return {
    id: "meta-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    category_id: null,
    default_language: null,
    default_audio_language: null,
    tags: [],
    privacy_status: "private",
    self_declared_made_for_kids: null,
    contains_synthetic_media: false,
    notify_subscribers: true,
    playlist_id: null,
    thumbnail_media_asset_id: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function renderForm(
  props: Partial<React.ComponentProps<typeof YouTubeMetadataForm>> = {},
) {
  return render(
    <YouTubeMetadataForm
      platformVariantId="variant-1"
      contentItemId="item-1"
      metadata={null}
      imageAssets={[]}
      playlists={[]}
      playlistsReason={null}
      {...props}
    />,
  );
}

describe("the made-for-kids declaration", () => {
  it("starts unanswered, with no option pre-selected as an answer", () => {
    renderForm();

    const unanswered = screen.getByRole("radio", {
      name: /Not answered yet/,
    }) as HTMLInputElement;

    expect(unanswered.checked).toBe(true);
    expect(unanswered.value).toBe("");
  });

  it("says plainly that this dashboard will not answer it", () => {
    renderForm();

    expect(screen.getByText(/will not answer it for you/i)).toBeVisible();
  });

  it("reflects a saved answer", () => {
    renderForm({ metadata: metadata({ self_declared_made_for_kids: false }) });

    expect(
      (
        screen.getByRole("radio", {
          name: /not made for children/i,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});

describe("privacy", () => {
  it("offers private and unlisted only", () => {
    renderForm();

    const select = screen.getByLabelText("Privacy");
    const values = Array.from(
      select.querySelectorAll("option"),
      (option) => option.value,
    );

    expect(values).toEqual(["private", "unlisted"]);
  });

  it("explains why public is absent", () => {
    renderForm();

    expect(screen.getByText(/compliance audit/i)).toBeVisible();
  });
});

describe("playlists", () => {
  it("offers only playlists the channel actually returned", () => {
    renderForm({ playlists: PLAYLISTS });

    const select = screen.getByLabelText("Playlist");
    const values = Array.from(
      select.querySelectorAll("option"),
      (option) => option.value,
    );

    expect(values).toEqual(["", "PL_healing", "PL_peace"]);
  });

  it("is not a free-text field", () => {
    // A typed id would let a typo become a publish that fails at the last
    // step, or a plausible id belonging to somebody else.
    renderForm({ playlists: PLAYLISTS });

    expect(screen.getByLabelText("Playlist").tagName).toBe("SELECT");
  });

  it("is disabled, with the reason shown, when there are none", () => {
    renderForm({
      playlistsReason: "No YouTube channel is connected, so there are none.",
    });

    expect(screen.getByLabelText("Playlist")).toBeDisabled();
    expect(screen.getByText(/No YouTube channel is connected/)).toBeVisible();
  });

  it("keeps a saved playlist visible even when the channel no longer lists it", () => {
    // Dropping it would silently clear the owner's choice on the next save.
    renderForm({
      playlists: PLAYLISTS,
      metadata: metadata({ playlist_id: "PL_removed" }),
    });

    expect(screen.getByText(/no longer on this channel/)).toBeInTheDocument();
  });
});

describe("what the form warns about", () => {
  it("says saving withdraws approval", () => {
    renderForm();

    expect(screen.getByText(/withdraws any approval/i)).toBeVisible();
  });

  it("says YouTube decides what is a Short", () => {
    renderForm();

    expect(screen.getByText(/YouTube decides what is a Short/i)).toBeVisible();
  });

  it("renders no credential anywhere", () => {
    const { container } = renderForm({ playlists: PLAYLISTS });

    for (const forbidden of ["ya29", "Bearer", "client_secret"]) {
      expect(container.textContent, forbidden).not.toContain(forbidden);
    }
  });
});
