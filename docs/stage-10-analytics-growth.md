# Stage 10 — Analytics & Growth Centre

Stage 10 reads back what happened after publishing, and turns it into
observations Dave can act on. It adds no new way to publish and no new way to
approve.

Everything in this stage rests on one distinction:

> **Zero is a measurement. Absence is not.**

A post with no views has `0`. A post whose figures have never been fetched, or
whose platform does not report that metric, or whose connection lacks the
analytics permission, has **nothing** — and shows a dash, with the reason
stated. The two are never allowed to look alike, because a dashboard that
prints `0` for "I don't know" teaches its owner that his ministry is failing
when in fact an API call did not run.

---

## 1. How that distinction is enforced

Not by convention. By type.

```ts
export type MetricReading =
  | {
      kind: "measured";
      value: number;
      source: MetricSource;
      rawName: string;
      observedAt: string;
      window: ObservationWindow;
    }
  | { kind: "unavailable"; reason: UnavailableReason; detail: string };
```

`src/lib/analytics/types.ts`. There is no third shape, no `value: number | null`
and no default. A caller cannot read `.value` without first narrowing on
`kind`, which means the compiler refuses to let anyone treat an absence as a
number. `formatReading()` prints an em dash for every `unavailable` variant and
a digit for every `measured` one — including a genuine `0`.

The seven reasons an absence can have:

| Reason                         | Means                                                     |
| ------------------------------ | --------------------------------------------------------- |
| `platform_not_connected`       | No connected account for this platform                    |
| `analytics_permission_missing` | Connected, but the consent does not cover analytics       |
| `provider_not_supported`       | No analytics adapter exists for this platform             |
| `not_yet_fetched`              | Authorised, but nothing has been read yet                 |
| `fetch_failed`                 | The last attempt failed; any earlier reading still stands |
| `metric_unsupported`           | The platform does not report this metric at all           |
| `post_unavailable`             | The platform can no longer find the post                  |

Each one produces different words on screen and, where relevant, a different
thing to do about it.

---

## 2. What each platform actually reports

Read from official documentation in August 2026. The capability matrix in
`src/lib/analytics/providers.ts` is the single place that decides whether a
metric can be asked for at all.

### YouTube — `yt-analytics.readonly`

Views, watch time, average view duration, likes, comments, shares, subscribers
gained, through the YouTube Analytics API.

**It needs a scope publishing does not have.** Stage 7 requested `youtube.upload`,
`youtube.readonly` and `youtube` — none of which grants analytics. So Connected
Accounts offers an explicit **"Grant analytics access"** re-consent that requests
the publishing scopes _plus_ `https://www.googleapis.com/auth/yt-analytics.readonly`.

Nothing broadens silently. Until Dave grants it, YouTube analytics reports
`analytics_permission_missing` and publishing continues to work exactly as
before. **A publishing connection is never read as analytics authorisation** —
`assessAnalyticsReadiness()` checks the granted scopes, not the connection
status.

`saves` and `reach` are absent from YouTube's matrix. YouTube has no
equivalent; asking would return an error, not a zero.

### Instagram — no second consent

Views (which replaced `impressions` for media created after 2 July 2024), reach,
likes, comments, shares and saves, through Instagram Insights on the same
Business Login connection Stage 8 established. `additionalScopes` is `[]`, and
the interface does not nag for a consent screen that does not exist.

**No watch time.** Meta exposes no watch-time or average-watch-time metric
through this API, so no watch time is shown for Instagram — rather than a zero,
or a YouTube figure quietly filling the column.

Accounts under 100 followers may receive no insights at all; Meta retains
user-level insight data for 90 days. Both are absences, reported as such.

### TikTok — not supported, deliberately

TikTok's Display API (`video.list` / `video.query`) returns **metadata only**:
id, title, description, duration, cover image, embed link, share URL. View,
like, comment and share counts live in TikTok's **Research API**, which is
restricted to qualifying academic institutions and registered non-profits with
an approved research proposal and ethical review.

Precious Promises would not qualify. **No TikTok analytics connector has been
built**, and the interface says why in plain words rather than showing an empty
chart. Figures may be entered by hand, and are labelled as manual wherever they
appear.

---

## 3. Storage

`supabase/migrations/20260812120000_create_analytics_and_growth.sql`.

| Table                     | Holds                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| `analytics_snapshots`     | One observation of one post, in one window, from one source               |
| `analytics_metrics`       | The individual figures on a snapshot, with the platform's own metric name |
| `analytics_sync_runs`     | Every fetch attempt, its outcome and its error category                   |
| `growth_goals`            | Targets Dave set                                                          |
| `growth_experiments`      | Hypotheses, written before looking                                        |
| `growth_experiment_posts` | Which posts belong to which experiment                                    |

Plus two columns on `scheduled_posts`: `external_availability` and
`external_checked_at`.

Every figure carries **where it came from**: `source` on the snapshot
(`youtube_api`, `instagram_api`, `manual`) and `raw_metric_name` on the metric,
so `views_or_plays` can always be traced back to whichever of `views`,
`estimatedMinutesWatched` or `plays` the platform actually answered with.

### Snapshots are upserted, never deleted

The unique observation index is
`(owner_id, platform, external_post_id, source, observation_window,
observed_on_utc)` — the last a stored generated column holding the UTC day of
`observed_at`, kept as a real column because `ON CONFLICT` must name every
column of the index and can name only columns, not expressions. The same post
observed twice in a day updates in place; observed tomorrow it becomes the
next point in the series.
That is what makes "first 24 hours" and "growth over time" both answerable from
one table.

**Nothing in `src/lib/analytics/` calls `.delete()`.** A failed fetch writes to
`analytics_sync_runs` and leaves the data alone, so an outage looks like an
outage rather than a collapse in performance.

---

## 4. A browser cannot manufacture API data

This is enforced in the database, not in the form.

`analytics_snapshots` has separate policies for reading and writing. The browser
insert policy is:

```sql
create policy "Owners can record manual analytics only"
  on public.analytics_snapshots for insert to authenticated
  with check ((select auth.uid()) = owner_id and source = 'manual');
```

A signed-in owner can insert `source = 'manual'` and nothing else. A request
claiming `youtube_api` or `instagram_api` is refused by Postgres regardless of
what the client sends. API-sourced rows are written only by the worker
credential, which the browser never holds.

`analytics_sync_runs` has a **SELECT policy only** — the owner can read the
history of fetch attempts and cannot fabricate one.

The manual-entry schema in `src/lib/analytics/manual.ts` has **no `source`
field at all**. There is no shape of form submission that carries one; the
constant `MANUAL_SOURCE` is applied server-side. Manual figures are stored as
their own snapshot rows and therefore **never overwrite an API snapshot** — the
unique index includes `source`, so the two series sit side by side and the
interface labels which is which.

---

## 5. Fetching

`src/lib/analytics/sync.ts`.

The order of checks matters: capability, then adapter, then worker credential,
then connected account, then **analytics scopes**, then posts, then the live
token. Each failure returns a distinct category, and the ones that mean "ask
Dave for something" are separated from the ones that mean "try again later".

Observation windows are only requested once they have **closed** —
`windowsDueFor()` will not ask for "first 7 days" on a post published
yesterday, because a partial window reported as a 7-day figure is a wrong
number rather than an early one.

### Scheduled and manual paths are independent

- **Scheduled**: `src/trigger/analytics.ts` — `analytics-daily-sync`, a
  Trigger.dev `schedules.task` on `15 5 * * *` UTC, fanning out to
  `analytics-sync-one` per owner.
- **Manual**: the **Refresh now** button on the Analytics page calls a server
  action that runs the same orchestration directly.

No Trigger.dev project is connected to this repository. `analyticsSchedulingConnected()`
reports that plainly, and the manual refresh **does not depend on it** — Dave
should not have to deploy a scheduler to see his own figures.

No claim is made about how quickly a platform makes figures available. Provider
timing is not documented consistently and is not invented here; the interface
reports when _we_ last fetched, not when the platform last computed.

### Freshness is always stated

Every figure is shown with `describeFreshness()` beside it — "Never fetched",
"3 hours ago", "12 days ago" — and `isStale()` marks anything old enough that
the number should be read with care. A figure with no timestamp beside it would
be a figure with no meaning.

---

## 6. A deletion at the platform is not a change to history

If YouTube or Instagram can no longer find a post, `markExternalAvailability()`
sets `external_availability = 'unavailable'` and `external_checked_at`.

**It touches nothing else.** Not `status`, not `external_post_id`, not
`posted_at`. The post _was_ published — that is a historical fact, and a third
party deleting the video later does not unmake it. Every snapshot ever observed
for that post is kept, and the interface says the post is no longer reachable
rather than pretending it never went out.

---

## 7. Derived metrics

`engagements` and `engagement_rate` are the only computed metrics, and both
refuse to compute from incomplete input.

`deriveEngagements()` returns `unavailable` if **any** of the platform's
interaction metrics is missing — a sum over three of four inputs is not a
smaller number, it is a wrong one. Each platform has its own input set
(`ENGAGEMENT_INPUTS`), because Instagram has saves and YouTube does not.

`engagement_rate` refuses a denominator of zero and names the denominator it
used. Every derived metric publishes its formula in the interface.

---

## 8. Growth Centre

`/dashboard/growth`.

### Goals are targets, never predictions

`measureGoal()` returns `percent: null` when nothing relevant has been measured
— and the interface shows **"not yet measured"**, not `0%`. `describeProgress()`
contains no forecast: nothing says "on track", "projected" or "at this rate",
because none of those are things this system can know.

Goals are stored in their own table, apart from measured figures, so no chart
can plot an intention as an observation.

### Experiments are observational

An experiment records a **hypothesis written before looking** — that is what
separates an experiment from a story told afterwards about numbers that already
existed. `experimentReadiness()` decides whether there is enough evidence to say
anything, and **nothing computes a winner**. The owner writes the conclusion.

Confidence is capped at `moderate_evidence` for experiments regardless of
sample size, and `OBSERVATIONAL_NOTE` states the reason on screen: posts differ
in more than one respect, so a difference between them is an observation and not
a cause.

### Findings describe, they never explain

`describeFinding()` phrases every result as what the observed posts did.
Confidence has four levels, and the bottom two are not actionable. Below the
minimum comparable-post count, it says nothing at all.

### The weekly mission may decline

`buildWeeklyMission()` returns `null` unless something genuinely actionable
exists, and `missionAbsenceReason()` explains the absence in terms of the record
— "nothing has been published yet", "no analytics have been fetched" — never
with generic advice. A dashboard that invents "post more Shorts!" from three
data points teaches Dave to distrust it, and the moment a real finding appears
he will not believe that one either.

### Repurposing suggests and never acts

A repurpose candidate is a row in a list. `src/lib/growth/repurpose.ts` imports
nothing from `@/lib/approvals`, `@/lib/schedule`, `@/lib/publishing` or
Scripture, performs no writes, and is a pure function.

The only interactive element on a candidate is a **link back to the original
content item**. Producing, approving and scheduling remain exactly as they were,
with human approval mandatory before anything is published, and Scripture is
never altered by anything in this stage.

---

## 9. Audit

Nine new actions:

`analytics_sync_started`, `analytics_sync_completed`, `analytics_sync_failed`,
`analytics_permission_required`, `analytics_manual_entry_recorded`,
`growth_goal_created`, `growth_goal_updated`, `growth_experiment_created`,
`growth_experiment_completed`.

Each is genuinely written by the code path it names — the sync entries via
`recordAuditAsWorker()`, since the worker runs outside a request and the
session-backed `recordAudit()` would silently no-op there.

**Audit metadata carries counts only.** No metric values, no access or refresh
tokens, no provider payload dumps, no credential-bearing URLs. The audit log is
not a second and diverging copy of the analytics data.

---

## 10. What Stage 10 does **not** do

- **No TikTok analytics connector.** See §2.
- **No estimated, modelled or projected figures.** Nothing stores or displays a
  number the platform did not report or Dave did not type.
- **No demo data.** No sample chart, no synthetic history, no placeholder
  percentages anywhere in the production interface. An empty state says it is
  empty.
- **No silent scope expansion.** The YouTube analytics scope is requested by an
  explicit, separately labelled action.
- **No writes to publishing state.** Nothing in `src/lib/analytics/` sets a
  publish status.
- **No changes to Scripture.** Analytics and the Growth Centre read content
  records; they never edit them.
- **No live verification.** Every test runs against a fake platform. They prove
  the decision-making, **not** that any figure has been fetched from a live
  API. No analytics call has been verified against YouTube or Instagram.

---

## 11. Provenance

The YouTube Analytics API scope and metric set, the Instagram Insights metric
set and the `impressions` → `views` migration, and the TikTok Display API and
Research API restrictions were read from the official developer documentation
of each platform in August 2026:

- <https://developers.google.com/youtube/analytics>
- <https://developers.facebook.com/docs/instagram-platform/>
- <https://developers.tiktok.com/doc/>

Nothing here comes from a blog post or an unofficial client. Where official
documentation could not confirm a capability, it is not implemented and not
claimed — Instagram watch time and TikTok engagement counts are both absent for
that reason.
