import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

/**
 * Stage 0 asserted the placeholder heading "Precious Promises Dashboard".
 * Stage 1 replaced that placeholder with the real public landing page, whose
 * approved wording is "Precious Promises" over "Content & Growth Dashboard",
 * so this expectation moved with it.
 *
 * `public-pages.test.tsx` carries the fuller checks, including what this page
 * must not disclose.
 */
describe("HomePage", () => {
  it("renders the Precious Promises heading", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Precious Promises" }),
    ).toBeInTheDocument();
  });

  it("names the product beneath the heading", () => {
    render(<HomePage />);

    expect(screen.getByText("Content & Growth Dashboard")).toBeInTheDocument();
  });
});
