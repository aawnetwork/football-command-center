# Utility Room → Football Desk broadcasts

Utility owns CSV ingestion, ESPN matching, reviewed mappings, alternate-feed merging, approval and frozen publication. Desk receives approved JSON; it does not rematch it. Existing broadcast_availability storage, GET reader and gamecards remain unchanged.

Utility flow: Imports & Mappings → CFB / broadcasts → Validate and preview → Confirm valid records → Feeds → Approved CFB broadcasts → Desk → Preview → Confirm this feed version → Send to live Desk. Import confirmation and publication do not automatically deliver. Reuse the same authoritative feed; the receiver rejects another feed ID for that league.

POST /api/utility-broadcasts accepts {feed_id,version,league,records}. It requires the existing BROADCAST_IMPORT_TOKEN header x-broadcast-import-token. Its server calls ur_publish_desk_broadcasts using the existing Supabase server key. The SQL setup is in supabase/utility-broadcast-delivery.sql; it has been applied remotely. Do not reapply its CREATE TABLE blindly.

The server-only RLS-protected receipt holds the last feed/version/hash/count per league. A transaction serializes delivery, rejects stale versions or conflicting same-version payloads, upserts all four flags, preserves unrelated records and verifies saved contents. Identical repeats leave unchanged data timestamps alone. A retry also restores approved contents if a legacy importer changed them. No anonymous/authenticated table/function grants; service_role only.

Rows contain league, event_id (ESPN ID string), event_date (timestamp), canonical away_team/home_team, source_date/source_time/source_matchup and explicit dazn/disney_plus/sky_sports/channel_5 booleans. Source time may be blank when the original historical input is unavailable. Kickoff comes from the verified schedule, not an invented source time. New Utility imports retain raw parsed rows, original source time and matched metadata. Platform 'none' explicitly clears all broadcast flags; omitted rows are not deletions.

Utility sender reads BROADCAST_IMPORT_TOKEN server-side from UR_DESK_ENV_FILE (default Football Hub .env.local), or UR_DESK_BROADCAST_TOKEN. UR_DESK_URL defaults to https://desk.aawnetwork.co.uk. No service key or token goes into browser responses. No separate app, scheduler or hosted Utility interface was added.

The old /admin/broadcasts CSV importer remains available as requested. It can still compete with Utility, so use Utility as the normal authority and retire the legacy writer separately after acceptance. Reload Desk after sending; existing pages refresh broadcast data when their game-ID list changes.
