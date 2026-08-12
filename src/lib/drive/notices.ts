import { refusalMessage } from "./types";

/**
 * What the Drive Browser says after an import attempt.
 *
 * Kept out of the Server Action module because a `"use server"` file may only
 * export async functions — and kept as this application's own vocabulary so
 * nothing Google returned is echoed into a URL that ends up in browser history.
 */
export const DRIVE_NOTICES: Record<string, string> = {
  imported: "Imported. It is now available as a media asset.",
  "already-imported": "That file has already been imported.",
  "no-file": "No file was chosen.",
  "import-failed": "That file could not be imported. Nothing was recorded.",
  is_folder: "That is a folder, not a file.",
  unsupported_type: refusalMessage("unsupported_type"),
  outside_root: refusalMessage("outside_root"),
  not_found: refusalMessage("not_found"),
  trashed: refusalMessage("trashed"),
  not_connected: refusalMessage("not_connected"),
  not_configured: refusalMessage("not_configured"),
  unreadable: refusalMessage("unreadable"),
  no_size: refusalMessage("no_size"),
};
