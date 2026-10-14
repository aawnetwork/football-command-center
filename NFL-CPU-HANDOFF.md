# NFL statistics CPU optimisation — local, not deployed

The earlier five-minute processed performances cache is present in the repository. It retains concurrent-work sharing and successful-response Vercel CDN caching. This change connects all three endpoints to a bounded shared nflverse snapshot loader.

## Cache contract
- Each of three fixed public nflverse URLs has a five-minute, process-local successful snapshot; concurrent loads join the same promise.
- Player and weekly-team endpoints share the exact legacy weekly CSV parser/results. Each CSV row is split once, rather than once per column.
- Performances keeps its existing distinct parser semantics, but shares the raw player download wherever modules occupy the same runtime. Schedule and season-team snapshots are also reused.
- Static player and weekly-team aggregates are reused by parsed snapshot identity and selection. Derived selection cache is capped at 32 entries per snapshot; replaced snapshots are garbage-collectable.
- Non-OK HTTP responses and thrown downloads are not cached. Pending work is cleared on failure. Expired successful data is not served as a silent fallback.
- Weekly ESPN scoreboard/summary requests and live overlays remain independent and uncached by this helper. No automatic polling.
- Performances JSON/CDN expiry is capped at the earliest input snapshot expiry. This prevents two five-minute cache layers creating a ten-minute stale window.

## Vercel limits
Memory is shared only within a runtime/module instance; separate functions, cold instances, regions and deployments may each download/parse independently. No claim of globally shared cache or measured CPU billing reduction. Next's installed fetch cache rejects entries above 2 MB, so large raw CSVs deliberately remain fetch no-store while explicit memory snapshots are reused. Existing performances CDN headers provide another cache layer subject to Vercel eligibility; the player/team full weekly responses are not given five-minute CDN caching because they contain live ESPN overlays.

## Verification and activation
Mocked route parity covers weekly, season, absent weeks and default selection against frozen pre-change routes. Dedicated tests cover download/parse sharing, expiry, upstream/network/parser failure recovery, parser semantics, derived cache bounds, live overlays and chained cache expiry. Type checking, targeted lint and production build run locally. No service restart, commit, push or deployment performed. No Utility/Basement changes.

Before deploying: review the diff and tests, commit only these NFL changes, deploy through the existing Hub GitHub main → Vercel chain after approval, and verify production weekly/season responses plus performances cache headers/hits. Compare CPU observability over comparable traffic; no savings percentage is assumed. Roll back the reviewed commit if verification fails.

Remaining costs: cold-instance duplication, CSV snapshot memory, live ESPN work, JSON serialisation, week availability scans and performances recomputation on expiry. No new dependencies or infrastructure.
