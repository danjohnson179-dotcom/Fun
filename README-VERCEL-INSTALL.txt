SKYHUNT — DEPLOY THE OPENSKY BRIDGE ON VERCEL
=============================================

This is a separate backend project. Do not upload these files into the existing
Fun website repository. Create a new GitHub repository for this Vercel API.

Never put the OpenSky Client ID or Client Secret inside any file or GitHub repo.
They must be entered only in Vercel's Environment Variables screen.

PART 1 — CREATE A SEPARATE GITHUB REPOSITORY
--------------------------------------------
1. Extract SKYHUNT-Vercel-OpenSky-API.zip on the Windows PC.
2. Sign in to https://github.com/.
3. Select the + menu at the top-right -> New repository.
4. Repository name:

     skyhunt-vercel-api

5. Public or Private will both work. Private is recommended.
6. Do not add a README, .gitignore or licence on the creation screen.
7. Select Create repository.
8. On the empty repository page, select uploading an existing file.
9. Open the extracted SKYHUNT-Vercel-OpenSky-API folder in File Explorer.
10. Drag these items from INSIDE that folder onto GitHub's upload page:

      api folder
      lib folder
      package.json
      vercel.json
      README-VERCEL-INSTALL.txt
      VALIDATION.txt

    The api and lib folders must remain folders. The files package.json and
    vercel.json must appear at the repository root, not inside another folder.
11. Use commit message "Add SKYHUNT Vercel OpenSky API" and commit to main.

PART 2 — IMPORT THE PROJECT INTO VERCEL
---------------------------------------
1. Open https://vercel.com/ and sign in with GitHub.
2. From the Vercel dashboard select Add New -> Project (or New Project).
3. Find skyhunt-vercel-api and select Import.
4. Keep the Framework Preset as Other. Keep Root Directory as ./.
5. Before selecting Deploy, expand Environment Variables.
6. Add this exact name:

     OPENSKY_CLIENT_ID

   Paste the OpenSky API Client ID as its value.
7. Add this exact name:

     OPENSKY_CLIENT_SECRET

   Paste the OpenSky API Client Secret as its value.
8. Ensure the values apply to Production. Do not expose either variable to the
   browser and do not prefix the names with NEXT_PUBLIC_.
9. Select Deploy and wait for the Congratulations/success screen.

If the project was deployed before the variables were added, open Project ->
Settings -> Environment Variables, add both variables, then open Deployments and
Redeploy the latest deployment. Environment-variable changes apply only to a new
deployment.

PART 3 — COPY THE PUBLIC VERCEL ADDRESS
---------------------------------------
Vercel will show a public address similar to:

  https://skyhunt-vercel-api-xxxxx.vercel.app

Your exact address may differ. Copy the production address; do not copy a dashboard
or settings URL. The Vercel address is safe to share. The OpenSky credentials are
not safe to share.

PART 4 — TEST THE BACKEND
-------------------------
Replace YOUR-VERCEL-ADDRESS below with the public production address.

Health:

  https://YOUR-VERCEL-ADDRESS/health

Expected:
  "ok": true
  "host": "Vercel"
  "configured": true

Live Heathrow aircraft:

  https://YOUR-VERCEL-ADDRESS/point?lat=51.4700&lon=-0.4543&radius=100

Expected:
  - An "ac" array.
  - A "_skyhunt" object.
  - "provider": "OpenSky Network".
  - "authenticated": true.
  - "host": "Vercel".

An empty ac array is valid, although Heathrow normally returns aircraft.

PART 5 — CONNECT THE SKYHUNT WEBSITE
------------------------------------
Once both tests work, send Codex only the public vercel.app address. Do not send
the Client ID, Client Secret, access token, or screenshots containing credentials.

Codex will provide final GitHub replacement files with aircraft-api.js,
diagnostics.html and provider-test.html pointing to the new Vercel address. The
rest of the SKYHUNT site can remain unchanged.

SECURITY AND OPERATING NOTES
----------------------------
- CORS allows the SKYHUNT GitHub Pages origin and localhost only.
- OpenSky credentials exist only in Vercel environment variables.
- OAuth tokens are reused in warm functions and are never returned to browsers.
- Successful aircraft responses use a 10-second Vercel CDN cache.
- Point searches use an OpenSky bounding box and are filtered back to the requested
  circular radius.
- The API validates coordinates, radius and six-character ICAO hex addresses.
- OpenSky use must comply with its personal/non-profit licensing terms. Commercial
  use requires OpenSky consent.

Official references:
Vercel Git deployments:
https://vercel.com/docs/git

Vercel environment variables:
https://vercel.com/docs/environment-variables

OpenSky authentication:
https://openskynetwork.github.io/opensky-api/rest.html#authentication
