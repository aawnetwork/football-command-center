# Stats 2.0 Phase 2B — additive NFL server integration

20 October 2026. Local implementation only. No UI wiring, commit, push,
deployment, database access, CFB ingestion or provider requests in validation.
All validation requests use fixtures. Existing public endpoint response shapes
and polling/live-highlight semantics are preserved by regression tests.

## Read-only response

GET `/api/nfl/stats-v2` (REG/2026 only):

- `mode=weekly|season` (default weekly); optional weekly `week=1..18`.
- `season=2026` optional. Postseason/other years rejected, not silently coerced.
- `live=1|0` (default 1). Disabled mode does not request ESPN or schedule data.
- `view=data`: `offset=0..10000`, `limit=1..50` (default 25).
- `view=export`: required `category=QB|Rush|Rec|Def`, `statistic` from the
  foundation's category-specific whitelist; optional `direction=asc|desc`,
  canonical NFL `team` (LA explicitly aliases LAR), `limit=1..100` (default 10).
  Offset is not accepted for export. Invalid selections fail before source work.
- Unknown/repeated/incompatible parameters return 400. No player-detail endpoint
  or per-expanded-card query exists. No participation thresholds are applied.

Every success/failure is `no-store` for browser, generic CDN and Vercel CDN.
An expired/unavailable published snapshot returns 503. Optional source/live
failures return published data with explicit warnings and unknown live status;
incomplete default-live rankings cannot be exported (409). Output over 2 MB is
rejected with 413 and a smaller-page instruction. Only GET is implemented.

Data response fields:

- `version:1`, `observationAt` (response observation; not source publication).
- `sources.player/roster/schedule`: original `observedAt`, fixed `expiresAt`,
  `upstreamUpdatedAt:null`. Optional unavailable sources are null. Fetch-cache
  hits do not renew observations or the existing five-minute expiry.
- `sources.live`: verified/partial/unavailable/disabled, observation timestamp,
  60-second observation-age limit. No completed live observation TTL cache.
- `coverage`: supplied-records-only, unknown upstream publication time, warnings.
- `model`: explicit period, source/coverage, input-validation completeness,
  nullable metric cells, namespaced GSIS/ESPN identity, eligible categories,
  whole-period metrics, team stints/contributions and nullable `playingNow`.
  Known true/false uses existing `isTeamPlaying`; null means unverified.
- Each page includes the last five supplied games for each player, per-game
  source and an explicit returned/supplied log count. These are recent supplied
  appearances, not proof of participation in omitted games.
- `pagination`: offset, limit, total player rows and nullable nextOffset.

Export response wraps source/coverage metadata and the Phase 2 selected-metric
projection: one statistic definition, verified period/scope, rank, canonical
player identity/name, team identity/logo where supplied, value and NFL #FFC720.
No other leaderboard columns or expanded logs are exported. Unknown logos remain
null; no extra image or standings request is made. The existing DOM/PNG exporter
is untouched.

## Identity and statistical reconciliation

Existing `loadNflverseSnapshot` downloads/parses remain shared. The new profile
adds roster and schedule identity parsing without changing legacy parsers.
Successful fetch observations are retained alongside the original five-minute
expiry. The URL for rosters is the existing nflverse 2026 roster source.

ESPN transport is extracted inside the existing live helper. Legacy and new
consumers share only an active scoreboard/summary promise. Sequential requests
still retrieve fresh observations; errors clear the promise. Legacy projections
continue to expose exactly week/players/teams with their original statistics.

GSIS-to-ESPN reconciliation uses explicit season roster links, never names.
ESPN events must uniquely match nflverse schedule event ID, year, regular phase,
week, source game ID, exact participating team abbreviations/IDs and valid
kickoff. Summary event/competition/team identity must agree. Duplicate events,
conflicting crosswalks and ambiguous/incomplete player identities withhold the
whole game's replacement. No arbitrary player or game winner is selected.

A verified in-progress cumulative boxscore replaces that game's published facts,
not their sum. A final game already represented in the published snapshot uses
published facts; otherwise the verified ESPN final can bridge the publication
gap while it remains in the current feed. Corrections rebuild from a new source
object. Published-source precedence on final can visibly revise a prior live
value; this is explicit source precedence, not a freshness guarantee. The new
response is not an official complete-season certificate.

Unknown live fields remain missing, including unsupported advanced components.
A verified reported total tackle value can be retained without inventing solo/
assist components. Season tackles sum known per-game totals; rates continue to
use summed numerators/denominators. Team stints remain separate. There are no
minimum-volume rules or generated editorial narratives.

## Processing and request bounds

Active model builds coalesce by period/live selection, independently of page or
export projection. The registry is capped at 16 distinct active selections and
cleans success/failure. Published derivations are keyed by exact player/roster
source objects, bounded to 32 period entries per pair, weakly referenced and
never served after source expiry. There is no new persistent/live response cache.

Payloads are paginated rather than serializing every game's facts for every
player on each response. Expanded data for a returned row is already included.
Different completed requests still incur response serialization and fresh live
transport when enabled; cross-instance sharing is not claimed. All-Time's
separate legacy roster retrieval is not refactored by this task.

## Validation / measurements

95 focused tests passed (16 new server tests + existing foundation, source/API
parity, performance cache, season highs, live-highlight, scoreboard/polling,
CFB history/coalescing/season, export access and deck-PNG logic). Final TypeScript,
focused lint and whitespace checks are recorded with the handoff artifacts.
Intentional failure logs and existing Node module-type warnings are not failures.

One-game fixture request evidence:

| Scenario | Player CSV | Roster CSV | Schedule CSV | Scoreboard | Summaries |
|---|---:|---:|---:|---:|---:|
| Existing published-snapshot baseline | 1 | 0 | 0 | 0 | 0 |
| New cold live path, 10 concurrent consumers | 1 | 1 | 1 | 1 | 1 |
| Next completed warm live request: additional calls | 0 | 0 | 0 | 1 | 1 |
| Reading 10 included expanded-card records | 0 | 0 | 0 | 0 | 0 |

The two new cold identity files are real extra cost, not claimed savings.
Concurrent legacy + new live-source consumers use one scoreboard + one summary,
rather than two copies. Completed observations are not reused as live cache hits.

Synthetic 6,000-fact / 1,000-player published-only fixture, ten concurrent
consumers: one foundation build, one player CSV and one roster CSV download,
zero schedule/ESPN requests; 50-row response 727,943 bytes. Final recorded run:
1,127.704 ms aggregate process CPU and 902.682 ms wall time for the ten
responses, including parsing, model construction and repeated serialization.
This is a synthetic cold-batch measurement, not a per-request production figure,
median, hosting savings forecast or sustained-capacity proof. CPU and payload
size remain material release risks. No production load test was run.

## Remaining risks / next separately authorised step

- Raw provider publication times and complete game/player coverage remain
  unknown. Missing live metrics can make mixed-source season fields unknown.
- A missing final can disappear from the current ESPN feed before publication;
  no persistent history store was introduced to conceal that gap.
- Source/compute reuse is process-local. The live transport inherits existing
  provider timeout/platform lifecycle limitations; no hosting config was changed.
- Offset pages can cross source refreshes. A future UI must compare source
  observations and restart a changed snapshot rather than combine mixed pages.
- Branding may be absent for teams not in verified current source metadata.
- Production build, deployed-provider smoke checks and browser UI integration
  are not claimed here. The public interface does not consume this route.

Next: separately authorise fixture-driven consumer validation of pagination,
source-transition presentation, expanded-row state and exports, with an explicit
CPU/bandwidth budget before any public interface replacement. Do not proceed to
the four-category UI or deployment automatically.

## Exact Phase 2B file changes

Created:

- app/api/nfl/stats-v2/route.ts
- app/lib/stats-v2/nfl-source-types.ts
- app/lib/stats-v2/nfl-source-csv.ts
- app/lib/stats-v2/nfl-reconcile.ts
- app/lib/stats-v2/nfl-server.ts
- tests/nfl-stats-v2-server.test.mjs
- docs/stats-v2-nfl-server.md

Modified:

- app/api/nfl/live-stats.ts — shared active retrieval; same legacy projection.
- app/lib/nflverse-snapshots.ts — roster kind, separate parser profile and
  original observation timestamp; existing URLs/TTL/legacy parsers retained.
- app/lib/stats-v2/nfl-statlines.ts — Phase 2 file extended for mixed-source
  provenance and reported total tackles without fabricated components.
- app/lib/stats-v2/nfl-export.ts — Phase 2 file extended with reusable selection
  validation before server requests; selected-metric output unchanged.

The Phase 2 identity module, original foundation test and original handoff doc
were preserved unchanged. Existing unpublished commits remain intact. Changes
remain uncommitted; HEAD is fe835385d71a7835c345f0d9d7c0dca566eca67d.

Rollback must revert only these Phase 2B changes and remove the seven listed
new files. Preserve the five pre-existing Phase 2 files and their earlier
content; do not run a broad reset/clean or revert the unpublished repairs.
