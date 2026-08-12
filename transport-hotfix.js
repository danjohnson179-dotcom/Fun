/* SKYHUNT HOTFIX — browser transport recovery
   Load immediately AFTER core.js and BEFORE nearby.js.
   Purpose: recover cross-origin ADS-B requests when Safari/browser CORS blocks direct API fetches.
*/

(function(){
  "use strict";

  const directFetchJson = typeof fetchJson === "function" ? fetchJson : null;

  function parseJsonText(text, source){
    try{
      return JSON.parse(text);
    }catch(_){
      throw new Error(`Invalid JSON from ${source}`);
    }
  }

  async function fetchWithTimeout(url, timeout=9000){
    const ctl = new AbortController();
    const timer = setTimeout(()=>ctl.abort(), timeout);

    try{
      const response = await fetch(url,{
        signal: ctl.signal,
        cache: "no-store",
        headers: { Accept: "application/json,text/plain,*/*" }
      });

      const text = await response.text();

      if(!response.ok){
        throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
      }

      return parseJsonText(text,new URL(url).hostname);
    }finally{
      clearTimeout(timer);
    }
  }

  async function allOriginsJson(target, timeout=12000){
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
    return fetchWithTimeout(proxy,timeout);
  }

  async function corsProxyJson(target, timeout=12000){
    const proxy = `https://corsproxy.io/?url=${encodeURIComponent(target)}`;
    return fetchWithTimeout(proxy,timeout);
  }

  async function resilientFetchJson(url, timeout=9000){
    const errors = [];

    // 1) Always prefer the actual provider directly.
    try{
      return await fetchWithTimeout(url, Math.min(timeout,8000));
    }catch(err){
      errors.push(`direct: ${err?.message||err}`);
    }

    // 2) First independent browser-safe route.
    try{
      return await allOriginsJson(url, Math.max(timeout,11000));
    }catch(err){
      errors.push(`allorigins: ${err?.message||err}`);
    }

    // 3) Second independent browser-safe route.
    try{
      return await corsProxyJson(url, Math.max(timeout,11000));
    }catch(err){
      errors.push(`corsproxy: ${err?.message||err}`);
    }

    throw new Error(`Aircraft transport failed (${errors.join(" | ")})`);
  }

  // Replace the shared transport function used by core, nearby, radar and Labs.
  window.fetchJson = resilientFetchJson;

  try{
    fetchJson = resilientFetchJson;
  }catch(_){}

  // Restore simple provider functions on top of the recovered transport.
  window.scanAdsbLol = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Scanning live aircraft near ${name}…`;
    }

    const j = await resilientFetchJson(
      `https://api.adsb.lol/v2/point/${lat}/${lon}/250`,
      10000
    );

    const rows = (j?.ac || j?.aircraft || [])
      .filter(a=>Number.isFinite(Number(a?.lat)) &&
                 Number.isFinite(Number(a?.lon)) &&
                 (a?.flight || a?.r || a?.hex));

    return rows;
  };

  try{
    scanAdsbLol = window.scanAdsbLol;
  }catch(_){}

  window.scanAirplanesLive = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Trying backup radar near ${name}…`;
    }

    const j = await resilientFetchJson(
      `https://api.airplanes.live/v2/point/${lat}/${lon}/250`,
      10000
    );

    const rows = (j?.aircraft || j?.ac || [])
      .filter(a=>Number.isFinite(Number(a?.lat)) &&
                 Number.isFinite(Number(a?.lon)) &&
                 (a?.flight || a?.r || a?.hex));

    return rows;
  };

  try{
    scanAirplanesLive = window.scanAirplanesLive;
  }catch(_){}

  console.info("SKYHUNT browser transport hotfix active.");
})();
