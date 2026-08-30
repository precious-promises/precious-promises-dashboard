import { FolderOpen, HardDrive, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DriveEntry } from "@/components/drive/drive-entry";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { browseDrive, loadImportedFileIds } from "@/lib/drive/browse";
import {
  DRIVE_ROOT_NAME,
  EXPECTED_FOLDERS,
  isFolder,
  mediaTypeForMime,
} from "@/lib/drive/config";
import { DRIVE_NOTICES } from "@/lib/drive/notices";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { importDriveFile } from "./actions";

export const metadata: Metadata = {
  title: "Google Drive Browser · Precious Promises",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

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

/**
 * The Google Drive Browser.
 *
 * Shows the approved Precious Promises Content folder and nothing else.
 *
 * The folder id comes from the query string, which means anyone who can open
 * this page can type one — so `browseDrive` re-proves that the requested folder
 * descends from the configured root before listing it, and falls back to the
 * root with an explanation when it does not. Without that check this page would
 * be a general-purpose Drive explorer wearing the application's credentials.
 *
 * Importing registers a **reference**. No bytes are copied here; the file stays
 * in Drive and this records what it is.
 */
export default async function DriveBrowserPage(
  props: PageProps<"/dashboard/drive">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const folder = firstParam(searchParams.folder);
  const noticeKey = firstParam(searchParams.notice);
  const notice = noticeKey ? DRIVE_NOTICES[noticeKey] : undefined;

  const result = await browseDrive(folder);
  const imported = await loadImportedFileIds();

  const atRoot = result.folderId === result.rootFolderId;
  const folders = result.files.filter((file) => isFolder(file.mimeType));
  const usableFiles = result.files.filter(
    (file) => !isFolder(file.mimeType) && mediaTypeForMime(file.mimeType) !== null,
  );
  const unsupportedFiles = result.files.filter(
    (file) => !isFolder(file.mimeType) && mediaTypeForMime(file.mimeType) === null,
  );
  const importedOnPage = usableFiles.filter((file) => imported.has(file.id));

  return (
    <DashboardShell
      title="Google Drive Browser"
      pathname="/dashboard/drive"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <HardDrive aria-hidden="true" className="size-4" />
                Controlled media gateway
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Google Drive Browser
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Browse the approved <strong>{DRIVE_ROOT_NAME}</strong> library,
                register usable media as dashboard references, and keep Drive
                authorisation, folder containment, metadata import and actual
                byte access as separate evidence states.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/media"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Media Assets
              </Link>
              <Link
                href="/dashboard/accounts"
                className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Connected Accounts
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Drive browser metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Connection"
            value={result.connected ? "Connected" : "Not connected"}
            detail="Runtime Drive credential state"
          />
          <Metric
            label="Folders"
            value={folders.length}
            detail="Returned in this listing"
          />
          <Metric
            label="Usable media"
            value={usableFiles.length}
            detail="Supported file types on this page"
          />
          <Metric
            label="Imported here"
            value={importedOnPage.length}
            detail="References already registered"
          />
          <Metric
            label="Unsupported"
            value={unsupportedFiles.length}
            detail="Returned but not publishable"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Access model
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Four checks before media becomes usable
                </h3>
              </div>
              <StatusBadge tone={result.connected ? "configured" : "inactive"}>
                {result.connected ? "Drive connected" : "Connection required"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Authorise", "A live Drive credential must exist"],
                ["2", "Contain", "Requested folder must descend from the root"],
                ["3", "Inspect", "Drive returns real file metadata"],
                ["4", "Import", "Dashboard stores a reference, not the bytes"],
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
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <ShieldCheck aria-hidden="true" className="size-4 text-ink-muted" />
              Root-folder boundary
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Browser-supplied folder ids are never trusted. Every non-root
              request is checked before it is listed, and a folder outside the
              approved library is refused and replaced with the root view.
            </p>
            <p className="mt-3 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-secondary">
              This boundary is application-enforced. Google's OAuth scope itself
              is broader than the approved folder.
            </p>
          </div>
        </section>

        {notice ? (
          <p
            role="status"
            className="rounded-xl border border-edge bg-panel-raised/50 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </p>
        ) : null}

        {result.problem ? (
          <p
            role="status"
            className="rounded-xl border border-gold-dim/50 bg-gold/10 px-4 py-3 text-sm text-gold"
          >
            {result.problem}
          </p>
        ) : null}

        {!result.connected ? (
          <SectionCard
            title="Drive access is not connected"
            description="The Drive adapter exists, but this browser still needs a valid Google Drive authorisation and configured root before it can return media. YouTube connection is separate and does not provide Drive access."
          >
            <Link
              href="/dashboard/accounts"
              className="inline-flex rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Open Connected Accounts
            </Link>
          </SectionCard>
        ) : (
          <SectionCard
            title={atRoot ? DRIVE_ROOT_NAME : "Folder inside approved library"}
            description={
              atRoot
                ? `${result.files.length} ${result.files.length === 1 ? "entry" : "entries"} returned from the approved root.`
                : `${result.files.length} ${result.files.length === 1 ? "entry" : "entries"} returned after containment was proved.`
            }
            action={
              atRoot ? null : (
                <Link
                  href="/dashboard/drive"
                  className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Back to root
                </Link>
              )
            }
          >
            {result.files.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="Nothing returned here."
                description="This folder may be empty, or Drive may not have returned any entries for this listing."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {result.files.map((file) => (
                  <DriveEntry
                    key={file.id}
                    file={file}
                    folderId={result.folderId}
                    alreadyImported={imported.has(file.id)}
                    importAction={importDriveFile}
                  />
                ))}
              </ul>
            )}

            {result.nextPageToken ? (
              <p className="mt-4 rounded-xl border border-edge/70 bg-panel/35 px-4 py-3 text-xs leading-5 text-ink-muted">
                Drive reported another page of entries. Pagination is not built
                yet, so this screen shows only the first {result.files.length}.
                The remaining entries have not been fetched by this page.
              </p>
            ) : null}
          </SectionCard>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Library organisation"
            description="Suggested folders for Precious Promises media. These names are guidance only; the enforced security boundary is the configured root."
          >
            <ul className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
              {EXPECTED_FOLDERS.map((name) => (
                <li
                  key={name}
                  className="rounded-lg border border-edge/60 bg-panel-raised/30 px-3 py-2"
                >
                  {name}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="What import actually does"
            description="Import is a metadata registration step, not a file transfer."
          >
            <div className="space-y-3 text-sm leading-6 text-ink-secondary">
              <p>
                Import records the Drive id and returned metadata needed to
                identify the asset in the dashboard. The underlying file remains
                in Google Drive.
              </p>
              <p>
                No media bytes are copied into Postgres during import. A later
                workflow that genuinely needs the file must resolve it through
                the storage adapter at that time.
              </p>
              <p className="text-xs text-ink-muted">
                An imported reference therefore proves that the dashboard knows
                about an asset. It does not prove a later read, render, upload or
                public publication succeeded.
              </p>
            </div>
          </SectionCard>
        </section>

        <SectionCard
          title="What this Google grant can reach"
          description="The OAuth scope and the product's approved-library boundary are deliberately stated separately."
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-3 text-sm leading-6 text-ink-secondary">
              <p>
                Google has no OAuth scope that grants access to one arbitrary
                existing folder. <code className="text-xs">drive.file</code> is
                too narrow for a pre-existing media library, while{" "}
                <code className="text-xs">drive.metadata.readonly</code> cannot
                download file contents. This application therefore uses{" "}
                <code className="text-xs">drive.readonly</code> so it can list
                and later read approved media.
              </p>
              <p>
                That grant can cover more than the Precious Promises root. The
                application restricts its own browse and read paths by proving
                containment before access. A compromised server could exceed
                that application boundary, so the UI does not describe the OAuth
                grant itself as folder-scoped.
              </p>
            </div>

            <div className="rounded-xl border border-edge/70 bg-panel/35 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Permission profile
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge tone="configured">Read-only OAuth</StatusBadge>
                <StatusBadge tone="configured">Root checked</StatusBadge>
                <StatusBadge tone="inactive">No Drive writes</StatusBadge>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                This browser does not write, delete, move or change sharing on a
                Google Drive file.
              </p>
            </div>
          </div>
        </SectionCard>

        <section className="rounded-2xl border border-edge bg-panel-raised/25 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Drive truth boundary
          </p>
          <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary md:grid-cols-2 xl:grid-cols-4">
            <p>
              <strong className="text-ink-primary">Implemented ≠ connected.</strong>{" "}
              The Drive adapter can exist while no usable owner credential is
              present.
            </p>
            <p>
              <strong className="text-ink-primary">Connected ≠ unrestricted.</strong>{" "}
              Every requested folder still has to pass the approved-root check.
            </p>
            <p>
              <strong className="text-ink-primary">Imported ≠ copied.</strong>{" "}
              Import registers a reference and metadata; the source bytes remain
              in Drive.
            </p>
            <p>
              <strong className="text-ink-primary">Reference ≠ publication.</strong>{" "}
              A known media asset is not evidence of a completed render, platform
              upload or publicly available post.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
