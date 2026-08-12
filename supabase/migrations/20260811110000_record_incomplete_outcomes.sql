-- Stage 9: make an incomplete publish outcome visible.
--
-- Stage 6 named `ready_for_manual_post` and `uploaded_to_platform_draft` in
-- `scheduled_posts.status`, ready for a provider that could reach them. TikTok
-- reaches both, and Instagram reaches the draft state — so the gap now shows.
--
-- Two problems this fixes:
--
-- 1. **The attempt had nowhere honest to land.** Its statuses were started,
--    succeeded, failed, blocked and cancelled. A video that genuinely reached
--    the creator's TikTok drafts is none of those: `succeeded` would claim a
--    post nobody made, `failed` would claim the upload did not work, and
--    `blocked` means *this system* refused — the opposite of what happened.
--
-- 2. **The reason was thrown away.** The provider explains precisely what state
--    the post is in and what the owner has to do next, and there was no column
--    to keep it in. `last_error_message` was the only candidate, and a draft
--    upload that worked is not an error.

-- ---------------------------------------------------------------------------
-- publish_attempts.status: 'incomplete'
-- ---------------------------------------------------------------------------

alter table public.publish_attempts drop constraint if exists publish_attempts_status_check;

alter table public.publish_attempts
  add constraint publish_attempts_status_check check (
    status in (
      'started',
      'succeeded',
      'failed',
      'blocked',
      'cancelled',
      -- The provider genuinely finished, and what it finished is not a post.
      'incomplete'
    )
  );

-- An incomplete attempt must never carry a post id: there is no post. The
-- existing success constraint says a `succeeded` row needs one; this says the
-- reverse for the state that is most likely to be mistaken for success.
alter table public.publish_attempts
  drop constraint if exists publish_attempts_incomplete_has_no_post_id;
alter table public.publish_attempts
  add constraint publish_attempts_incomplete_has_no_post_id check (
    status <> 'incomplete' or external_post_id is null
  );

-- ---------------------------------------------------------------------------
-- scheduled_posts.outcome_detail
-- ---------------------------------------------------------------------------
--
-- What the provider said about a non-publication, in the owner's words rather
-- than an error code. Deliberately separate from `last_error_message`: this
-- column describes something that worked and stopped short, and merging the two
-- would make a successful draft upload read as a failure in every list.

alter table public.scheduled_posts
  add column if not exists outcome_detail text;

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_outcome_detail_length;
alter table public.scheduled_posts
  add constraint scheduled_posts_outcome_detail_length check (
    outcome_detail is null or char_length(outcome_detail) <= 1000
  );

comment on column public.scheduled_posts.outcome_detail is
  'Why a post stopped short of publication — a draft in the platform''s app, or a manual post awaiting the owner. Never an error, and never a credential.';

-- A published post has nothing left to explain, and a stale detail beside a
-- live post would be actively misleading.
alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_posted_has_no_outcome_detail;
alter table public.scheduled_posts
  add constraint scheduled_posts_posted_has_no_outcome_detail check (
    status <> 'posted' or outcome_detail is null
  );
