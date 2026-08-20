/* SKYHUNT — optional detailed-aircraft bridge
   The always-on Radar and Nearby maps use embedded adsb.lol directly.
   This module supplies optional SKYHUNT cards, AI Finder and Sky Lens details.
*/
(function(){
  "use strict";
  const SOURCE="AirLabs via SKYHUNT bridge";
  const BASE="https://skyhunt-api.danjohnson179.workers.dev";
  const MIN_REQUEST_GAP=900;
  let lastRequestAt=0,queue=Promise.resolve();
  const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

  function aircraftRows(payload){
    const rows=payload?.ac||payload?.aircraft||[];
    return Array.isArray(rows)?rows:[];
  }
  function isPositionedAircraft(aircraft){
    return Number.isFinite(Number(aircraft?.lat))&&Number.isFinite(Number(aircraft?.lon))&&!!(aircraft?.flight||aircraft?.r||aircraft?.hex);
  }
  function friendlyError(error){
    const message=String(error?.message||error||"Unknown error");
    if(/not configured|AIRLABS_API_KEY|HTTP 503/i.test(message))return "Detailed aircraft cards are not configured yet. The live adsb.lol maps still work; add AIRLABS_API_KEY to the Cloudflare Worker to enable cards.";
    if(/429|allowance|quota|limit/i.test(message))return "The free AirLabs detail allowance has been reached. The live adsb.lol maps still work.";
    if(/AbortError|aborted|timeout/i.test(message))return "The optional detailed-aircraft request timed out. The live adsb.lol maps still work.";
    if(/Load failed|Failed to fetch|NetworkError|network request failed/i.test(message))return "The optional Cloudflare detail bridge could not be reached. The live adsb.lol maps still work.";
    if(/HTTP 5\d\d/i.test(message))return "The optional detailed-aircraft service is temporarily unavailable. The live adsb.lol maps still work.";
    return message;
  }

  async function rawFetch(path,timeout=15000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(`${BASE}${path}`,{signal:controller.signal,cache:"no-store",headers:{Accept:"application/json"}});
      const text=await response.text();
      let data;
      try{data=JSON.parse(text)}catch{throw new Error(`Bridge returned invalid JSON (HTTP ${response.status})`)}
      if(!response.ok||data?.ok===false){
        const diagnostic=data?.error||data?._skyhunt?.error||`HTTP ${response.status}`;
        throw new Error(`Bridge HTTP ${response.status}: ${diagnostic}`);
      }
      return data;
    }finally{clearTimeout(timer)}
  }

  function scheduledFetch(path,timeout){
    const task=queue.then(async()=>{
      const wait=Math.max(0,MIN_REQUEST_GAP-(Date.now()-lastRequestAt));
      if(wait)await sleep(wait);
      try{return await rawFetch(path,timeout)}finally{lastRequestAt=Date.now()}
    });
    queue=task.catch(()=>{});
    return task;
  }

  async function point(lat,lon,radius=50){
    const safeLat=Number(lat),safeLon=Number(lon),safeRadius=Math.max(1,Math.min(250,Math.round(Number(radius)||50)));
    if(!Number.isFinite(safeLat)||safeLat< -90||safeLat>90||!Number.isFinite(safeLon)||safeLon< -180||safeLon>180)throw new Error("Invalid aircraft search coordinates.");
    const payload=await scheduledFetch(`/point?lat=${encodeURIComponent(safeLat)}&lon=${encodeURIComponent(safeLon)}&radius=${safeRadius}`,15000);
    return {source:payload?._skyhunt?.provider||SOURCE,aircraft:aircraftRows(payload).filter(isPositionedAircraft),raw:payload};
  }

  async function hex(hexCode){
    const clean=String(hexCode||"").trim().toLowerCase();
    if(!/^[0-9a-f]{6}$/.test(clean))throw new Error("Invalid ICAO hex address.");
    const payload=await scheduledFetch(`/hex?hex=${encodeURIComponent(clean)}`,15000);
    return {source:payload?._skyhunt?.provider||SOURCE,aircraft:aircraftRows(payload).filter(isPositionedAircraft),raw:payload};
  }

  window.SKYHUNT_AIRCRAFT_API={source:SOURCE,base:BASE,point,hex,friendlyError,isPositionedAircraft};
})();
