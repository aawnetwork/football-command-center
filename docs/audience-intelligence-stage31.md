# Stage 31 — Admin Audience Intelligence handoff

Verified 13 October 2026 against `/Users/fletch/Desktop/AAW Football Hub` and the existing shared Supabase project `pdfjowowhmzesaqntpsj`.

## Delivery status

- Application implementation is local and uncommitted. No Git push or Vercel deployment was performed.
- Database migration `hub_audience_private_report` was applied: one read-only aggregate function, no new tables, records, indexes or collection mechanisms.
- Public participation remains disabled. No environment configuration, authentication, consent, retention policy or football pipeline was changed. No Stage 32 work was started.
- No packages or additional paid infrastructure were introduced.

## Implemented interface

Existing `/admin/user-stats` now contains overview, separate NFL/CFB favourite-team tables, paginated game-opinion exploration, and operational retention/season-end visibility. Existing Admin Centre navigation remains intact. There are no enablement, contribution-editing or season-confirmation controls.

League/season filters apply to contribution overview and favourites. Active participating browsers remains an explicitly labelled global metric. Game, current/phase view and phase filters apply to game exploration only. Favourite sorting supports popularity and alphabetical order. Game lists are limited to 10 per page; pagination offsets are bounded to 10,000. Season inputs are restricted to 2000–2100, league/phase/view/sort values are enumerated, and canonical game identifiers must agree with league/season filters. Unknown and repeated parameters are rejected.

Game metadata is requested only when an administrator explicitly selects one game, not for all rows. The existing canonical summary validator checks league, season, event, teams, status and freshness. Missing, uncertain or stale metadata retains the canonical identifier and labels matchup/status/kickoff as unverified. Rescheduling does not change the identifier. Favourite names/logos use exact team IDs within their league, with existing dark-logo preference; missing or ambiguous metadata falls back to the canonical ID. Team directories are metadata-only and cached for five minutes.

## Exact metrics and denominators

- **Active participating browsers:** count of current unwithdrawn consent records, globally. Not unique people, visits, recent activity, or an inferred number of fans. Consent retained after season-data expiry still counts; existing consent retention was not changed.
- **Current game ratings:** current retained participant/game rows within league/season scope. This is a contribution count, not a unique-browser total across games.
- **NFL/CFB favourites:** current retained favourite selections in each league within scope. One current favourite per participating browser per league, separate denominators, no unselected vote.
- **Games receiving contributions:** distinct canonical game IDs across retained current and phase records within scope; a game appearing in multiple phases counts once.
- **Pregame/live/postgame:** each phase's retained snapshot-row count; not summed as unique participating browsers.
- **Latest retained contribution:** maximum retained contribution timestamp across current ratings, favourites and phase records within scope. It is not a durable historical activity log; removed/expired activity disappears.
- **Game distribution:** count of each S–D tier in the selected sample; denominator is that sample's row count. Primary keys enforce one row per participating browser/game/current sample or participating browser/game/phase. Each phase is separate, and respondents can differ.
- **Percentages:** tier count/sample count or favourite-team count/that league's favourite count, displayed to one decimal place. Zero denominators show a dash, never fabricated percentages. Samples below 25 are marked **Insufficient sample**. Counts and denominators remain visible privately.

No visitor totals, conversion rates, activity trends, paired individual opinion transitions, or statistical significance claims were added. Existing records do not establish a reliable complete time series.

## Security, privacy and deletion

The page retains `requireAdmin()` plus the existing proxy and production HTTP Basic password boundary. The new `/api/admin/audience/report` GET endpoint independently validates the existing Basic credential even if proxy protection is bypassed; it has no local anonymous bypass. The page retains the pre-existing development/localhost exception. The local configuration currently has no admin password, so local SSR page viewing works through that existing exception; direct reporting API access remains denied without a configured credential.

The database function is SECURITY INVOKER with an empty search path. EXECUTE is revoked from PUBLIC, anon and authenticated, and granted only to service_role. Existing audience tables retain RLS and their server-only grants. The report uses the existing server-only RPC connection. Neither HTML nor API payloads include participant IDs, token hashes, consent receipts, cookies, revisions, fingerprints or individual histories. The only identifiers exposed are public canonical game/team identifiers.

Reporting responses are private/no-store. There is no browser access to raw audience tables, public reporting endpoint, aggregate cache, polling, tracking or GA4 activation. Refresh/filter navigation requests fresh live aggregates; no permanent reporting copies are made.

All contribution queries require current consent and exclude expired `delete_after_at` rows AND expired confirmed season-registry rows. Thus expired data is excluded even before an hourly purge stamps/removes it. Withdrawal cascades are reflected on the next report request. The dashboard does not automatically poll or update an already-open view without a refresh.

## Operational and empty-data behaviour

Participation state is read from the existing server flag. Retention exposes only status, last success and last failure. Season entries show confirmed ends/expiries or unknown confirmations for recorded seasons. If no seasons exist, both leagues remain explicitly unconfirmed; no calendar-based end is invented.

The actual shared database currently contains zero participants, consents, current ratings, phase snapshots, favourites and season-end confirmations. Retention has a recorded success. The browser shows the disabled-collection explanation and genuine zero values. Database failure instead produces an unavailable/retry error, not fake zeros; the reporting API returns 503.

## Files

Modified:

- `app/admin/page.tsx` — reporting link description.
- `app/admin/user-stats/page.tsx` — protected server-rendered dashboard.
- `app/components/admin-centre.css` — scoped responsive dashboard styling.
- `app/lib/participation-store.ts` — permit the private aggregate RPC name.

Added:

- `app/api/admin/audience/report/route.ts` — independently protected read-only API.
- `app/lib/audience-report.ts` — typed aggregate contract, strict filters, percentages, sample labels and sorting.
- `app/lib/audience-report-store.ts` — server aggregation and bounded optional canonical metadata enrichment.
- `supabase/hub-audience-report.sql` — applied function and restrictive grants.
- `tests/audience-report.test.mjs` — five focused automated tests.
- `tests/audience-report.sql` — transactionally rolled-back integration fixtures.
- This handoff.

## Verification evidence

- Full automated suite: **103 passed, 0 failed**. Includes existing tiers, sharing/decks, export security, canonical context, phase/retention, participation, navigation and football regressions.
- TypeScript: `npx tsc --noEmit --incremental false` passed.
- Production build: passed. Existing caught dynamic-render diagnostics from NFL performances and season-stats routes remain; no new build failure.
- SQL fixtures: passed inside BEGIN/ROLLBACK, using service_role. Verified consent counts, separate favourite denominators, current S–D counts, distinct games across multiple phases, phase isolation, filters/pagination, registry expiry before purge, withdrawal cascades, invalid SQL arguments and aggregate-only response keys.
- Post-test read confirmed zero fixture rows remain. No synthetic data was published.
- Database grants verified: anon/authenticated cannot execute reporting; service_role can. Existing raw table grants unchanged.
- Empty-data EXPLAIN ANALYZE: approximately 7.7 ms on the actual shared database. This is not a populated-data load test; existing league/season and participant indexes are reused.
- Security advisor: only existing informational RLS-with-no-policy notices, consistent with deliberately server-only tables; no new exposed function finding. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Production-mode local server with an ephemeral process-only password: `/admin`, `/admin/user-stats`, `/admin/decks`, `/admin/exports` and `/api/admin/audience/report` all returned **401 anonymously / 200 authenticated**. The temporary server was stopped; no password was stored or changed.
- Local direct reporting API returned 401 anonymously, even with the development proxy exception.
- Local production-mode participation endpoint reported `available:false`.
- Browser checks: desktop and 390px mobile empty dashboard, CFB/live filtering, conditional phase controls, navigation and keyboard focus. No public participation was enabled.

## Limitations and release readiness

Ready for review and an explicitly approved deployment. Live production browser verification remains outstanding because this task did not deploy. Populated-data visual review with real contributions remains outstanding while collection is disabled; SQL fixtures and mocked metadata tests establish counts/lookup/failure behaviour without leaving synthetic records. Existing Presets/Exports protected page access and regressions passed; no new deck publication or PNG-generation workflow was performed during Stage 31.

No reliable historical trends or individual transitions are available and none were fabricated. When canonical metadata fails, opinion counts remain available with explicit identifier/unverified fallbacks. This is intentional rather than a reason to enable collection or create a new pipeline.
