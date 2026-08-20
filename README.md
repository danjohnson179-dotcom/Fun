# SKYHUNT Free Live Radar Package

This is a complete, flat replacement package for the `danjohnson179-dotcom/Fun` GitHub Pages site.

## What changed

- **Global Radar works without an API key:** it embeds the interactive adsb.lol map directly in the page.
- **Nearby works without an API key:** after the visitor grants location access, SKYHUNT centres the embedded adsb.lol map on that position.
- **Optional detailed features:** aircraft cards, Spin, AI Finder, Sky Lens and target follow use AirLabs through the included Cloudflare Worker.
- **Failure isolation:** if AirLabs or Cloudflare is unavailable, the two embedded live-radar maps continue working.
- **No Vercel deployment is required.**
- `aircraft-api.js` is loaded with the requested `?v=cf-1` cache tag.
- The Diagnostics link remains in the site footer.

## Package contents

The site files are all at the top level so they can be uploaded directly to the root of the GitHub repository:

- `index.html`, `styles.css`
- `aircraft-api.js`, `core.js`, `nearby.js`, `radar.js`
- `ai-finder.js`, `skylens.js`, `collection.js`, `news.js`, `legal.js`, `app.js`
- `diagnostics.html`, `provider-test.html`
- `cloudflare-worker.js`
- `README.md`, `INSTALL-WINDOWS.txt`

## Two independent layers

1. **Always-on live maps** — adsb.lol is loaded in an iframe from each visitor's browser. These maps do not pass through Cloudflare and do not use the AirLabs allowance.
2. **Optional SKYHUNT detail data** — the browser calls your Cloudflare Worker, which calls AirLabs using a secret key. The Worker validates requests, restricts CORS, caches successful responses for 90 seconds and returns clear diagnostics.

This design deliberately avoids the anonymous public API blocks encountered with Airplanes.live, adsb.fi and OpenSky from shared hosting networks.

## Data and privacy notes

- adsb.lol is an independent community service. Its availability and terms are outside SKYHUNT's control.
- Live map data is attributed to adsb.lol under the Open Data Commons Open Database License (ODbL).
- AirLabs' free allowance is suitable for light/demo use. Plan limits and terms can change; check the AirLabs dashboard.
- A visitor's browser sends the selected map coordinates to adsb.lol. If optional details are enabled, coordinates are also sent to the SKYHUNT Worker and AirLabs.
- This site is for entertainment and plane spotting, not navigation or safety-critical use.

Full Windows deployment instructions are in `INSTALL-WINDOWS.txt`.
