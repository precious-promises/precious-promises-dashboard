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
  const folderCount = result.files.filter((file) =>
    isFolder(file.mimeType),
  ).length;
  const supportedFiles = result.files.filter(
    (file) =>
      !isFolder(file.mimeType) && mediaTypeForMime(file.mimeType) !== null,
  );
  const importedInView = supportedFiles.filter((file) =>
    imported.has(file.id),
  ).length;
  const unsupportedCount = result.files.filter(
    (file) =>
      !isFolder(file.mimeType) && mediaTypeForMime(file.mimeType) === null,
  ).length;

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
                Approved media library
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Google Drive Browser
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Browse the approved <strong>{DRIVE_ROOT_NAME}</strong> library,
                register usable media as dashboard references, and keep Drive
                authorisation, root containment, imported metadata and actual
                file access as separate evidence states.
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
          aria-label="Drive Browser metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Drive"
            value={result.connected ? "Connected" : "Not connected"}
            detail="Runtime account and credential state"
          />
          <Metric
            label="Entries shown"
            value={result.files.length}
            detail="Current fetched folder page"
          />
          <Metric
            label="Folders"
            value={folderCount}
            detail="Inside the approved root boundary"
          />
          <Metric
            label="Imported"
            value={importedInView}
            detail="Supported files already recorded"
          />
          <Metric
            label="Unsupported"
            value={unsupportedCount}
            detail="Listed files not accepted for publishing"
          />
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

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.5fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Access model
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Read Drive through a guarded root
                </h3>
              </div>
              <StatusBadge tone={result.connected ? "configured" : "inactive"}>
                {result.connected ? "Runtime connected" : "Not connected"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Authorise", "Drive requires its own live credential"],
                [
                  "2",
                  "Contain",
                  "Every requested folder is re-checked against the root",
                ],
                ["3", "Browse", "Only returned Drive metadata is shown here"],
                ["4", "Import", "Register a reference; do not copy file bytes"],
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
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-ink-muted"
              />
              Root boundary
            </span>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              A folder id from the browser is never trusted. The server proves
              it descends from the configured {DRIVE_ROOT_NAME} root before
              listing it. A refused or stale folder falls back to the root.
            </p>
            <p className="mt-3 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-secondary">
              This is application enforcement. Google grants read-only access
              more broadly than one folder, so a connected credential is not
              itself proof that the root boundary is a Google permission.
            </p>
          </div>
        </section>

        {!result.connected ? (
          <SectionCard
            title="Drive library unavailable"
            description="Drive is a separate authorisation from YouTube. A connected channel does not automatically connect the media library."
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
            title={atRoot ? DRIVE_ROOT_NAME : "Approved library folder"}
            description={
              atRoot
                ? "The root of the approved Drive media library."
                : "A folder proved to be inside the approved library."
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
                title="Nothing returned for this folder."
                description="The folder may be empty, or Drive may not have returned entries for this request."
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
              <p className="mt-4 rounded-lg border border-edge/70 bg-panel/35 px-3 py-2 text-xs leading-5 text-ink-muted">
                Drive reported another page. Pagination is not built yet, so
                this view shows only the first {result.files.length} returned
                entries. It does not claim that the current list is the whole
                folder.
              </p>
            ) : null}
          </SectionCard>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Library organisation"
            description="Guidance only. Subfolder names are not the security boundary."
          >
            <ul className="grid gap-1.5 text-sm text-ink-muted sm:grid-cols-2">
              {EXPECTED_FOLDERS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p className="mt-4 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-muted">
              Importing records a Drive-backed media reference including the
              returned name, type, size and Drive id. No media bytes are copied
              into Postgres by this action.
            </p>
          </SectionCard>

          <SectionCard
            title="Google permission boundary"
            description="The OAuth scope and the product boundary are not the same thing."
          >
            <p className="text-sm leading-6 text-ink-secondary">
              Google has no scope that grants access to one folder. The app uses
              <code className="mx-1 text-xs">drive.readonly</code> because it
              must both list existing media and read bytes when a genuine upload
              needs them.
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-secondary">
              That Google grant covers the whole Drive. The narrower
              <strong className="mx-1 text-ink-primary">
                product boundary
              </strong>
              is enforced in application code by proving each target belongs to
              the approved root before listing or reading it.
            </p>
            <StatusBadge tone="configured" className="mt-4">
              Read-only connection
            </StatusBadge>
          </SectionCard>
        </section>

        <section className="rounded-2xl border border-edge bg-panel-raised/25 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Drive truth boundary
          </p>
          <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary md:grid-cols-2 xl:grid-cols-4">
            <p>
              <strong className="text-ink-primary">
                Implemented ≠ connected.
              </strong>{" "}
              Drive code can exist while no live account credential is usable.
            </p>
            <p>
              <strong className="text-ink-primary">Listed ≠ imported.</strong>{" "}
              Seeing Drive metadata does not create a Media Assets record.
            </p>
            <p>
              <strong className="text-ink-primary">Imported ≠ copied.</strong>{" "}
              Import stores a reference; the original bytes remain in Drive.
            </p>
            <p>
              <strong className="text-ink-primary">
                Imported ≠ published.
              </strong>{" "}
              A media reference proves neither render use nor provider upload
              nor public availability.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
