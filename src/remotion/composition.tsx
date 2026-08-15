import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";

import {
  RENDER_FPS,
  type RenderScene,
  type RenderSceneBody,
  type RenderVideoProps,
} from "./props";

/**
 * The Precious Promises composition.
 *
 * Renders exactly the scenes it is given, in order, with the text it is
 * given. Two rules are load-bearing:
 *
 * 1. **Scripture is never altered to fit.** When a passage is long the layout
 *    shrinks the type and lets the panel grow — the text itself is rendered
 *    verbatim, always with its reference and translation, in a visibly
 *    distinct treatment from everything generated or written by hand.
 * 2. **Nothing is invented.** Every string on screen arrived in the props,
 *    resolved server-side from stored records.
 */

const BRAND_BACKGROUND = "linear-gradient(160deg, #101726 0%, #1c2a45 100%)";
const SCRIPTURE_PANEL = "rgba(12, 18, 32, 0.82)";
const PROSE_COLOUR = "#f4f1ea";
const GOLD = "#d4af6a";

function fontSizeFor(text: string, base: number): number {
  // Longer passages get smaller type, bounded so nothing becomes unreadable.
  // The text is never truncated — layout adapts, Scripture does not.
  if (text.length > 700) return Math.round(base * 0.55);
  if (text.length > 400) return Math.round(base * 0.7);
  if (text.length > 220) return Math.round(base * 0.85);
  return base;
}

function alignFor(
  value: RenderScene["textAlign"],
): "left" | "center" | "right" {
  return value === "centre" ? "center" : value;
}

function justifyFor(value: RenderScene["textPosition"]): string {
  if (value === "top") return "flex-start";
  if (value === "bottom") return "flex-end";
  return "center";
}

function SceneBackground({ scene }: { scene: RenderScene }) {
  if (scene.backgroundUrl && scene.backgroundKind === "video") {
    return (
      <OffthreadVideo
        src={scene.backgroundUrl}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  if (scene.backgroundUrl && scene.backgroundKind === "image") {
    return (
      <Img
        src={scene.backgroundUrl}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return <AbsoluteFill style={{ background: BRAND_BACKGROUND }} />;
}

function SceneText({
  body,
  scene,
  width,
}: {
  body: RenderSceneBody;
  scene: RenderScene;
  width: number;
}) {
  if (body.kind === "none") {
    return null;
  }

  const baseSize = Math.round(width / 18);

  if (body.kind === "scripture") {
    // Scripture: a quoted serif panel that names itself. Structurally and
    // visually unlike prose, and impossible to render without its reference.
    const size = fontSizeFor(body.text, baseSize);
    return (
      <figure
        style={{
          margin: 0,
          maxWidth: "86%",
          background: SCRIPTURE_PANEL,
          border: `2px solid ${GOLD}`,
          borderRadius: 18,
          padding: `${Math.round(size * 0.9)}px ${Math.round(size * 1.1)}px`,
        }}
      >
        <div
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: Math.round(size * 0.42),
            letterSpacing: 3,
            textTransform: "uppercase",
            color: GOLD,
            textAlign: "center",
            marginBottom: Math.round(size * 0.5),
          }}
        >
          Scripture · {body.translation}
        </div>
        <blockquote
          style={{
            margin: 0,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: size,
            lineHeight: 1.35,
            color: PROSE_COLOUR,
            textAlign: alignFor(scene.textAlign),
          }}
        >
          {body.text}
        </blockquote>
        <figcaption
          style={{
            marginTop: Math.round(size * 0.6),
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            fontSize: Math.round(size * 0.55),
            color: GOLD,
            textAlign: "center",
          }}
        >
          — {body.reference}
        </figcaption>
      </figure>
    );
  }

  const size = fontSizeFor(body.text, baseSize);
  return (
    <div
      style={{
        maxWidth: "86%",
        fontFamily:
          "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif",
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.3,
        color: PROSE_COLOUR,
        textShadow: "0 2px 18px rgba(0,0,0,0.65)",
        textAlign: alignFor(scene.textAlign),
      }}
    >
      {body.text}
    </div>
  );
}

function SceneFrame({ scene, width }: { scene: RenderScene; width: number }) {
  const frame = useCurrentFrame();
  const fadeFrames = Math.round(RENDER_FPS * 0.4);

  const entrance =
    scene.transition === "none"
      ? 1
      : interpolate(frame, [0, fadeFrames], [0, 1], {
          extrapolateRight: "clamp",
        });

  const textEntrance =
    scene.textAnimation === "none"
      ? { opacity: 1, transform: "none" }
      : scene.textAnimation === "rise"
        ? {
            opacity: entrance,
            transform: `translateY(${interpolate(frame, [0, fadeFrames], [30, 0], { extrapolateRight: "clamp" })}px)`,
          }
        : scene.textAnimation === "scale_in"
          ? {
              opacity: entrance,
              transform: `scale(${interpolate(frame, [0, fadeFrames], [0.92, 1], { extrapolateRight: "clamp" })})`,
            }
          : { opacity: entrance, transform: "none" };

  return (
    <AbsoluteFill style={{ opacity: entrance }}>
      <SceneBackground scene={scene} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: justifyFor(scene.textPosition),
          padding: Math.round(width * 0.06),
        }}
      >
        <div style={textEntrance}>
          <SceneText body={scene.body} scene={scene} width={width} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function PreciousPromisesVideo(props: RenderVideoProps) {
  const width =
    props.aspectRatio === "16:9"
      ? 1920
      : props.aspectRatio === "1:1"
        ? 1080
        : 1080;

  const sequenced = props.scenes.reduce<
    { scene: RenderScene; from: number; durationInFrames: number }[]
  >((accumulated, scene) => {
    const previous = accumulated[accumulated.length - 1];
    const from = previous ? previous.from + previous.durationInFrames : 0;
    const durationInFrames = Math.max(
      Math.round(Math.max(scene.durationSeconds, 0.5) * RENDER_FPS),
      1,
    );
    accumulated.push({ scene, from, durationInFrames });
    return accumulated;
  }, []);

  return (
    <AbsoluteFill style={{ background: "#0a0f1a" }}>
      {props.voiceoverUrl ? <Audio src={props.voiceoverUrl} /> : null}

      {sequenced.map(({ scene, from, durationInFrames }) => (
        <Sequence
          key={scene.id}
          from={from}
          durationInFrames={durationInFrames}
        >
          <SceneFrame scene={scene} width={width} />
        </Sequence>
      ))}

      {props.brandLine ? (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 28,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily:
                "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif",
              fontSize: Math.round(width / 48),
              letterSpacing: 2,
              color: "rgba(244, 241, 234, 0.75)",
            }}
          >
            {props.brandLine}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
