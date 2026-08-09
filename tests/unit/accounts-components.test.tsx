import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountCard } from "@/components/accounts/account-card";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import type { SocialAccount } from "@/lib/accounts/types";

/**
 * The Connected Accounts surface.
 *
 * The property that matters most is negative: nothing on this page has ever
 * seen a token, and there is no field on the props it takes that could hold
 * one.
 */

const ACCOUNT: SocialAccount = {
  id: "account-1",
  owner_id: "owner-1",
  platform: "youtube",
  provider_account_id: "UC_channel",
  display_name: null,
  handle: "@promises",
  channel_id: "UC_channel",
  channel_title: "Precious Promises",
  status: "connected",
  granted_scopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ],
  connected_at: "2026-08-09T10:00:00.000Z",
  disconnected_at: null,
  token_expires_at: "2026-08-09T11:00:00.000Z",
  created_at: "2026-08-09T10:00:00.000Z",
  updated_at: "2026-08-09T10:00:00.000Z",
};

async function noop(): Promise<void> {}

describe("AccountCard", () => {
  it("names the connected channel and its state", () => {
    render(<AccountCard account={ACCOUNT} disconnectAction={noop} />);

    expect(screen.getByText("Precious Promises")).toBeInTheDocument();
    expect(screen.getByText("@promises")).toBeInTheDocument();
    expect(
      screen.getByText(/This channel can be published to/),
    ).toBeInTheDocument();
  });

  it("shows the permissions actually granted, in short form", () => {
    render(<AccountCard account={ACCOUNT} disconnectAction={noop} />);

    expect(screen.getByText("youtube.upload")).toBeInTheDocument();
    expect(screen.getByText("youtube.readonly")).toBeInTheDocument();
  });

  it("renders no credential of any kind", () => {
    const { container } = render(
      <AccountCard account={ACCOUNT} disconnectAction={noop} />,
    );

    for (const forbidden of ["ya29", "Bearer", "refresh", "client_secret"]) {
      expect(container.textContent, forbidden).not.toContain(forbidden);
    }
  });

  it("offers disconnection as a form, so it needs no JavaScript", () => {
    const { container } = render(
      <AccountCard account={ACCOUNT} disconnectAction={noop} />,
    );

    expect(container.querySelector("form")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Disconnect and revoke/ }),
    ).toBeInTheDocument();
  });

  it("explains a broken authorisation rather than hiding it", () => {
    render(
      <AccountCard
        account={{ ...ACCOUNT, status: "needs_reconnect" }}
        disconnectAction={noop}
      />,
    );

    expect(screen.getByText("Reconnection needed")).toBeInTheDocument();
    expect(
      screen.getByText(/rejected the stored authorisation/i),
    ).toBeVisible();
  });

  it("offers no disconnect for an account that is already disconnected", () => {
    render(
      <AccountCard
        account={{ ...ACCOUNT, status: "disconnected" }}
        disconnectAction={noop}
      />,
    );

    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull();
  });
});

describe("Connected Accounts in the sidebar", () => {
  it("is a real link now that the route exists", () => {
    render(<SidebarNav pathname="/dashboard/accounts" />);

    expect(
      screen.getByRole("link", { name: "Connected Accounts" }),
    ).toHaveAttribute("href", "/dashboard/accounts");
  });

  it("is marked as the current page when it is open", () => {
    render(<SidebarNav pathname="/dashboard/accounts" />);

    expect(
      screen.getByRole("link", { name: "Connected Accounts" }),
    ).toHaveAttribute("aria-current", "page");
  });
});
