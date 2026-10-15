# Temporary invited audience testing

Implemented locally, not committed or deployed.

The server proxy reuses Hub's existing HTTP Basic password verification, with
username `aaw` and a separate `AAW_TESTER_PASSWORD` of at least 16 characters.
It must differ from `EXPORT_STUDIO_PASSWORD`. Never share Admin credentials
with testers. A shared tester credential is temporary invitation access, not
individual accounts; revoke access by rotating it when testing ends.

`AAW_INVITED_TESTING_ENABLED=true` protects pages, direct routes and APIs across
custom and Vercel hostnames. `AAW_AUDIENCE_PARTICIPATION_ENABLED=true` also forces
the same protection, even if the testing flag is absent. Missing/weak/conflicting
tester credentials fail closed. Private Admin routes continue requiring their
existing independent Admin password. Build assets/image optimisation remain
accessible; they do not authorise participation or expose private API records.

Existing cron GETs and manual All-Time refresh POST retain their own existing
machine authentication. Other APIs, including participation GET/POST/DELETE and
contribution POST, require tester authentication while the gate is enabled.
Broadcast administration's separate application workflow is not rewritten.

## Release sequence

1. AAW enters a unique tester password into Vercel Production server-only
   `AAW_TESTER_PASSWORD`; do not put it in chat or a NEXT_PUBLIC variable.
2. Set `AAW_INVITED_TESTING_ENABLED=true`, leave
   `AAW_AUDIENCE_PARTICIPATION_ENABLED=false`, and keep both analytics gates false.
3. Release the reviewed code without enabling collection. Verify anonymous
   denial on the custom hostname and alternate production hostnames, private
   Admin separation, and existing machine integrations.
4. With approved protected testing, exercise opt-in/future-only contributions,
   NFL/CFB favourite and tier changes, private reports, refresh/cross-tab/mobile
   behaviour and withdrawal. Remove disposable contributions through withdrawal.
5. Collection activation requires a separate verified release/configuration step;
   implementation alone does not activate it. No public community ratings.

The policy at https://aawnetwork.co.uk/privacy-policy-2/ returned HTTP 200 to a
logged-out request and contained the Hub audience section and 365-day wording.
Preferences links that exact URL. Prior page_id and guessed-slug failures no
longer describe the published destination.

Production's current Vercel settings have no tester password/testing flag.
Until AAW supplies that secret and a protected deployment is verified, the full
enabled production journey cannot be certified and collection remains disabled.
