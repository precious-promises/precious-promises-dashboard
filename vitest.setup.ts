// Registers the jest-dom matchers with Vitest's `expect`, and augments the
// matcher types so `toBeInTheDocument()` and friends typecheck.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount anything rendered by a test so suites cannot leak DOM into each
// other. Vitest runs without `globals`, so this is wired up explicitly.
afterEach(() => {
  cleanup();
});
