# Basement milestone cutover

Private milestone interpretation is implemented in Basement. Hub continues to own shared factual publications and all public gamecard context.

`BASEMENT_RECORDS_EXPORT_TOKEN` configures a dedicated read-only server export at `/api/basement/records`. It is independent of admin/tester credentials. The export pins both league tables, exact player identities and all retained legacy signals to a single durable source read. Conflicting table identities are isolated, with their original rows retained for research; public tables are not rewritten by the export. CFBD ranking publications use the same credential and a bounded season selection.

The career loader now corroborates missing annual values against an exact-player lifetime aggregate and a valid regular-season headline total; missing statistics never become zero. Its NFL scheduled source refresh is daily at 06:15 UTC, with a 180-second function allowance. This continues supporting Hub public record tables.

Keep `BASEMENT_MILESTONES_MOVED=false` until Basement's durable first import and signed-in acceptance pass. When set to true, the admin card/navigation disappear, the gated `/admin/content` route redirects to Basement Games, and new private milestone signal generation stops. Existing signal history and all factual collection/public gamecards remain preserved. Set false for rollback; never reset the monitor to perform cutover.

The full release sequence and schema/access checks are documented in Basement's `docs/record-intelligence-migration.md`. Production rollout is currently awaiting Vercel team authorization. No deployment or production data migration has been performed by preparing these source changes.
