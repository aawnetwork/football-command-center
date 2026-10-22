# NFL Stats 2.0 — Phase 2C local preview

This is an additive visual-review surface, not a public-interface replacement. Existing NFL/CFB pages, polling, APIs, Export Studio and football calculations remain unchanged.

## Run safely

The prepared credential-free runtime is `/tmp/aaw-stats2c-runtime`; its source copy excludes `.env*`, Git metadata and production credentials, and reuses installed dependencies. Do not run the preview against the original `.env.local`.

After the isolated production build, start from that directory:

```sh
env -i PATH="$PATH" NEXT_TELEMETRY_DISABLED=1 AAW_STATS_V2_LOCAL_PREVIEW=1 ./node_modules/.bin/next start --hostname 127.0.0.1 --port 4323
```

Open `http://127.0.0.1:4323/preview/nfl-stats`. The default data path is the existing additive NFL source. “Use isolated demo” explicitly switches to fictional, prominently labelled fixtures through the real statline builder and response projection. Simulated playing indicators are never presented as actual NFL observations. Close browser tabs when finished to stop polling. The server does no scheduled polling by itself.

Both the page and fixture endpoint return 404 unless the local-preview flag is set; they are also disabled on Vercel. No navigation links or hosting configuration were changed. Do not enable this flag on hosted infrastructure.

## Response budget

`/api/nfl/stats-v2` retains its existing default `view=data` and `view=export` contracts. All responses remain `no-store`.

- `view=leaders&category=QB|Rush|Rec|Def`: every eligible player, stable identity, team codes, nullable category metrics, explicit not-applicable keys, playing status, verified period and source coverage. Column keys travel once; values use matching array positions. No game logs or team-stint metric objects.
- `view=details&snapshot=<token>&players=<comma-separated canonical IDs>`: one batched request for up to 20 players from that exact observation. Includes full metrics, separate team stints and at most five supplied games, with log coverage. No new upstream calls or recalculation.
- `view=export&snapshot=<token>&category=...&statistic=...`: the existing selected-stat-only projection, with validated period and direction. Incomplete coverage still refuses ranking export. The preview downloads this data projection as JSON; the existing PNG Export Studio is untouched.

Regular leaderboard requests always invoke the existing live loader; completed live responses are not reused for subsequent refreshes. Only concurrent projections of the same result object share computed compact rows. Game-source annotations are now evaluated on demand, without changing their values.

Presentation observations last at most 30 seconds and never outlast the published snapshot. At most four immutable observations are retained per process, including all categories/periods/consumers. Concurrent identical requests share the same observation token. Expired or evicted tokens, wrong periods/live selections, unknown players and cross-service tokens fail closed. They never trigger a fresh source load behind a card expansion.

## UI behaviour

The separate preview provides four categories, verified-QB eligibility, Week/Season selection, all-population client sorting, player/team search, 25-row progressive display, inline metric/log cards, live badges and 30-second automatic refresh. No participation cutoffs are applied. Transfers retain combined totals labelled as such; details retain team-specific facts. Missing values are dashes, confirmed zeros remain zero, and inapplicable rates are N/A.

During successful refreshes search, sorting, expanded IDs and visible row count persist. Open cards hold existing row positions while values and rank numbers update, avoiding jumps. Intentional column sorting immediately reorders without closing cards. Failed refreshes retain observations with an alert, suppress stale playing indicators and disable exports. Detail failures are explicit and retried on the next live refresh. Switching period/category/source intentionally resets cards for the new selection.

NFL branding uses #FFC720, navy, cream, white and black. Table headers are keyboard buttons with aria-sort; expansion buttons expose aria-expanded; state/error messages use live regions; narrow screens scroll the table within the page and keep player identity pinned. No editorial narratives are generated.

## Limits before any public rollout

This is ready for local visual review, not hosting approval. Observation tokens are process-local: another serverless instance or eviction can return 409. A deployment-safe detail strategy needs separate review, without weakening freshness or multiplying upstream work. Four retained models bound count, not total bytes; measure representative live-slate memory before hosted use. Detail logs describe supplied records, not guaranteed complete historical coverage. The existing 2026 regular-season/source-verification limits remain.

The synthetic budget scenario is 6,000 facts, 1,000 players and ten simultaneous consumers. The old response transmits 50 full player records; the compact one transmits all 1,000 category-eligible players for correct immediate sorting. Compare identical inputs and upstream/build counts, but do not describe these outputs as byte-identical. Matching metric values/identities are asserted against the preserved pre-phase implementation. Synthetic CPU is aggregate process CPU, not ten independent request timings or guaranteed Vercel savings.

## Rollback

Do not reset the repository or revert previous phases. Remove only `app/preview/nfl-stats/` and this document; restore `app/lib/stats-v2/nfl-server.ts` and `tests/nfl-stats-v2-server.test.mjs` from the preserved Phase 2C entry copies. Those files already contained uncommitted Phase 2/2B work, so restoring them from Git HEAD would lose earlier work. Stop only the temporary preview server and remove its isolated runtime if no longer needed. No commit, push, deployment, database or hosting rollback is required.
