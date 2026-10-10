# Private Export Studio

Run the usual Desk development server and open `/admin/exports` on its localhost port (currently `http://localhost:3001/admin/exports`). No public navigation links are added.

Choose CFB or NFL. In the embedded Desk view, use the normal tabs/weeks/categories. Select one eligible card/table in the Studio, Generate PNG, inspect the preview, then Download PNG. The source view keeps normal live data behaviour; the export is a frozen snapshot.

Supported: game cards, individual performances, weekly/season stats tables, conference/division standings tables, individual All-Time leaderboard cards. Polls, playoff-picture tables and unavailable/loading placeholders are not added to the export list.

Individual weekly/season statistics use an export-only compact top-10 card: rank, team logo, player with normal-weight team beneath, and right-aligned value with its unit underneath. Desk retains all 25 table rows. Logos reuse the existing standings endpoint. Team statistics, All-Time and other captures retain their existing presentation.

When viewing All-Time, the Studio's Record period selector switches the source between Career, Season and Single Game (where available). Picker labels and filenames include the period, and switching period invalidates the old preview so a Career image cannot be mistaken for a Season or Single Game capture. The card's visible heading remains unchanged.

Capture uses the rendered card and computed styles, not a separately maintained graphic template. Only marked interface clutter is removed: game date/tier footer; performance opponent line/content angle; interactive controls. Fades, gradients, borders and ACTIVE treatments remain. Logos must embed successfully or capture reports a failure rather than silently omitting them.

One card per PNG at 2× resolution with a 12px transparent gutter (24 output pixels). Entire tables are captured even beyond the iframe viewport. Oversized captures fail explicitly; no rows are silently dropped. Do not treat the preview as confirmation of fresh/current data: select the intended source week and check its actual values first.

Development loopback access remains available without a password. All other access requires HTTP Basic authentication, checked by the route proxy and again by the server page. Username: `aaw`. Set server-only `EXPORT_STUDIO_PASSWORD` in Vercel Production to a unique password of at least 16 characters, then redeploy. Missing or shorter configuration fails closed. Preview deployments require their own environment setting if access is wanted. Never prefix this variable with NEXT_PUBLIC_. Use HTTPS remotely and do not expose the development server publicly.

Contained logos are decoded and drawn directly onto the output canvas at their existing positions, bypassing browser-dependent SVG foreignObject image rendering. The card design is unchanged.

## Historical local verification — 9 October 2026 (previous local-only gate)

Generated and visually inspected real CFB game, performance, weekly stats, conference standings and All-Time PNGs, plus NFL All-Time with ACTIVE rows and season stats. Verified full-table capture, transparent outer pixels and an actual PNG download. Type checking and the six deck/access tests passed. Export-specific lint has no errors (one intentional plain-image preview warning).

A separate production build was started locally and `/admin/exports` returned HTTP 404, including with a forged localhost Host. The development route also rejected a non-loopback Host. This verifies the production-build gate, not a new deployment: these changes have not been pushed or deployed to Vercel. Normal source tabs and filters were exercised during capture; this is not an exhaustive regression test of all Desk features.
