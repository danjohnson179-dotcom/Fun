/* SKYHUNT — aircraft-api.js
   Single source of truth for live aircraft data.

   Provider: adsb.fi open data
   Public limit: 1 request per second.
*/
(function(){
  "use strict";

  const SOURCE="adsb.fi";
  const BASE="https://opendata.adsb.fi/api";
  const MIN_REQUEST_GAP=1100;

  let lastRequestAt=0;
  let queue=Promise.resolve();

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function aircraftRows(payload){
    const rows=payload?.ac || payload?.aircraft || [];
    return Array.isArray(rows) ? rows : [];
  }

  function isPositionedAircraft(a){
    return Number.isFinite(Number(a?.lat)) &&
           Number.isFinite(Number(a?.lon)) &&
           !!(a?.flight || a?.r || a?.hex);
  }

  function friendlyError(err){
    const msg=String(err?.message||err||"Unknown error");

    if(/AbortError|aborted|timeout/i.test(msg))
      return "The adsb.fi request timed out.";

    if(/Load failed|Failed to fetch|NetworkError|network request failed/i.test(msg))
      return "Safari could not connect to adsb.fi. This may be a browser/network/CORS failure.";

    if(/HTTP 429/.test(msg))
      return "adsb.fi is rate-limiting this device. Wait before trying again.";

    if(/HTTP 403/.test(msg))
      return "adsb.fi rejected this browser or IP address.";

    if(/HTTP 5\d\d/.test(msg))
      return "adsb.fi is temporarily unavailable.";

    return msg;
  }

  async function rawFetch(url,timeout=12000){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);

    try{
      const response=await fetch(url,{
        signal:ctl.signal,
        cache:"no-store",
        headers:{Accept:"application/json"}
      });

      const text=await response.text();

      let data;
      try{
        data=JSON.parse(text);
      }catch{
        throw new Error(`Invalid JSON from adsb.fi`);
      }

      if(!response.ok){
        const apiMessage=data?.error || data?.msg;
        throw new Error(`adsb.fi returned HTTP ${response.status}${apiMessage?`: ${apiMessage}`:""}`);
      }

      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  function scheduledFetch(url,timeout){
    const task=queue.then(async()=>{
      const wait=Math.max(0,MIN_REQUEST_GAP-(Date.now()-lastRequestAt));
      if(wait) await sleep(wait);

      try{
        return await rawFetch(url,timeout);
      }finally{
        lastRequestAt=Date.now();
      }
    });

    queue=task.catch(()=>{});
    return task;
  }

  async function point(lat,lon,radius=250){
    const safeLat=Number(lat);
    const safeLon=Number(lon);
    const safeRadius=Math.max(1,Math.min(250,Math.round(Number(radius)||250)));

    if(!Number.isFinite(safeLat)||!Number.isFinite(safeLon)){
      throw new Error("Invalid aircraft search coordinates.");
    }

    const url=`${BASE}/v3/lat/${safeLat}/lon/${safeLon}/dist/${safeRadius}`;
    const payload=await scheduledFetch(url,12000);

    return {
      source:SOURCE,
      aircraft:aircraftRows(payload).filter(isPositionedAircraft),
      raw:payload
    };
  }

  async function hex(hexCode){
    const clean=String(hexCode||"").trim().toLowerCase();

    if(!/^[0-9a-f]{6}$/.test(clean)){
      throw new Error("Invalid ICAO hex address.");
    }

    const url=`${BASE}/v2/hex/${encodeURIComponent(clean)}`;
    const payload=await scheduledFetch(url,12000);

    return {
      source:SOURCE,
      aircraft:aircraftRows(payload).filter(isPositionedAircraft),
      raw:payload
    };
  }

  window.SKYHUNT_AIRCRAFT_API={
    source:SOURCE,
    point,
    hex,
    friendlyError,
    isPositionedAircraft
  };
})();
