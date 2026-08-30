import { HardDrive, Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { listMediaAssets } from "@/lib/media/repository";
import {
  MEDIA_TYPE_LABELS,
  MEDIA_TYPES,
  RIGHTS_STATUS_LABELS,
  STORAGE_PROVIDER_LABELS,
  type MediaAsset,
} from "@/lib/media/types";
import {
  STORAGE_PROVIDER_STATUS,
  type StorageProviderStatus,
} from "@/lib/storage/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Media Assets · Precious Promises",
  robots: { index: false, follow: false },
};

function Metric({
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

function ProviderRow({ status }: { status: StorageProviderStatus }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-edge/70 bg-panel/60">
          <HardDrive
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted"
          />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink-primary">
            {STORAGE_PROVIDER_LABELS[status.provider]}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
            {status.detail}
          </span>
        </span>
      </span>
      <StatusBadge tone={status.implemented ? "configured" : "inactive"}>
        {status.implemented ? "Adapter built" : "No adapter"}
      </StatusBadge>
    </li>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Size not recorded";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function assetDetail(asset: MediaAsset): string {
  if (asset.width && asset.height) {
    return `${asset.width} × ${asset.height}`;
  }
  if (asset.duration_seconds !== null) {
    return `${Math.round(asset.duration_seconds)} sec`;
  }
  return asset.mime_type ?? "Metadata only";
}

export default async function MediaAssetsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const assets = await listMediaAssets();
  const driveCount = assets.filter(
    (asset) => asset.storage_provider === "google_drive",
  ).length;
  const generatedCount = assets.filter((asset) => asset.generated_kind).length;
  const clearedCount = assets.filter((asset) =>
    ["owned", "licensed", "public_domain"].includes(asset.rights_status),
  ).length;
  const attentionCount = assets.filter((asset) =>
    ["unknown", "restricted"].includes(asset.rights_status),
  ).length;

  return (
    <DashboardShell
      title="Media Assets"
      pathname="/dashboard/media"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <Images aria-hidden="true" className="size-4" />
                Media evidence centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Media Assets
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                See the media records behind content and video production —
                where each asset is recorded, what type it is, its rights state,
                and whether it was imported or generated by this application.
                Asset metadata remains separate from proof that the underlying
                file bytes are currently reachable.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/drive"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Drive Browser
              </Link>
              <Link
                href="/dashboard/rights"
                className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Rights & Licences
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Media asset metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Asset records"
            value={assets.length}
            detail="Rows recorded in the media library"
          />
          <Metric
            label="Google Drive"
            value={driveCount}
            detail="Records pointing to Drive"
          />
          <Metric
            label="Generated"
            value={generatedCount}
            detail="Render or voiceover provenance recorded"
          />
          <Metric
            label="Rights cleared"
            value={clearedCount}
            detail="Owned, licensed or public domain"
          />
          <Metric
            label="Needs attention"
            value={attentionCount}
            detail="Unknown or restricted rights state"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Asset model
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Record first, verify the file separately
                </h3>
              </div>
              <StatusBadge tone="configured">Metadata library</StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Record", "Name, media type and provider metadata"],
                [
                  "2",
                  "Locate",
                  "Provider reference says where bytes should live",
                ],
                ["3", "Clear", "Rights state records intended usage status"],
                ["4", "Use", "Attachment or rendering is separate evidence"],
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Supported media types
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MEDIA_TYPES.map((type) => (
                <span
                  key={type}
                  className="rounded-full border border-edge px-3 py-1 text-xs text-ink-secondary"
                >
                  {MEDIA_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
            <p className="mt-4 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-muted">
              A supported metadata type does not guarantee the provider can read
              the file, that the file is suitable for a platform, or that it has
              been used in a completed render.
            </p>
          </div>
        </section>

        <SectionCard
          title="Asset library"
          description={
            assets.length === 0
              ? "No media asset records yet."
              : `${assets.length} ${assets.length === 1 ? "asset record" : "asset records"} available to inspect.`
          }
        >
          {assets.length === 0 ? (
            <EmptyState
              icon={Images}
              title="No media assets recorded yet."
              description="Import approved files from the Drive Browser or create generated media through the production workflow. A library row records metadata; it does not by itself prove file access."
              action={
                <Link
                  href="/dashboard/drive"
                  className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Open Drive Browser
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex h-full flex-col rounded-2xl border border-edge/80 bg-panel-raised/30 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-edge/70 bg-panel/60 text-ink-secondary">
                      <Images aria-hidden="true" className="size-4" />
                    </span>
                    <StatusBadge
                      tone={
                        asset.rights_status === "restricted" ||
                        asset.rights_status === "unknown"
                          ? "inactive"
                          : "configured"
                      }
                    >
                      {RIGHTS_STATUS_LABELS[asset.rights_status]}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink-primary">
                      {asset.name}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      {MEDIA_TYPE_LABELS[asset.media_type]} ·{" "}
                      {STORAGE_PROVIDER_LABELS[asset.storage_provider]}
                    </p>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-edge/70 pt-3 text-xs">
                    <div>
                      <dt className="text-ink-muted">File detail</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {assetDetail(asset)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Recorded size</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {formatBytes(asset.size_bytes)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Provenance</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {asset.generated_kind
                          ? asset.generated_kind === "rendered_video"
                            ? "Generated render"
                            : "Generated voiceover"
                          : "Imported / referenced"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Provider reference</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {asset.external_file_id || asset.external_url
                          ? "Recorded"
                          : "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Storage providers"
          description="Adapter implementation tells you what the code can support. It is not the same as a live, authorised provider connection."
        >
          <ul className="flex flex-col gap-2.5">
            {STORAGE_PROVIDER_STATUS.map((status) => (
              <ProviderRow key={status.provider} status={status} />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            Google Drive is the primary library for large media. Its adapter can
            read metadata and bytes only inside the approved Precious Promises
            Content root after the account is actually authorised. Supabase
            Storage supports private generated media. External URLs remain
            references only and are not fetched. Review connections under{" "}
            <Link
              href="/dashboard/accounts"
              className="underline decoration-edge-strong underline-offset-2 hover:text-ink-secondary"
            >
              Connected Accounts
            </Link>
            .
          </p>
        </SectionCard>

        <section className="rounded-2xl border border-edge bg-panel-raised/25 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Media truth boundary
          </p>
          <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary md:grid-cols-2 xl:grid-cols-4">
            <p>
              <strong className="text-ink-primary">
                Asset record ≠ accessible bytes.
              </strong>{" "}
              Metadata can exist even when the provider is disconnected or the
              underlying file is unavailable.
            </p>
            <p>
              <strong className="text-ink-primary">
                Adapter built ≠ live connected.
              </strong>{" "}
              Implemented provider code still requires genuine credentials and
              runtime authorisation where applicable.
            </p>
            <p>
              <strong className="text-ink-primary">
                Rights label ≠ legal verification.
              </strong>{" "}
              The recorded rights state is operational metadata and must not be
              read as independent legal proof of ownership or licence validity.
            </p>
            <p>
              <strong className="text-ink-primary">
                Attached ≠ rendered or published.
              </strong>{" "}
              A media record can be selected in production without proving it
              appeared in a completed render or public post.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
