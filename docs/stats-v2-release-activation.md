# Stats 2.0 technical activation (owner approval still required)

No gate, hosting environment or public default is changed by these source edits.
Both release switches default off:

- Build the frontend with `NEXT_PUBLIC_AAW_STATS_V2_RELEASE=1`.
- Run the server with **both** `AAW_STATS_V2_RELEASE=1` and
  `NEXT_PUBLIC_AAW_STATS_V2_RELEASE=1`.

Both Centre Stats tabs then default to Players with no preview query. Their Teams
button uses `statsView=teams`; Players clears it. Comparison wording is hidden in
release mode. `statsView=legacy` retains an explicit legacy fallback. Disabling
release requires rebuilding without the public flag and disabling the server flag;
old public Stats remains the default and both new player APIs return 404. Do not
turn off only the server flag while leaving the released frontend active.

Local preview flags remain supported only outside Vercel. The development fixture
page stays unavailable on Vercel even when release is enabled. Existing team API
paths remain public because the old interface uses them too.

## Completed-game discovery

`retained-active-games.json` contains exact source-qualified schedule observations
for the currently relevant CFB Week 8 (56 known games) and NFL Week 7 (14 known
games). It records the retained ESPN response hashes and observation time. It is a
known-game identity set, **not independent national population certification**.
No raw summary envelopes, private paths, credentials or Mac runtime dependencies
are deployed.

Each fresh Stats 2.0 request unions current discovery with these retained identities.
Started missing games are retrieved by exact ID. Summary season/week/game/team
identities must agree before its current status/statistics are accepted. Summaries
are not retained as indefinitely fresh responses: final corrections are re-read,
then replace the same player/game facts. Future fixtures do not require summaries.
If a started game's summary is unavailable, the existing missing-value safeguards
apply; absent evidence does not become a zero contribution. NFL's legacy transport
is not opted into this behaviour.

Before the next rollover, use the completed-week handoff procedure in
`cfb-season-handoff.md` and carry the next week's reviewed schedule identities in
the release too. This patch is verified for the retained current periods; it does
not create an unattended collection schedule or invent coverage for later weeks.
The Week 8 base need not be promoted while Week 8 is still underway.

## Validation boundaries

Production-mode HTTP checks are local Next production servers with `VERCEL=1` and
release switches explicitly on/off. Provider responses in these checks are offline
retained fixtures injected by an external test-process preload, not an application
fixture switch. They prove routing and fresh-process behaviour without bulk
provider retrieval; they are not evidence of a Vercel deployment or simultaneous
live NFL observations. Run the same deployment smoke checks after separately
approved deployment. Keep the prior build/configuration available for rollback.

Keep saved build outputs **outside** the isolated source directory. Generated
bundles inside a source directory can be picked up by Tailwind's automatic scan
and make subsequent compilation extremely slow. The repository's Next configuration
and dependency/build scripts have not been changed by this task.

## Files changed in this task

- `app/api/cfb/stats-v2/route.ts`
- `app/api/nfl/stats-v2/route.ts`
- `app/api/nfl/live-stats.ts`
- `app/api/season-stats/route.ts`
- `app/features/stats/StatsPreviewSwitch.tsx`
- `app/lib/stats-v2/cfb-server.ts`
- `app/lib/stats-v2/nfl-server.ts`
- `app/lib/stats-v2/nfl-source-types.ts`
- `app/lib/stats-v2/stable-game-discovery.ts`
- `app/lib/stats-v2/retained-active-games.json`
- `app/lib/stats-v2/release-access.ts`
- `tests/cfb-stats-v2.test.mjs`
- `tests/nfl-stats-v2-server.test.mjs`
- `tests/stats-live-season.test.mjs`
- `tests/stats-release-integration.test.mjs`
- `tests/fixtures/cfb-final-week8.json`
- `docs/stats-v2-release-activation.md`
