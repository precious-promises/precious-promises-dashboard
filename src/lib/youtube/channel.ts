import { getLiveCredential } from "@/lib/accounts/credentials";
import type { SocialAccount } from "@/lib/accounts/types";
import { createWorkerClient } from "@/lib/supabase/worker";

import { fetchMyPlaylists } from "./api";
import type { YouTubePlaylist } from "./types";

/**
 * Reading the connected channel, for the interface.
 *
 * **Server-only.** Needs the trusted worker credential, because the token it
 * decrypts lives in a table the owner's own session cannot read.
 *
 * This exists for one rule in particular: a playlist must be one the channel
 * actually has. A free-text playlist id would let a typo become a publish that
 * fails at the last step, or — worse — a plausible-looking id for somebody
 * else's playlist. So the interface offers only what the API returned, and says
 * plainly when it can return nothing.
 *
 * `channels.list` and `playlists.list` cost one quota unit each of a default
 * 10,000 a day, so reading them when the settings form renders is not a
 * meaningful cost. An upload is 1,600.
 */

export interface ChannelPlaylists {
  playlists: YouTubePlaylist[];
  /** Why the list is empty, when it is. Never names a credential. */
  reason: string | null;
}

const NOT_CONNECTED: ChannelPlaylists = {
  playlists: [],
  reason:
    "No YouTube channel is connected, so there are no playlists to choose from.",
};

/**
 * The playlists on the owner's connected channel.
 *
 * Returns a reason rather than throwing for every failure. A settings form that
 * refused to render because a playlist lookup timed out would be worse than one
 * that renders and says the list is unavailable.
 */
export async function loadChannelPlaylists(
  ownerId: string,
): Promise<ChannelPlaylists> {
  const { client } = createWorkerClient();
  if (client === null) {
    return {
      playlists: [],
      reason:
        "No trusted server credential is configured, so the channel cannot be read.",
    };
  }

  const { data } = await client
    .from("social_accounts")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("platform", "youtube")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  const account = (data as SocialAccount | null) ?? null;
  if (account === null) {
    return NOT_CONNECTED;
  }

  const credential = await getLiveCredential(client, account);
  if (!credential.ok) {
    return { playlists: [], reason: credential.reason };
  }

  try {
    const playlists = await fetchMyPlaylists({
      accessToken: credential.credential.accessToken,
    });

    return {
      playlists,
      reason:
        playlists.length === 0
          ? "This channel has no playlists yet. Create one on YouTube and it will appear here."
          : null,
    };
  } catch {
    // The classified reason is deliberately not surfaced here: a playlist
    // lookup failing is not something the owner can act on from this form.
    return {
      playlists: [],
      reason: "YouTube did not return the channel's playlists just now.",
    };
  }
}
