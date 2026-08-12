import { FileVideo, Folder, Image as ImageIcon, Music } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { isFolder, mediaTypeForMime } from "@/lib/drive/config";
import type { DriveFile } from "@/lib/drive/types";

/**
 * One row in the Drive Browser.
 *
 * A folder is a link deeper into the approved library. A file is either
 * importable, already imported, or of a type this product does not publish —
 * and the row says which, rather than offering a button that would fail.
 */

const ICONS = {
  video: FileVideo,
  image: ImageIcon,
  audio: Music,
} as const;

function formatSize(bytes: number | null): string {
  if (bytes === null) {
    // Drive does not report a size for every item. Showing "0 B" would be a
    // number nobody measured.
    return "size unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface DriveEntryProps {
  file: DriveFile;
  folderId: string;
  alreadyImported: boolean;
  importAction: (formData: FormData) => Promise<void>;
}

export function DriveEntry({
  file,
  folderId,
  alreadyImported,
  importAction,
}: DriveEntryProps) {
  if (isFolder(file.mimeType)) {
    return (
      <li>
        <Link
          href={`/dashboard/drive?folder=${encodeURIComponent(file.id)}`}
          className="flex items-center gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5 transition-colors hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          <Folder aria-hidden="true" className="size-4 shrink-0 text-gold" />
          <span className="min-w-0 truncate text-sm font-medium text-ink-primary">
            {file.name}
          </span>
        </Link>
      </li>
    );
  }

  const mediaType = mediaTypeForMime(file.mimeType);
  const Icon = mediaType ? ICONS[mediaType] : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5">
      <span className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-primary">
            {file.name}
          </span>
          <span className="block text-xs text-ink-muted">
            {file.mimeType} · {formatSize(file.sizeBytes)}
            {file.durationSeconds ? ` · ${file.durationSeconds}s` : ""}
            {file.width && file.height ? ` · ${file.width}×${file.height}` : ""}
          </span>
        </span>
      </span>

      {mediaType === null ? (
        <StatusBadge tone="inactive">Cannot be published</StatusBadge>
      ) : alreadyImported ? (
        <StatusBadge tone="configured">Imported</StatusBadge>
      ) : (
        <form action={importAction}>
          <input type="hidden" name="file_id" value={file.id} />
          <input type="hidden" name="folder_id" value={folderId} />
          <button
            type="submit"
            className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            Import
          </button>
        </form>
      )}
    </li>
  );
}
