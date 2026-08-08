import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileProjectView } from "@/components/video/mobile-project-view";
import { PreviewPlayer } from "@/components/video/preview-player";
import { SceneFrame } from "@/components/video/scene-frame";
import { Timeline } from "@/components/video/timeline";
import type { ContentItem } from "@/lib/content/types";
import type { ScriptRevision } from "@/lib/scripts/types";
import { buildPreview, resolveScene } from "@/lib/video/preview";
import type {
  ProductionAsset,
  VideoProject,
  VideoScene,
} from "@/lib/video/types";

/**
 * Editor rendering, and the Scripture guarantee inside it.
 *
 * The rule under test: **a declaration or a prayer is never drawn as
 * Scripture.** In the preview that means no verse reference, no translation
 * and no `blockquote` — the marks a reader uses to tell a verse from prose.
 */

const ITEM: ContentItem = {
  id: "item-1",
  owner_id: "owner-1",
  title: "Precious promises",
  content_type: "youtube_short",
  topic: null,
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises",
  scripture_translation: "KJV",
  scripture_verification_status: "manually_verified",
  scripture_verified_at: "2026-08-08T00:00:00Z",
  scripture_verified_by: "owner-1",
  description: null,
  status: "draft",
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

const SCRIPT: ScriptRevision = {
  id: "rev-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  revision_number: 1,
  hook: "Listen.",
  explanation: "Written explanation.",
  declaration: "I declare in my own words.",
  prayer: "A prayer in my own words.",
  outro: "Until next time.",
  notes: "Private.",
  created_at: "2026-08-08T00:00:00Z",
};

function makeScene(overrides: Partial<VideoScene> = {}): VideoScene {
  return {
    id: "scene-1",
    owner_id: "owner-1",
    project_id: "project-1",
    scene_order: 1,
    scene_type: "explanation",
    text_source: "custom",
    text_content: "Some words.",
    media_asset_id: null,
    duration_seconds: 5,
    transition: "none",
    text_position: "centre",
    text_align: "centre",
    text_animation: "none",
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

const PROJECT: VideoProject = {
  id: "project-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  name: "Precious Promises — 2 Peter 1:4",
  aspect_ratio: "9:16",
  duration_estimate_seconds: 10,
  status: "draft",
  current_revision: 2,
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

describe("resolving a scene for preview", () => {
  it("reads Scripture from the content item, never from the scene", () => {
    const scene = makeScene({
      scene_type: "scripture",
      text_source: "content_scripture",
      text_content: null,
    });

    const { body } = resolveScene(scene, ITEM, SCRIPT);

    expect(body.kind).toBe("scripture");
    if (body.kind === "scripture") {
      expect(body.text).toBe(ITEM.scripture_text);
      expect(body.reference).toBe("2 Peter 1:4");
      expect(body.verificationStatus).toBe("manually_verified");
    }
  });

  it("says so plainly when the item has no verse, rather than substituting one", () => {
    const scene = makeScene({
      scene_type: "scripture",
      text_source: "content_scripture",
      text_content: null,
    });

    const { body, unavailable } = resolveScene(
      scene,
      { ...ITEM, scripture_reference: null, scripture_text: null },
      SCRIPT,
    );

    expect(unavailable).toMatch(/No Scripture recorded/i);
    if (body.kind === "scripture") {
      expect(body.text).toBeNull();
    }
  });

  it("resolves a declaration as prose, with no verse marks available", () => {
    const scene = makeScene({
      scene_type: "declaration",
      text_source: "script_revision",
      text_content: null,
    });

    const { body } = resolveScene(scene, ITEM, SCRIPT);

    expect(body.kind).toBe("prose");
    if (body.kind === "prose") {
      expect(body.sceneType).toBe("declaration");
      expect(body.text).toBe(SCRIPT.declaration);
      expect(body.referenced).toBe(true);
      // The prose shape carries no reference or translation at all, so there
      // is nothing a renderer could mistake for a citation.
      expect(body).not.toHaveProperty("reference");
      expect(body).not.toHaveProperty("translation");
    }
  });

  it("reports a prose scene with nothing written yet", () => {
    const { unavailable } = resolveScene(
      makeScene({ text_content: "   " }),
      ITEM,
      SCRIPT,
    );

    expect(unavailable).toMatch(/No words written yet/i);
  });

  it("builds the whole composition in order with start times", () => {
    const preview = buildPreview(
      [
        makeScene({ id: "b", scene_order: 2, duration_seconds: 4 }),
        makeScene({ id: "a", scene_order: 1, duration_seconds: 3 }),
      ],
      ITEM,
      SCRIPT,
    );

    expect(preview.map((entry) => entry.scene.id)).toEqual(["a", "b"]);
    expect(preview.map((entry) => entry.startsAt)).toEqual([0, 3]);
  });
});

describe("SceneFrame", () => {
  it("draws Scripture as a quotation with its reference and translation", () => {
    const preview = buildPreview(
      [
        makeScene({
          scene_type: "scripture",
          text_source: "content_scripture",
          text_content: null,
        }),
      ],
      ITEM,
      SCRIPT,
    );

    const { container } = render(
      <SceneFrame
        preview={preview[0]!}
        aspectRatio="9:16"
        hasBackground={false}
      />,
    );

    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(screen.getByText("2 Peter 1:4")).toBeInTheDocument();
    expect(screen.getByText("KJV")).toBeInTheDocument();
  });

  it("draws a declaration as plain prose, labelled as a declaration", () => {
    const preview = buildPreview(
      [
        makeScene({
          scene_type: "declaration",
          text_source: "custom",
          text_content: "I declare in my own words.",
        }),
      ],
      ITEM,
      SCRIPT,
    );

    const { container } = render(
      <SceneFrame
        preview={preview[0]!}
        aspectRatio="9:16"
        hasBackground={false}
      />,
    );

    // No verse marks anywhere: not a quotation, not a citation.
    expect(container.querySelector("blockquote")).toBeNull();
    expect(container.querySelector("figcaption")).toBeNull();
    expect(screen.queryByText("2 Peter 1:4")).toBeNull();
    expect(screen.getByText("Declaration")).toBeInTheDocument();
  });

  it("draws a prayer as prose too", () => {
    const preview = buildPreview(
      [
        makeScene({
          scene_type: "prayer",
          text_source: "script_revision",
          text_content: null,
        }),
      ],
      ITEM,
      SCRIPT,
    );

    const { container } = render(
      <SceneFrame
        preview={preview[0]!}
        aspectRatio="9:16"
        hasBackground={false}
      />,
    );

    expect(container.querySelector("blockquote")).toBeNull();
    expect(screen.getByText(SCRIPT.prayer!)).toBeInTheDocument();
  });

  it("takes the aspect ratio it is given", () => {
    const preview = buildPreview([makeScene()], ITEM, SCRIPT);

    for (const [ratio, css] of [
      ["9:16", "9 / 16"],
      ["16:9", "16 / 9"],
      ["1:1", "1 / 1"],
    ] as const) {
      const { getByTestId, unmount } = render(
        <SceneFrame
          preview={preview[0]!}
          aspectRatio={ratio}
          hasBackground={false}
        />,
      );

      expect(getByTestId("scene-frame").style.aspectRatio).toBe(css);
      unmount();
    }
  });

  it("exposes no editable control", () => {
    // A preview must not become a route to altering a verse.
    const preview = buildPreview(
      [
        makeScene({
          scene_type: "scripture",
          text_source: "content_scripture",
          text_content: null,
        }),
      ],
      ITEM,
      SCRIPT,
    );

    const { container } = render(
      <SceneFrame
        preview={preview[0]!}
        aspectRatio="1:1"
        hasBackground={false}
      />,
    );

    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(container.querySelectorAll("[contenteditable]")).toHaveLength(0);
  });
});

describe("PreviewPlayer", () => {
  const scenes = [
    makeScene({ id: "a", scene_order: 1, duration_seconds: 3 }),
    makeScene({ id: "b", scene_order: 2, duration_seconds: 4 }),
  ];

  it("says it is not a render", () => {
    render(
      <PreviewPlayer
        scenes={buildPreview(scenes, ITEM, SCRIPT)}
        aspectRatio="9:16"
        backgroundSceneIds={[]}
      />,
    );

    expect(
      screen.getByText(/Nothing is rendered, encoded or played back as audio/i),
    ).toBeInTheDocument();
  });

  it("offers play and restart controls", () => {
    render(
      <PreviewPlayer
        scenes={buildPreview(scenes, ITEM, SCRIPT)}
        aspectRatio="9:16"
        backgroundSceneIds={[]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /play preview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /restart/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Scene 1 of 2/)).toBeInTheDocument();
  });

  it("asks for a scene rather than showing an empty frame", () => {
    render(
      <PreviewPlayer scenes={[]} aspectRatio="1:1" backgroundSceneIds={[]} />,
    );

    expect(
      screen.getByText(/Add a scene to see the preview/i),
    ).toBeInTheDocument();
  });
});

describe("Timeline", () => {
  const scenes = [
    makeScene({ id: "a", scene_order: 1, duration_seconds: 3 }),
    makeScene({
      id: "b",
      scene_order: 2,
      scene_type: "scripture",
      text_source: "content_scripture",
      text_content: null,
      duration_seconds: 6,
    }),
  ];

  it("links each scene to its own editor URL", () => {
    render(
      <Timeline
        projectId="project-1"
        scenes={scenes}
        assets={[]}
        selectedSceneId="a"
      />,
    );

    expect(
      screen.getByRole("link", { name: /1\. Explanation/ }),
    ).toHaveAttribute("href", "/dashboard/video/project-1?scene=a");
    expect(screen.getByRole("link", { name: /2\. Scripture/ })).toHaveAttribute(
      "href",
      "/dashboard/video/project-1?scene=b",
    );
  });

  it("reports the estimated total", () => {
    render(
      <Timeline
        projectId="project-1"
        scenes={scenes}
        assets={[]}
        selectedSceneId={null}
      />,
    );

    expect(screen.getByText(/2 scenes · 0:09 estimated/)).toBeInTheDocument();
  });

  it("shows empty audio and caption lanes rather than hiding them", () => {
    render(
      <Timeline
        projectId="project-1"
        scenes={scenes}
        assets={[]}
        selectedSceneId={null}
      />,
    );

    expect(screen.getByText("Background audio")).toBeInTheDocument();
    expect(screen.getByText("Voiceover")).toBeInTheDocument();
    expect(screen.getByText("Captions / subtitles")).toBeInTheDocument();
    expect(screen.getAllByText("Empty")).toHaveLength(3);
  });

  it("marks a filled lane with where it starts", () => {
    const asset: ProductionAsset = {
      id: "pa-1",
      owner_id: "owner-1",
      project_id: "project-1",
      media_asset_id: "media-1",
      role: "voiceover",
      starts_at_seconds: 2,
      notes: null,
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    };

    render(
      <Timeline
        projectId="project-1"
        scenes={scenes}
        assets={[asset]}
        selectedSceneId={null}
      />,
    );

    expect(screen.getByText(/Attached · starts at 0:02/)).toBeInTheDocument();
  });

  it("says so when there are no scenes", () => {
    render(
      <Timeline
        projectId="project-1"
        scenes={[]}
        assets={[]}
        selectedSceneId={null}
      />,
    );

    expect(screen.getByText(/No scenes yet/i)).toBeInTheDocument();
  });
});

describe("MobileProjectView", () => {
  it("is a management view, and says the editor needs a wider screen", () => {
    render(
      <MobileProjectView
        project={PROJECT}
        scenes={[makeScene()]}
        assets={[]}
      />,
    );

    expect(screen.getByText(/Management view/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The full editor needs a wider screen/i),
    ).toBeInTheDocument();
  });

  it("offers no editing controls at all", () => {
    // A shrunken editor would look usable and would not be. This view reads.
    const { container } = render(
      <MobileProjectView
        project={PROJECT}
        scenes={[makeScene()]}
        assets={[]}
      />,
    );

    expect(container.querySelectorAll("form")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("textarea")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });

  it("reports the composition from real values", () => {
    render(
      <MobileProjectView
        project={PROJECT}
        scenes={[makeScene({ duration_seconds: 10 })]}
        assets={[]}
      />,
    );

    expect(screen.getByText("9:16 — Vertical")).toBeInTheDocument();
    expect(screen.getByText("0:10")).toBeInTheDocument();
    expect(screen.getByText("Scenes (1)")).toBeInTheDocument();
  });
});
