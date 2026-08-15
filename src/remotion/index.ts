import { registerRoot } from "remotion";

import { RemotionRoot } from "./Root";

/**
 * The Remotion entry point, bundled by `@remotion/bundler` at render time.
 * Deliberately outside the Next.js app tree: the two bundlers never meet.
 */
registerRoot(RemotionRoot);
