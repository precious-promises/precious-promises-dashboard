import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import LoginPage from "@/app/login/page";
import { OWNER_NAME, OWNER_ROLE } from "@/config/owner";
import { allNavItems } from "@/config/navigation";
import { LOGIN_PATH } from "@/lib/auth/routes";

/**
 * Both of these pages are reachable without a session, so the interesting
 * assertions are about what they must *not* contain.
 */

describe("public homepage", () => {
  it("identifies the product", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Precious Promises" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Content & Growth Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Private administration platform."),
    ).toBeInTheDocument();
  });

  it("offers a sign-in route", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: /Admin Sign In/ })).toHaveAttribute(
      "href",
      LOGIN_PATH,
    );
  });

  it("does not expose the owner's identity", () => {
    render(<HomePage />);

    expect(screen.queryByText(OWNER_NAME)).toBeNull();
    expect(screen.queryByText(OWNER_ROLE)).toBeNull();
  });

  it("does not expose the internal dashboard structure", () => {
    render(<HomePage />);

    // Module names tell an anonymous visitor what the product does internally.
    for (const item of allNavItems()) {
      if (item.label === "Dashboard") {
        continue;
      }
      expect(
        screen.queryByText(item.label),
        `${item.label} must not appear publicly`,
      ).toBeNull();
    }
  });

  it("shows no metrics, counts or platform status", () => {
    const { container } = render(<HomePage />);

    expect(container.textContent).not.toContain("Not connected");
    expect(container.textContent).not.toContain("Awaiting Approval");
  });

  it("offers no sign-up route", () => {
    render(<HomePage />);

    expect(
      screen.queryByRole("link", { name: /sign up|register|create account/i }),
    ).toBeNull();
  });
});

describe("login page", () => {
  it("identifies the private portal", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Precious Promises" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Content & Growth Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Private administration portal"),
    ).toBeInTheDocument();
  });

  it("renders the sign-in fields", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("offers no sign-up or social login and provides password recovery", () => {
    render(<LoginPage />);

    expect(
      screen.queryByRole("link", { name: /sign up|register|create account/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /google|facebook|apple|github/i }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", "/login/forgot-password");
  });

  it("does not expose the owner's identity to anonymous visitors", () => {
    render(<LoginPage />);

    expect(screen.queryByText(OWNER_NAME)).toBeNull();
    expect(screen.queryByText(OWNER_ROLE)).toBeNull();
  });
});
