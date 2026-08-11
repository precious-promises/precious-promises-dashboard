import { FolderOpen } from "lucide-react";
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
import { DRIVE_ROOT_NAME, EXPECTED_FOLDERS } from "@/lib/drive/config";
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

  return (
    <DashboardShell
      title="Google Drive Browser"
      pathname="/dashboard/drive"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Google Drive Browser
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            The approved <strong>{DRIVE_ROOT_NAME}</strong> folder. Nothing
            outside it can be listed or read — a folder id that does not descend
            from it is refused, not followed.
          </p>
        </div>

        {notice ? (
          <p
            role="status"
            className="rounded-lg border border-edge bg-panel-raised/50 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </p>
        ) : null}

        {result.problem ? (
          <p
            role="status"
            className="rounded-lg border border-gold-dim/50 bg-gold/10 px-4 py-3 text-sm text-gold"
          >
            {result.problem}
          </p>
        ) : null}

        {!result.connected ? (
          <SectionCard
            title="Not connected"
            description="Drive is a separate authorisation from YouTube, so connecting a channel does not hand over the media library."
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
            title={atRoot ? DRIVE_ROOT_NAME : "Folder"}
            description={
              atRoot
                ? "The root of the approved media library."
                : "Inside the approved library."
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
                title="Nothing here."
                description="This folder is empty, or contains only items Drive did not return."
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
              <p className="mt-3 text-xs text-ink-muted">
                This folder has more entries than one page. Paging is not built
                yet, so only the first {result.files.length} are shown — the
                rest are not hidden, just not fetched.
              </p>
            ) : null}
          </SectionCard>
        )}

        <SectionCard
          title="How this library is organised"
          description="Guidance, not a rule. The boundary that is enforced is the root folder; subfolder names are not."
        >
          <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
            {EXPECTED_FOLDERS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Importing a file records a reference to it — a name, a type, a size
            and its Drive id. No bytes are copied, and the file is read only
            when something genuinely needs to upload it.
          </p>
        </SectionCard>

        <SectionCard
          title="What this connection can reach"
          description="Stated plainly, because the boundary is enforced here rather than by Google."
        >
          <p className="text-sm text-ink-secondary">
            Google has no scope that grants access to a single folder.{" "}
            <code className="text-xs">drive.metadata.readonly</code> cannot
            download, and <code className="text-xs">drive.file</code> cannot see
            files it did not create — so this application holds{" "}
            <code className="text-xs">drive.readonly</code>, the narrowest scope
            that can both list a folder and read its contents.
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            That grant covers the whole of your Drive.{" "}
            <strong>
              The folder boundary is enforced by this application, not by Google
            </strong>
            : every listing and every read proves the target descends from the
            approved root first. A compromised server could read more than the
            root, and saying otherwise would be a false assurance.
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            The connection is read-only. Nothing here can write, delete, or
            change sharing on a Drive file.
          </p>
          <StatusBadge tone="configured" className="mt-3">
            Read-only
          </StatusBadge>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
