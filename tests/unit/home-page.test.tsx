import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the Precious Promises Dashboard heading", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Precious Promises Dashboard",
      }),
    ).toBeInTheDocument();
  });
});
