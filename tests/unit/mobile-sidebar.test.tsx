import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { DASHBOARD_PATH } from "@/lib/auth/routes";

describe("MobileSidebar", () => {
  it("opens an opaque drawer above the page and restores scrolling when closed", async () => {
    const user = userEvent.setup();
    render(<MobileSidebar pathname={DASHBOARD_PATH} />);

    await user.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    const drawer = screen.getByRole("dialog", {
      name: "Dashboard navigation",
    });

    expect(drawer).toHaveClass("bg-[#060a15]");
    expect(drawer).not.toHaveClass("pp-glass");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(
      screen.getByRole("button", { name: "Close navigation menu" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Dashboard navigation" }),
    ).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
