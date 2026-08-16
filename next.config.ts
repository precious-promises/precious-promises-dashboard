import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Remotion packages load platform-specific native compositors at
  // runtime. Bundling them makes the build resolve every platform's binary,
  // including ones that are deliberately not installed here — so they stay
  // external and are required from node_modules by the server at runtime.
  // They are only ever loaded lazily inside the render worker path, and only
  // when RENDER_ENABLED is true.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer"],
};

export default nextConfig;
