# Stage 30 — phase snapshots and automatic retention

## Delivery status

Application changes are local, uncommitted and undeployed by this task.
Database changes and the scheduler **are applied and active** in the existing shared
Supabase project `pdfjowowhmzesaqntpsj` (AAW Football Desk).
No production environment setting was changed. Live and local participation endpoints
were checked: `available:false`. Only the exact server value
`AAW_AUDIENCE_PARTICIPATION_ENABLED=true` permits submissions.

No game opinions, favourites or genuine season-end dates have been seeded.
All synthetic SQL fixtures, including confirmed test dates, were rolled back.

## Phase decisions and storage

Stage 26 canonical context determines phase, using verified event ID, league,
season, season type, team IDs, kickoff and recognised source status:

- Scheduled with a future kickoff: `pregame` (Anticipation).
- In progress, halftime or end of period: `live` (Reaction).
- Explicitly final/completed: `postgame` (Opinion).
- Postponed, cancelled, uncertain, stale, contradictory or unavailable: no new opinion.

Passing kickoff never implies live. Disappearing from the scoreboard never implies
final. Rescheduled events keep their canonical ID. Regular/postseason metadata is
verified, not supplied by the browser. A new phase cannot regress behind an already
stored later phase; uncertain source regressions are rejected pending review.

There is one latest row per participant/game/phase in `hub_audience_game_phases`,
at most three per game, alongside Stage 29's single latest overall current tier.
Current and phase updates are atomic. Changes within a phase replace its row;
later phases leave earlier opinions intact. Replaying an identical request after
a phase transition does not create a new snapshot. No retrospective phase backfill
or interaction log exists. Existing tier controls remain unchanged.

Server source observations are retained with their original check time even when
metadata is reused within the existing 30-second cache. The database rejects
phase observations older than 60 seconds. HTTP response freshness is not proof
of upstream publication time, which remains unavailable.

No arbitrary postgame closing deadline was introduced. The verified season-plus-90-day
retention boundary is the only season eligibility close; expired seasons cannot
receive replacement contributions after purging.

## Clear/removal/withdrawal

Individual removal deletes the owned current tier and **all** that game's phases.
It needs no ESPN phase lookup: the cookie/consent-bound database verifies prior
owned identity; removing a nonexistent owned selection is an idempotent no-op and
never creates invented game records or ordering metadata.

League-wide clear deletes current and phase rows subject to existing latest revisions,
so a delayed clear cannot delete a newer selection. It uses verified directory season
metadata for its clear-barrier retention. If ESPN is unavailable, existing verified
database seasons can establish the barrier; if neither is available it fails safely,
leaving the existing local-only warning/retry behaviour intact. No guessed season is used.

Withdrawal cascades through phases, current tiers, favourites, ordering metadata and
consent in the same participant deletion transaction. Phase/current writes take the
same participant advisory lock and recheck the consent receipt. In-flight requests
cannot recreate a deleted browser identity.

Stage 29 eligibility boundaries remain: no upload on opt-in, hydration, cross-tab
sync, re-render, defaults, deck overlays, presets, sharing or exports. Payloads still
reject browser phase/status fields. No GA4, audience percentages, dashboards or accounts.

## Authoritative season end

ESPN's season envelope `endDate` is a calendar window, not sufficient evidence of
the final postseason game's completion. No automatic date inference uses it.
Instead an authenticated administrator confirms the **actual end of all postseason
play** using an official NFL, NCAA, CFP or ESPN HTTPS reference.

`POST /api/admin/audience/season-ends` requires the existing Export Studio HTTP Basic
password (username `aaw`) **even in local development**, same origin, strict JSON
up to 2 KiB, a completed postseason acknowledgement, and a past valid season-end
timestamp. The confirmation time is server-generated. The official link is recorded
as human verification evidence, not automatically certified by fetching a URL.

Shape (replace placeholders with verified facts; do not copy test fixtures):

```json
{
  "league": "NFL",
  "season": 2026,
  "endedAt": "ACTUAL_VERIFIED_ISO_TIMESTAMP_AFTER_POSTSEASON",
  "reference": "OFFICIAL_HTTPS_SOURCE_URL",
  "postseasonComplete": true
}
```

Use the equivalent `CFB` confirmation only after **all** relevant postseason play ends.
There is no public editing or new account. A matching repeated confirmation is safe;
a different date/reference returns 409 and requires a separately reviewed controlled
correction, rather than silently shortening a deletion deadline. Dates cannot be
confirmed in advance. After deployment, the same protected endpoint's GET returns
confirmation records and minimal retention operational status, not audience reporting.

Until the application is deployed, this endpoint is local only. The existing database
function can also be called by a trusted administrator in Supabase SQL Editor, but
the season/source must still be explicitly verified. Do not rerun migration scripts
or bypass the confirmation checks to populate dates.

## Retention implementation

Expiry is the confirmed season-end instant plus **2160 hours (90 exact UTC days)**,
independent of DST. SQL confirmation constraints and the existing Stage 26 helper
enforce that boundary. Unknown/unconfirmed ends never trigger deletion, even if a
row's nullable expiry field is mistakenly populated. The job uses the authoritative
registry, not those fields alone.

The existing database `pg_cron` extension is enabled. Job `hub-audience-retention`
runs at minute 17 of every hour, GMT/UTC, calling `hub_audience_run_retention()`.
No visitor, Vercel request, secret-bearing HTTP call or additional paid service is needed.
No Vercel cron or all-time refresh configuration was changed.

Each run processes at most 200 eligible participants, skips busy participant locks,
and retries skipped/backlogged data on later runs. Deletion is due at exact expiry;
execution normally occurs within the following hour, with additional delay possible
for contention, backlog, project downtime or failures. A Free project pause can delay
jobs: check operational timestamps before launch and during operation.

Each participant's purge is atomic. A failing participant rolls back without blocking
successful purges of others. Subsequent runs retry it. A wider failure rolls the batch
back and records a generic failure, not personal IDs or error payloads.

Deleted once verified expiry is due:

- Current individual game tiers for the league/season.
- All individual phase records for that league/season.
- Current individual favourites for the league/season.
- Corresponding selection revisions and deletion/clear tombstones.

Clear barriers carry a verified season. Legacy unknown-season ordering metadata uses
only confirmed expired league cutoffs and its revision instant for safe removal; it is
not retained indefinitely after a defensible cutoff. Non-personal league-level expiry
cutoffs reject old replayed requests after ordering records are deleted, preventing
resurrection without an indefinite participant-linked watermark.

No new empty favourite tombstone is created for a never-contributed removal.
Future individual contribution types must extend both cascading withdrawal and this
verified-season purge; they are not automatically covered merely by adding a table.

## Consent, participation and operational records

Consented participation/consent records are **not** purged on football season expiry.
They support the existing consent-until-withdrawn contract and are deleted on withdrawal.
Legal accountability, abandoned consent and lost/expired-cookie record retention need
a separate approved privacy policy; this stage does not invent a legal retention term
or claim GDPR approval. The existing one-year cookie lifetime is not a contribution
retention deadline and does not silently expire consent in the database.

Unconsented preparation records still use their established 15-minute lifetime and
are cleaned in bounded batches. Old per-participant rate counters are reset. Local
tiers/favourites are untouched by any server retention job.

Operational evidence is one fixed private row containing last attempt/success/failure,
deleted category counts, failed-participant count and skipped-busy count—no participant
identifiers or opinions. Own cron run logs are kept for 30 days; other applications'
jobs/logs are untouched. Inspect both the operation status and scheduler logs: a SQL
invocation alone is not proof that every eligible participant was successfully purged.

## Migration and verification evidence

Applied shared-database migrations:

- `hub_audience_phases_and_retention`
- `hub_audience_retention_schedule`
- `hub_audience_owned_phase_removals` (reviewed removal correction).
- `hub_audience_phase_locked_freshness` (rechecks observation age after lock waits).

The combined fresh-install SQL follows the repository's existing standalone SQL
convention. Supabase CLI was unavailable; no package was installed. Do not rerun
the scripts against the already-migrated project.

New tables: `hub_audience_game_phases`, `hub_audience_season_ends`, and
`hub_audience_retention_operation`. RLS is enabled, public/anon/authenticated grants
are revoked, and the new RPCs are server-role only, SECURITY INVOKER, with fixed empty
search paths. Participant-first phase keys index cascading deletion; season indexes
support purges. Existing public data pipelines/tables were not changed.

98 automated tests, TypeScript and the production build passed. SQL tests passed in
rolled-back transactions before and after migration: three-phase preservation,
within-phase replacement, idempotent replay, current/phase consistency, clear barriers,
removal, withdrawal, expired-season rejection, exact due boundaries, unknown-end safety,
forced per-participant failure, rollback, retry and idempotency. Synthetic dates/data
were not retained.

An actual autonomous scheduler verification ran the retention function successfully
at **2026-10-12 23:12:00 UTC**, with zero failures, skipped locks or deletions. Its
temporary once-only verification job removed itself. The persistent hourly job is active.
This verifies real database scheduling, not just a manual function call. With collection
disabled and no confirmed genuine season ends, no production opinions were deleted.

Security advisor returned only informational default-deny/no-policy notices for private
server-only tables ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
Local unauthenticated season-end API returned 401. Live/local participation remained
unavailable. Existing game, preference, navigation and admin regression coverage passed.

Public launch remains blocked pending privacy/consent approval, separate consent-record
retention decision, full security sign-off, enabled HTTPS/mobile/multi-tab lifecycle tests,
and real-browser end-to-end withdrawal. No production environment flags were changed.
No Stage 31 work was begun.

## Changed files

- `app/api/audience/contributions/route.ts`
- `app/api/admin/audience/season-ends/route.ts`
- `app/lib/audience-contributions.ts`, `audience-validation.ts`, `audience-phases.ts`,
  `audience-season-end.ts`, `participation-store.ts`
- `proxy.ts`
- `supabase/hub-audience-phases-retention.sql`, `hub-audience-retention-schedule.sql`
- `tests/audience-contributions.test.mjs`, `audience-phase-context.test.mjs`,
  `audience-phases-retention.sql`
- `docs/audience-collection.md` (historical note), this handoff.
