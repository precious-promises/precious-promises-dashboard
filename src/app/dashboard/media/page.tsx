import { HardDrive, Images } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getMediaCount } from "@/lib/content/repository";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media/types";
import {
  STORAGE_PROVIDER_STATUS,
  type StorageProviderStatus,
} from "@/lib/storage/provider";
import { STORAGE_PROVIDER_LABELS } from "@/lib/media/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Media Assets · Precious Promises",
  robots: { index: false, follow: false },
};

function ProviderRow({ status }: { status: StorageProviderStatus }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <HardDrive
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-muted"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink-primary">
            {STORAGE_PROVIDER_LABELS[status.provider]}
          </span>
          <span className="block text-xs text-ink-muted">{status.detail}</span>
        </span>
      </span>
      <StatusBadge tone={status.implemented ? "configured" : "inactive"}>
        {status.implemented ? "Adapter built" : "No adapter"}
      </StatusBadge>
    </li>
  );
}

export default async function MediaAssetsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const mediaCount = await getMediaCount();

  return (
    <DashboardShell
      title="Media Assets"
      pathname="/dashboard/media"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Media Assets
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Metadata for the media behind your content. This records where a
            file lives and what it is — the files themselves are held outside
            the database.
          </p>
        </div>

        <SectionCard
          title="Library"
          description={`${mediaCount} ${mediaCount === 1 ? "asset" : "assets"} recorded.`}
        >
          {mediaCount === 0 ? (
            <EmptyState
              icon={Images}
              title="No media assets recorded yet."
              description="Asset records will appear here once media is registered. Creating them from the interface arrives with the storage integration — see below."
            />
          ) : (
            <p className="text-sm text-ink-secondary">
              {mediaCount} asset {mediaCount === 1 ? "record" : "records"}{" "}
              stored.
            </p>
          )}

          <div className="mt-5 border-t border-edge/60 pt-4">
            <h3 className="text-xs font-semibold tracking-wide text-ink-secondary uppercase">
              Supported media types
            </h3>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {MEDIA_TYPES.map((type) => (
                <li
                  key={type}
                  className="rounded-full border border-edge px-3 py-1 text-xs text-ink-secondary"
                >
                  {MEDIA_TYPE_LABELS[type]}
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard
          title="Storage providers"
          description="Where media files are held, and which of them this application can actually read."
        >
          <ul className="flex flex-col gap-2.5">
            {STORAGE_PROVIDER_STATUS.map((status) => (
              <ProviderRow key={status.provider} status={status} />
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            Google Drive is the primary library for large media, and Stage 8
            implemented reading from it — confined to the approved Precious
            Promises Content folder. Connect it under{" "}
            <Link
              href="/dashboard/accounts"
              className="underline decoration-edge-strong underline-offset-2 hover:text-ink-secondary"
            >
              Connected Accounts
            </Link>
            , then import files in the{" "}
            <Link
              href="/dashboard/drive"
              className="underline decoration-edge-strong underline-offset-2 hover:text-ink-secondary"
            >
              Drive Browser
            </Link>
            . Large binaries are never stored in Postgres.
          </p>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
