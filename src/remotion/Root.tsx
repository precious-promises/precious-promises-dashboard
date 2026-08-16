import React from "react";
import { Composition } from "remotion";

import { PreciousPromisesVideo } from "./composition";
import {
  ASPECT_DIMENSIONS,
  DEFAULT_RENDER_PROPS,
  RENDER_COMPOSITION_ID,
  RENDER_FPS,
  totalDurationInFrames,
  type RenderVideoProps,
} from "./props";

/**
 * One composition, parameterised entirely by input props.
 *
 * Dimensions and duration are computed from the props at render selection
 * time (`calculateMetadata`), so aspect ratio and length are explicit project
 * settings rather than anything inferred.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={RENDER_COMPOSITION_ID}
      component={PreciousPromisesVideo}
      defaultProps={DEFAULT_RENDER_PROPS}
      fps={RENDER_FPS}
      width={1080}
      height={1920}
      durationInFrames={RENDER_FPS * 5}
      calculateMetadata={({ props }: { props: RenderVideoProps }) => {
        const dims =
          ASPECT_DIMENSIONS[props.aspectRatio] ?? ASPECT_DIMENSIONS["9:16"];
        return {
          durationInFrames: totalDurationInFrames(props.scenes),
          width: dims.width,
          height: dims.height,
          fps: RENDER_FPS,
        };
      }}
    />
  );
};
