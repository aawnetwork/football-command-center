# Stats 2.0 Phase 2D — integrated NFL preview

Local implementation and source investigation only. No commit, push, deployment, production write or hosting change. This supersedes the standalone presentation described in the Phase 2C preview notes; those earlier files/work remain preserved.

## Access

The credential-free production runtime is `/tmp/aaw-stats2d-runtime`, using installed dependencies. Open `http://127.0.0.1:4325/preview/nfl-stats`. Restart from that temporary directory with:

```sh
env -i PATH="$PATH" AAW_STATS_V2_LOCAL_PREVIEW=1 NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next start --hostname 127.0.0.1 --port 4325
```

Do not copy production environment files. Both page and fixture endpoint remain disabled unless the local-preview flag is set, and are disabled on Vercel. Do not enable that flag on hosted infrastructure. Close browser tabs when finished to stop their polling.

The normal route contains the proposed interface only. Development tools are explicitly isolated at `/preview/nfl-stats?development=1`; `&fixture=1` selects the labelled fictional dataset there. Technical warnings and fixture switches are not part of the proposed public interface.

## Integration

`NflCentreLayout` shares the existing NFL Centre wrapper, header, navigation, typography, width and styles between the existing NFL page and the preview. Existing NFL section content and loading/polling logic are unchanged. The preview mounts only the new player-stat view: it does not run the legacy NFL Centre scoreboard/player-stat polling in parallel. Other section buttons link back to their existing NFL Centre routes.

The standalone hero, duplicate wordmark and footer are removed. The player interface retains QB/Rush/Rec/Def, full supported nullable statlines, Week/Season, sorting, search, live badges, stable expanded cards and 30-second refresh. Names/logos reuse the existing Hub team directory, loaded once outside the refresh loop. Full canonical NFL team names remain available if the directory fails. No abbreviation boxes or duplicate abbreviations accompany supplied logos.

Cards use a compact grid and Recent Games. Mobile tables scroll horizontally with player identity pinned; all statistic columns remain available. NFL accent is #FFC720. No CFB interface or colour rules were changed; its eventual Stats 2.0 accent remains #FF6B00.

## Data confidence

The existing server's `model.complete` means that supplied records passed integrity checks. It is not independent proof of whole-league coverage. The real-data preview therefore does not display ordinal league ranks or allow ranking export, including if that flag happens to be true. It still shows and sorts available figures. The warning distinguishes known partial data from unconfirmed completeness. The explicitly labelled, fully controlled development fixture retains rank/export checks. Existing public Stats and Export Studio are unchanged.

Captured public 2026 data reproduced the eight weekly warnings:

- Six game-level failures to reconcile ESPN athletes through the season roster's explicit GSIS/ESPN crosswalk: SEA–DEN, CHI–ATL, PIT–TB, ARI–LAR, LAC–KC and DAL–GB. These are missing links, not observed graph conflicts.
- Washington's ESPN abbreviation WSH is not accepted by the strict matcher, which expects canonical WAS. Its scheduled game is present. This is an adapter alias gap, not a missing fixture.
- One anonymous SEA–DEN penalties-only record is rejected as an invalid player. Equivalent anonymous/context records occur in Weeks 1–5 too, so the season response has six such warnings and thirteen warnings overall.

The captured source contains all 93 scheduled games in Weeks 1–6 and both teams for each. Across all fourteen Week 6 games, 1,359 passing/rushing/receiving values match ESPN exactly using explicit roster IDs, with no name joins. This supports the core offensive fields in that snapshot, not every expanded metric or full-season completeness.

ESPN reports Gabriel Rubio with one tackle in PIT–TB, but its ID has no roster crosswalk and no corresponding named record was found in the captured published player dataset/roster. This observation remains unaccounted for; a source omission or alternate identity requires verification. Do not infer zero or guess a GSIS identity from a name. Other missing links also block live reconciliation even where similarly named published records exist.

No source warnings were suppressed and no football data, identities or adapter rules were changed in this phase. Proposed follow-up fixes require review: validated WSH→WAS alias; separate team/context records from player facts while retaining raw data; explicit missing-crosswalk resolution; and category/metric coverage checks against expected games before changing published-final precedence or certifying rankings. A simple row-presence check or removing warnings is insufficient.

## Before replacing the public Stats tab

Review the integrated design. Then resolve/certify data coverage, including defensive observations and season scope. Preserve the existing Team Stats view and complete the new preview's connection to the existing image-export workflow. The current preview export is a selected-stat JSON projection in development fixtures; the existing public/Studio exports remain available unchanged. Process-local detail tokens, retained-model memory and hosted multi-instance behaviour remain earlier open release risks. No adaptive polling gates or CFB implementation were started.

## Rollback

Restore only the Phase 2D-modified files from the chat workspace's `work/stats-phase2d/baseline/`; remove only the new frame, Centre preview wrapper, team metadata hook and this document. Do not reset Git or restore Phase 2/2B/2C files from HEAD: they already held unpublished work. The original NFL page entry copy was also preserved. Stop the temporary preview if no longer needed. No production rollback is required.
