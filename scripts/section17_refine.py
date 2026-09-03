from pathlib import Path

path = Path("src/app/dashboard/accounts/page.tsx")
text = path.read_text()

marker = '''};

/**
 * Connected Accounts.'''
helper = '''};

function OverviewMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

/**
 * Connected Accounts.'''
if marker not in text:
    raise SystemExit("helper marker not found")
text = text.replace(marker, helper, 1)

analytics_marker = '''  const analytics = await loadAnalyticsOverview();

  return ('''
analytics_insert = '''  const analytics = await loadAnalyticsOverview();
  const connectedAccountCount = accounts.filter(
    (account) => account.status === "connected",
  ).length;
  const configuredIntegrationCount = [
    canConnect,
    canConnectInstagram,
    canConnectDrive,
    canConnectTikTok,
  ].filter(Boolean).length;
  const publishingConnectionCount = [
    youtubeAccounts,
    instagramAccounts,
    tiktokAccounts,
  ].filter((group) =>
    group.some((account) => account.status === "connected"),
  ).length;
  const analyticsAuthorisedCount = analytics.readiness.filter(
    (entry) => entry.accountConnected && entry.analyticsAuthorised,
  ).length;

  return ('''
if analytics_marker not in text:
    raise SystemExit("analytics marker not found")
text = text.replace(analytics_marker, analytics_insert, 1)

intro = '''      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Connected Accounts
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Authorisations this dashboard holds on your behalf. Credentials are
            encrypted and stored where the browser cannot reach them — nothing
            on this page has ever seen a token.
          </p>
        </div>
'''
premium_intro = '''      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <Link2 aria-hidden="true" className="size-4" />
                External capability control
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Connected Accounts
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Control the real authorisations behind publishing, media access
                and analytics. Server configuration, OAuth connection, granted
                permission and current provider capability remain separate facts
                so a green connection never implies more than the provider has
                actually confirmed.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/65">
              <p className="font-semibold text-white">Credential boundary</p>
              <p className="mt-1 max-w-xs">
                Tokens stay encrypted on the server. This page receives account
                identity and capability state only; browser-visible UI never
                receives stored credentials.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Connected account evidence metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <OverviewMetric
            label="Connected"
            value={connectedAccountCount}
            detail="Account records currently marked connected"
          />
          <OverviewMetric
            label="Configured"
            value={`${configuredIntegrationCount}/4`}
            detail="Integrations able to begin an authorisation flow"
          />
          <OverviewMetric
            label="Publishing"
            value={`${publishingConnectionCount}/3`}
            detail="Publishing platforms with a connected account"
          />
          <OverviewMetric
            label="Analytics"
            value={analyticsAuthorisedCount}
            detail="Connected platforms with analytics permission"
          />
          <OverviewMetric
            label="Credential writer"
            value={workerReady ? "Ready" : "Blocked"}
            detail="Trusted server path for encrypted credentials"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Capability chain
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Configuration and live authority are not the same state
                </h3>
              </div>
              <StatusBadge tone={workerReady ? "configured" : "inactive"}>
                {workerReady ? "Secure writes available" : "Credential writes blocked"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Configure", "Server credentials and redirect settings must exist"],
                ["2", "Connect", "The owner must complete the provider authorisation"],
                ["3", "Authorise", "Required scopes and provider permissions must be granted"],
                ["4", "Confirm", "Current provider capability is read where the API supports it"],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-panel/40 px-4 py-4"
                >
                  <span className="text-xs font-semibold text-highlight">
                    {step}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-ink-primary">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <p className="text-sm font-semibold text-ink-primary">
              Connection truth boundary
            </p>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Configured integration ≠ connected account.</li>
              <li>Connected account ≠ every permission granted.</li>
              <li>Publishing permission ≠ provider acceptance of a post.</li>
              <li>Analytics permission ≠ publishing permission.</li>
              <li>Stored credential ≠ browser-visible credential.</li>
              <li>Account connected ≠ content published.</li>
            </ul>
          </div>
        </section>
'''
if intro not in text:
    raise SystemExit("intro marker not found")
text = text.replace(intro, premium_intro, 1)

section_marker = '''        <SectionCard
          title="YouTube"'''
section_heading = '''        <div className="pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Provider controls
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink-primary">
            Connect, inspect and revoke each integration
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
            The controls below are the existing real provider flows. Their
            platform limits, scopes, revocation behaviour and capability checks
            remain visible instead of being collapsed into a generic connected
            badge.
          </p>
        </div>

        <SectionCard
          title="YouTube"'''
if section_marker not in text:
    raise SystemExit("provider section marker not found")
text = text.replace(section_marker, section_heading, 1)

path.write_text(text)
