SKYHUNT CLOUDFLARE LIVE-AIRCRAFT DEPLOYMENT
===========================================

WHAT THIS PACKAGE DOES
----------------------
The SKYHUNT website remains on GitHub Pages. Live-aircraft requests now follow:

  SKYHUNT website -> Cloudflare Worker -> adsb.fi (primary)
                                      -> Airplanes.live (fallback)

The Worker validates all inputs, allows browser requests only from the published
GitHub Pages origin and localhost, caches successful results for 2 seconds, and
includes a _skyhunt diagnostics object in every successful aircraft response.

IMPORTANT URL CHECK
-------------------
The supplied frontend expects this exact Worker URL:

  https://skyhunt-api.danjohnson179.workers.dev

If Cloudflare gives your Worker a different name or account subdomain, replace
that URL in aircraft-api.js, diagnostics.html and provider-test.html before you
upload the website files.

PART 1 — DEPLOY THE CLOUDFLARE WORKER
-------------------------------------
1. Sign in at https://dash.cloudflare.com/ on the Windows PC.
2. Open Workers & Pages.
3. Select the existing skyhunt-api Worker.
   If it does not exist, choose Create application and create a Hello World Worker
   named skyhunt-api. Deploy the starter once so Cloudflare assigns its URL.
4. Open Edit Code.
5. Open cloudflare-worker.js from this folder in Notepad.
6. Press Ctrl+A and Ctrl+C in Notepad.
7. In Cloudflare's editor, select all existing Worker code and paste the new code.
8. Select Deploy. Wait for the success message.
9. Open this address in a normal browser tab:

     https://skyhunt-api.danjohnson179.workers.dev/health

   Expected: JSON with "ok": true and
   "service": "SKYHUNT aircraft bridge".
10. Open the live point test:

     https://skyhunt-api.danjohnson179.workers.dev/point?lat=51.4700&lon=-0.4543&radius=100

   Expected: JSON containing an "ac" array and a "_skyhunt" object. The
   _skyhunt.provider value shows adsb.fi or Airplanes.live. fallbackUsed is true
   only when the backup was needed. An empty ac array is valid when no aircraft
   are available; HTTP 502 means both upstream attempts failed.

Note: opening the Worker URL directly has no browser Origin header and is allowed.
Website JavaScript is limited to https://danjohnson179-dotcom.github.io and local
testing on localhost/127.0.0.1. Requests from unrelated websites receive HTTP 403.

PART 2 — REPLACE THE FILES ON GITHUB
------------------------------------
1. Keep this README and cloudflare-worker.js on the PC; they do not need to be
   published as part of the website.
2. Sign in to GitHub and open:

     https://github.com/danjohnson179-dotcom/Fun

3. Confirm the branch selector says main and that you are at the repository root
   (the same level as index.html).
4. Select Add file -> Upload files.
5. From this extracted folder, select these website files:

     index.html            styles.css          aircraft-api.js
     core.js               nearby.js           radar.js
     ai-finder.js           skylens.js          collection.js
     news.js                legal.js            app.js
     diagnostics.html      provider-test.html

6. Drop the files onto the upload page. GitHub should show that existing files
   will be replaced. Do not upload the ZIP itself into the repository.
7. Enter a commit message such as:

     Deploy Cloudflare aircraft bridge

8. Commit directly to main (or create a branch if GitHub requires review), then
   select Commit changes.
9. Wait one or two minutes for GitHub Pages to publish.

PART 3 — VERIFY THE LIVE SITE
-----------------------------
1. Open the site with a cache-busting query:

     https://danjohnson179-dotcom.github.io/Fun/?cf-1

2. Scroll to the footer and confirm Diagnostics is still present.
3. Open Diagnostics and select TEST WORKER ONCE.
4. A successful point test reports the Worker-selected provider and whether the
   fallback was used.
5. Also open provider-test.html for a compact Worker-only report:

     https://danjohnson179-dotcom.github.io/Fun/provider-test.html

6. Test Nearby, Radar, AI Finder, Sky Lens, Collection, News, legal dialogs and
   the rest of the site. Those files are copied from the current main branch and
   have not been restyled or otherwise rewritten.

TROUBLESHOOTING
---------------
Health URL returns 404:
  Confirm the new Worker code was deployed, not only saved.

Health works but the website says Failed to fetch / CORS:
  Confirm the site is loaded from exactly
  https://danjohnson179-dotcom.github.io (the repository path may follow it).
  Confirm aircraft-api.js contains the actual deployed workers.dev URL.

Point URL returns HTTP 400:
  Latitude must be -90..90, longitude -180..180, radius 1..250 nautical miles,
  and hex searches must contain exactly six hexadecimal characters.

Point URL returns HTTP 502:
  Read _skyhunt.attempts. It gives each provider's HTTP status, duration, or
  timeout/JSON error. This is the quickest evidence to copy when asking for help.

Old direct-provider messages remain on the live site:
  GitHub Pages or the browser is serving an older file. Confirm index.html loads
  aircraft-api.js?v=cf-1, then hard-refresh with Ctrl+F5 or use a private window.

The Worker URL is different:
  Search for skyhunt-api.danjohnson179.workers.dev in aircraft-api.js,
  diagnostics.html and provider-test.html and replace all three occurrences.

ROLLBACK
--------
GitHub keeps every commit. In the Fun repository, open the commit made for this
deployment and use GitHub's revert workflow, or restore the previous versions of
index.html, aircraft-api.js and diagnostics.html from repository history. The
Worker can remain deployed while the frontend is rolled back.

PACKAGE NOTES
-------------
- Frontend baseline: danjohnson179-dotcom/Fun main commit
  ccb07e73bc02971e9866205d8b206a69cc2be8e1, downloaded 19 August 2026.
- index.html uses aircraft-api.js?v=cf-1 and retains the Diagnostics footer link.
- aircraft-api.js is the only shared live-aircraft transport layer.
- cloudflare-worker.js contains no password, API key or secret.
- Successful point/hex responses are cached for 2 seconds at Cloudflare.
- adsb.fi is always attempted first; Airplanes.live is attempted on any primary
  timeout, network failure, invalid JSON, or non-success HTTP response.
- The Worker returns clear _skyhunt.attempts diagnostics without exposing stack
  traces or private credentials.

Official reference pages:
Cloudflare Dashboard Workers guide:
https://developers.cloudflare.com/workers/get-started/dashboard/

GitHub browser upload guide:
https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
