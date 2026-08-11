import { getFile, type DriveRequestContext } from "./api";
import { MAX_PARENT_WALK_DEPTH } from "./config";
import type { DriveFile } from "./types";

/**
 * The folder boundary.
 *
 * This is the security core of the Drive integration, and it is worth being
 * precise about what it is and is not.
 *
 * **It is not enforced by Google.** The scope this application holds
 * (`drive.readonly`) grants read access to the whole of Dave's Drive, because
 * Google offers no folder-scoped read scope — `drive.metadata.readonly` cannot
 * download, and `drive.file` cannot see files it did not create. So the
 * boundary lives here, in application logic.
 *
 * **What that buys.** Every path that reads bytes or lists a folder proves the
 * target descends from `GOOGLE_DRIVE_ROOT_FOLDER_ID` first. The Drive Browser
 * cannot navigate outside it, an arbitrary file id cannot be probed by editing
 * a URL, and a media asset pointing outside the root is refused at publish
 * time rather than uploaded.
 *
 * **What it does not buy.** A compromised server holding the token could read
 * beyond the root. That is a real limitation and it is documented rather than
 * papered over.
 *
 * The walk **fails closed**: anything it cannot prove — a missing parent, a
 * chain deeper than the bound, an API error — is "not inside the root".
 */

export interface ContainmentResult {
  inside: boolean;
  /** How the answer was reached, for display and for tests. */
  reason:
    | "is_root"
    | "descends_from_root"
    | "no_parents"
    | "depth_exceeded"
    | "not_found"
    | "unreachable";
}

/**
 * Whether `fileId` is the root or lives somewhere beneath it.
 *
 * Drive's hierarchy is a graph — a file may have several parents — so this
 * walks breadth-first across every parent rather than following the first one.
 * Following only the first would let a file reachable from the root by a second
 * path be wrongly refused, and, worse, a file with a root parent *and* an
 * outside parent be wrongly accepted on a different ordering.
 *
 * Visited ids are tracked so a cycle terminates instead of spinning.
 */
export async function isInsideRoot(
  context: DriveRequestContext,
  fileId: string,
  rootFolderId: string,
): Promise<ContainmentResult> {
  if (fileId === rootFolderId) {
    return { inside: true, reason: "is_root" };
  }

  const visited = new Set<string>([fileId]);
  let frontier: string[] = [fileId];

  for (let depth = 0; depth < MAX_PARENT_WALK_DEPTH; depth += 1) {
    const parents: string[] = [];

    for (const id of frontier) {
      let file: DriveFile | null;
      try {
        file = await getFile(context, id);
      } catch {
        // An API failure is not evidence of containment.
        return { inside: false, reason: "unreachable" };
      }

      if (file === null) {
        return { inside: false, reason: "not_found" };
      }

      for (const parent of file.parents) {
        if (parent === rootFolderId) {
          return { inside: true, reason: "descends_from_root" };
        }
        if (!visited.has(parent)) {
          visited.add(parent);
          parents.push(parent);
        }
      }
    }

    if (parents.length === 0) {
      // Reached the top of the Drive without meeting the root.
      return { inside: false, reason: "no_parents" };
    }

    frontier = parents;
  }

  // Deeper than the bound. Refusing is the safe answer; allowing would mean
  // trusting a chain nobody finished checking.
  return { inside: false, reason: "depth_exceeded" };
}

/**
 * The same question for a file already loaded.
 *
 * Saves a round trip when the caller has the file in hand, which the browser
 * and the import path both do. Falls through to the full walk when the answer
 * is not immediate.
 */
export async function fileIsInsideRoot(
  context: DriveRequestContext,
  file: DriveFile,
  rootFolderId: string,
): Promise<ContainmentResult> {
  if (file.id === rootFolderId) {
    return { inside: true, reason: "is_root" };
  }
  if (file.parents.includes(rootFolderId)) {
    return { inside: true, reason: "descends_from_root" };
  }
  if (file.parents.length === 0) {
    return { inside: false, reason: "no_parents" };
  }

  return isInsideRoot(context, file.id, rootFolderId);
}
