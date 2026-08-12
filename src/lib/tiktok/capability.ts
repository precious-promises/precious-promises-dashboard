import type { SocialAccount } from "@/lib/accounts/types";
import { getLiveCredential } from "@/lib/accounts/credentials";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";

import { fetchCreatorInfo } from "./api";
import type { DeliveryMode, PrivacyLevel } from "./config";
import { canDirectPost, canUploadToDrafts } from "./oauth";
import { resolveTikTokConfig } from "./server-config";
import type { CreatorInfo } from "./types";

/**
 * What this TikTok connection can actually do, right now.
 *
 * The interface needs this before it can offer a single control, because of
 * TikTok's central restriction: **an application may only offer a privacy level
 * TikTok returned for that specific creator.** An unaudited API client is not
 * given the public options at all, so a "Post publicly" control built from a
 * hardcoded list would be a button that always fails.
 *
 * So the options are read from TikTok, per creator, at the moment they are
 * needed — and when they cannot be read, the interface offers nothing and says
 * why rather than falling back to a guess.
 */

export interface TikTokCapability {
  /** Whether a TikTok account is connected at all. */
  connected: boolean;
  /** Delivery modes this connection could actually carry out. */
  availableModes: DeliveryMode[];
  /**
   * The **only** privacy levels that may be offered.
   *
   * Empty when TikTok could not be asked. Empty is not "all of them".
   */
  privacyLevelOptions: PrivacyLevel[];
  /** Interaction settings the creator has switched off account-wide. */
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
  handle: string | null;
  /** Why something is unavailable, in words the owner can act on. */
  problems: string[];
}

/** Manual posting is always available: it sends nothing and needs nothing. */
function base(): TikTokCapability {
  return {
    connected: false,
    availableModes: ["manual"],
    privacyLevelOptions: [],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoPostDurationSec: null,
    handle: null,
    problems: [],
  };
}

/**
 * Ask TikTok what the owner's connection can do.
 *
 * Reads the account through the owner's own session — so a page rendering this
 * proves ownership the same way every other page does — then uses the worker
 * credential only to open the encrypted token, which is the one thing a session
 * cannot reach.
 */
export async function loadTikTokCapability(): Promise<TikTokCapability> {
  const capability = base();

  const { config, problems } = resolveTikTokConfig();
  if (config === null) {
    capability.problems.push(...problems);
    return capability;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return capability;
  }

  const { data } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("owner_id", user.id)
    .eq("platform", "tiktok")
    .neq("status", "disconnected")
    .limit(1)
    .maybeSingle();

  const account = (data as SocialAccount | null) ?? null;

  if (account === null) {
    capability.problems.push(
      "No TikTok account is connected, so nothing can be sent to TikTok.",
    );
    return capability;
  }

  capability.connected = account.status === "connected";
  capability.handle = account.handle;

  if (account.status !== "connected") {
    capability.problems.push(
      "The TikTok connection needs to be re-established before anything can be sent.",
    );
    return capability;
  }

  if (canUploadToDrafts(account.granted_scopes)) {
    capability.availableModes.unshift("inbox");
  } else {
    capability.problems.push(
      "The connection was granted without upload permission, so videos cannot be sent to your TikTok drafts.",
    );
  }

  if (!canDirectPost(account.granted_scopes)) {
    capability.problems.push(
      "The connection was granted without publish permission, so nothing can be posted directly.",
    );
    return capability;
  }

  // Direct posting needs both the scope *and* an audience TikTok will accept.
  // The scope alone is not enough, so the options are read before the mode is
  // offered at all.
  const { client } = createWorkerClient();
  if (client === null) {
    capability.problems.push(
      "No trusted server credential is configured, so TikTok could not be asked what this account may post.",
    );
    return capability;
  }

  const credential = await getLiveCredential(client, account);
  if (!credential.ok) {
    capability.problems.push(credential.reason);
    return capability;
  }

  let creator: CreatorInfo;
  try {
    creator = await fetchCreatorInfo({
      accessToken: credential.credential.accessToken,
    });
  } catch {
    capability.problems.push(
      "TikTok could not be asked what this account is allowed to post, so no audience can be offered. Try again shortly.",
    );
    return capability;
  }

  capability.privacyLevelOptions = creator.privacyLevelOptions;
  capability.commentDisabled = creator.commentDisabled;
  capability.duetDisabled = creator.duetDisabled;
  capability.stitchDisabled = creator.stitchDisabled;
  capability.maxVideoPostDurationSec = creator.maxVideoPostDurationSec;

  if (creator.username !== "") {
    capability.handle = `@${creator.username}`;
  }

  if (creator.privacyLevelOptions.length === 0) {
    capability.problems.push(
      "TikTok returned no audience options for this account, so a direct post cannot be prepared.",
    );
    return capability;
  }

  capability.availableModes.unshift("direct_post");

  if (
    creator.privacyLevelOptions.length === 1 &&
    creator.privacyLevelOptions[0] === "SELF_ONLY"
  ) {
    // The audit restriction, stated as a fact rather than discovered as a
    // failure. It is not an error — it is what TikTok currently permits.
    capability.problems.push(
      "TikTok offers only the private audience for this account. That is what an API client which has not passed TikTok's audit is limited to: a direct post would be visible to you alone.",
    );
  }

  return capability;
}
