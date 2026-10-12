# Stage 29 — current audience selections

This is the Stage 29 delivery record. [Stage 30](./audience-phase-retention.md)
supersedes its pending phase/retention implementation statements.

## Release status

Application implementation is local only: not committed or deployed by this task.
Public collection remains disabled. The existing live participation endpoint was
checked and returned `available:false`. Production environment settings were not changed.

Only the exact server environment value `AAW_AUDIENCE_PARTICIPATION_ENABLED=true`
enables participation and contribution endpoints. Missing, `false`, `TRUE`, or `1`
does not. Do not enable this flag until privacy wording, retention enforcement,
security review and real-browser enabled-cookie/lifecycle tests are approved.

## Submission boundaries

NFL and CFB personal `setGameTier` and `clearGameTiers` handlers submit deliberate
changes. The CFB loaded-deck branch returns before any personal contribution.
Preferences submits favourites only from its explicit `change` handler.
LocalStorage hydration, cross-tab preference sync, rerenders, defaults, curated
presets, sharing and exports have no contribution path. Opt-in performs no bulk
upload. There is no persisted submission queue or background retry.

Local choices update immediately. Only active, operational participation can send
an event; browser withdrawal markers are checked again immediately before fetch.
Failures show a dismissible warning without rolling back local choices. Withdrawal
aborts pending work; failed deletion remains pending with the existing retry action.

## Server validation and ordering

`POST /api/audience/contributions` accepts strict JSON up to 2 KiB. It checks
same-origin, the server flag, the HttpOnly cookie, active consent, and a random
per-consent receipt. The receipt is not a participant ID, token or authentication
credential; it prevents a delayed earlier-opt-in action using a replacement cookie.

Game submissions are verified against ESPN event summaries, through Stage 26's
normalizer: exact event ID, league, season, regular/postseason type, teams, kickoff
and recognised status. Uncertain, postponed, cancelled, malformed or mismatched
contexts are rejected. Completed and valid rescheduled events retain their identity.
Favourites use exact team IDs in the existing NFL/FBS standings metadata and its
server-supplied season. Removal of a favourite or all owned league tiers requires no
speculative feed lookup. Individual tier removal still verifies the event.

HTTP Date/Age guards reject missing/stale responses. This is verification freshness,
not proof of upstream publication time. On-demand metadata is shared/cached for
30 seconds, bounded to 256 entries. No polling or extra page-load ingestion exists.

The database gate limits each consenting browser to 120 requests/minute before
external validation. Browser Web Locks plus a local monotonic counter order actual
actions across tabs; unsupported locks/storage or significant clock skew fail safely.
The counter is not an identity or a selection backlog. Database per-key revisions
reject older/conflicting writes. Equal identical retries leave timestamps unchanged.
League-wide clear barriers prevent late requests restoring cleared tiers without
removing newer deliberate selections. The final write and withdrawal take the same
participant advisory lock, recheck consent, and never insert a participant.

## Database changes

Applied to existing shared Supabase project `pdfjowowhmzesaqntpsj` (AAW Football Desk),
not a local database:

- `hub_audience_current_selections`
- `hub_audience_selection_clear_order` — final reviewed duplicate/clear ordering correction.

Combined fresh-install SQL is `supabase/hub-audience-selections.sql`, following the
repository's standalone participation SQL convention. No Supabase CLI was available;
no package was installed. Do not rerun the fresh-install script against this project.

Three new private tables: `hub_audience_game_tiers`, `hub_audience_favourites`, and
`hub_audience_selection_versions` (latest ordering metadata/deletion tombstones,
not opinion history). All reference the participant with `ON DELETE CASCADE`; their
participant-first primary keys index withdrawal relationships. RLS is enabled,
public/anon/authenticated grants are revoked, and only server service-role access
and narrowly named RPCs are permitted. No individual data has a public read endpoint.

Existing consent gains a random receipt; participants gain a bounded rate counter.
The participation state RPC returns the receipt to its cookie-owning browser.
Current selections are replaced, not appended. Clear/remove deletes selections;
withdrawal also deletes every ordering record and consent. Rejoining creates a new
identity with no restoration of earlier choices.

Nullable `delete_after_at` fields and canonical seasons prepare retention, but no
authoritative season end or retention job is invented. Favourite replacement resets
its future expiry for its newly verified season. Retention of contributions and
ordering metadata must be enforced before public launch.

## Verification

- Full automated suite: 91 passed; TypeScript and production build passed.
- Actual-hook tests: no pre-consent/opt-in upload; deliberate tiers/favourites,
  replacements/removals, sync without submissions, failed requests, unsupported
  ordering/storage, offline withdrawal, rejoin and aborted in-flight work.
- Route/normalizer tests: server flag, CSRF, cookies, bounds, invalid identities,
  regular/postseason, rescheduling, uncertain/stale/unavailable metadata, idempotency,
  safe responses and consent rechecks.
- `tests/audience-selections.sql` executed transactionally and rolled back: consent,
  uniqueness, replacements/removals, reversed request order, clear barriers, rate
  limits, cascade deletion, rejected post-withdrawal writes and rejoin isolation.
- Live schema permissions/RLS verified. Security advisor reports only informational
  default-deny/no-policy notices for these private server-only tables; deliberately
  no public policy was added. See the [Supabase notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- All three new tables have zero retained records after testing.
- Local browser smoke checks cover disabled Preferences, favourite selection/removal,
  tier persistence through refresh and NFL/CFB navigation. Normal local development
  admin bypass is unchanged; production protection logic/regression tests unchanged.

Outstanding: enabled HTTPS cookie and contribution lifecycle in actual supported
browsers/mobile, real multi-tab/network-failure testing, privacy/security approval,
and season-plus-90-day retention enforcement. No GA4, public statistics, reports,
phase history, accounts, retrospective upload or Stage 30 work is implemented.

## Files

- `app/api/audience/contributions/route.ts`, `app/api/audience/participation/route.ts`
- `app/lib/audience-contributions.ts`, `app/lib/audience-validation.ts`
- `app/lib/participation-contract.ts`, `app/lib/participation-store.ts`
- `app/features/preferences/useParticipation.ts`, `HubPreferences.tsx`
- `app/cfb/page.tsx`, `app/nfl/page.tsx`
- `supabase/hub-audience-selections.sql`
- `tests/audience-contributions.test.mjs`, `tests/audience-selections.sql`
- This operational handoff.
