# All-Time data sources

## CFB
- NCAA FBS Football Record Book: https://fs.ncaa.org/Docs/stats/football_records/FBS.pdf
- College Football at Sports-Reference career leaderboards: https://www.football-reference.com/cfb/leaders/
- The displayed CFB leaders are historical career leaderboards, not current-season totals.

## NFL
- NFL 2024 Record & Fact Book: https://operations.nfl.com/media/hfjn4oid/2024-record-fact-book-incl-supplemental.pdf
- The NFL book says the records are compiled by the Elias Sports Bureau and reflect available official NFL information from the league's formation in 1920, including applicable AFL records from 1960-69.
- The displayed NFL leaders are a record-book snapshot, not current-season totals.

## Local completion review — 22 October 2026

### Supported tables and scope

- NFL Individual: nine Career and Season categories, six populated Single Game categories (passing yards, rushing yards, receiving yards, yards from scrimmage, tackles, sacks).
- CFB Individual: eleven Career and Season categories, four populated Single Game categories (passing, rushing, receiving and total offense yards). Original individual observations are unchanged. CFB Season passing touchdowns has 24 retained rows and interceptions has 20; other Individual tables have 25 rows.
- NFL Team All-Time: Wins and Winning Percentage, plus Games Played, calculated solely as wins + losses + ties in the same 32 retained franchise rows. These are regular-season franchise histories, not modern team-stat sums.
- CFB Team All-Time: Wins and Winning Percentage, with 25 retained programs per table. These are not all current FBS schools, and program history can predate FBS membership.
- Team Single Season is unavailable in both leagues. It is visibly disabled rather than selecting an empty table. Required evidence is an official historical team-season leaderboard with its season, scope, units, eligibility and publication cutoff. A 2026 season-to-date table is not a substitute.
- Equal values use competition ranks (1, 1, 3). Display includes ties at the tenth-row boundary. Invalid/missing values are excluded, not converted to zero. A historical season/game year does not establish active-player status; Career retains its existing source-supplied active flag or 2026 career-span indication, clearly distinguished from live play.

### Cutoff and provenance limitations

The legacy Team files label their rows “Through 2025”, but the retained CFB monitor copy labels identical rows “Through 2024”. The documented NFL source is a **2024** book and does not substantiate the displayed 2025 cutoff. Therefore the UI marks Team cutoffs unverified, without altering source observations or inventing a replacement cutoff. Individual book publication cutoffs were not retained either; record years identify a career/season/game, not the publication date.

The owner approved exactly two official-PDF requests in this task. NCAA `FBS.pdf` failed during connection (no response body); the documented NFL URL returned HTTP 404. Neither PDF was obtained. No retries, replacement-source discovery or other provider collection occurred. More historical Team categories and Team Single Season remain source-blocked. Obtain the official books from the owner, or separately authorise a bounded replacement-URL lookup/retrieval; do not populate those tables from memory.

### How updates actually propagate

1. **Bundled tables:** the read-only public feed now reconciles against the deployed catalog on every read. A stale monitor copy cannot override a bundled correction, omit a newly bundled category or truncate the NFL franchise population to 25. Review an official source, edit the existing data module, preserve its scope/cutoff, run focused tests/build, then obtain normal deployment approval. No database reset or refresh is needed for those corrections. No automatic historical source collection is implied.
2. **NFL active Career:** the existing Tuesday Vercel cron configuration uses nflverse roster selection and ESPN career totals for candidates already in the record book. A successful existing refresh writes the existing monitor publication. The public feed reconciles only verified active candidates into the latest bundled career tables, preserving deployed retired-player corrections and filling the full leaderboard. It accepts those entries only under the verified career catalog version and only for NFL Individual Career tables, with a valid check time and finite observations. Corrections may decrease a total. Per-table source metadata distinguishes this from the bundled snapshots. The browser re-reads the published feed every five minutes; it does not collect athlete histories.
3. **CFB:** Monday's existing cron republishes bundled records; it does **not** discover new college records. No automatic CFB historical updater has been added. Team and Individual Season/Single Game tables in both leagues remain reviewed snapshots.
4. **Failure:** failed provider refreshes retain the previous publication. Unreadable storage or invalid publications fall back to bundled rows without inventing a successful check date. No provider is fetched by the public leaderboard read.

Cron configuration was inspected, not operational execution history. No cron/refresh endpoint, real database request or database write was performed during this task. Tests use an in-memory fake storage response and retained real observations. The existing storage schema, authentication and cron schedules are unchanged.
