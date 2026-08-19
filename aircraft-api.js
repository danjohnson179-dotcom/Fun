/* SKYHUNT aircraft API: browser -> Cloudflare Worker -> adsb.fi / Airplanes.live */
(function(){
  "use strict";
  const SOURCE="SKYHUNT Cloudflare bridge";
  const BASE="https://skyhunt-api.danjohnson179.workers.dev";
  const MIN_REQUEST_GAP=1050;
  let lastRequestAt=0, queue=Promise.resolve();
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const rows=p=>Array.isArray(p?.ac)?p.ac:Array.isArray(p?.aircraft)?p.aircraft:[];
  function isPositionedAircraft(a){return Number.isFinite(Number(a?.lat))&&Number.isFinite(Number(a?.lon))&&!!(a?.flight||a?.r||a?.hex)}
  function friendlyError(err){
    const msg=String(err?.message||err||"Unknown error");
    if(/AbortError|aborted|timeout/i.test(msg)) return "The SKYHUNT aircraft bridge timed out.";
    if(/Load failed|Failed to fetch|NetworkError|network request failed/i.test(msg)) return "The browser could not connect to the SKYHUNT Cloudflare bridge. Check the Worker deployment and allowed origin.";
    if(/HTTP 429/.test(msg)) return "The aircraft providers are rate-limiting requests. Wait briefly before trying again.";
    if(/HTTP 403/.test(msg)) return "The SKYHUNT bridge rejected this website origin.";
    if(/HTTP 5\d\d/.test(msg)) return "Both live-aircraft providers are currently unavailable.";
    return msg;
  }
  async function rawFetch(path,timeout=12000){
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const response=await fetch(BASE+path,{signal:ctl.signal,cache:"no-store",headers:{Accept:"application/json"}});
      const text=await response.text(); let data;
      try{data=JSON.parse(text)}catch{throw new Error("Invalid JSON from the SKYHUNT aircraft bridge")}
      if(!response.ok) throw new Error(`SKYHUNT bridge returned HTTP ${response.status}${data?.error?`: ${data.error}`:""}`);
      return data;
    }finally{clearTimeout(timer)}
  }
  function scheduledFetch(path,timeout){
    const task=queue.then(async()=>{const wait=Math.max(0,MIN_REQUEST_GAP-(Date.now()-lastRequestAt));if(wait)await sleep(wait);try{return await rawFetch(path,timeout)}finally{lastRequestAt=Date.now()}});
    queue=task.catch(()=>{}); return task;
  }
  function result(payload){const provider=payload?._skyhunt?.provider||SOURCE;return{source:`${provider} via SKYHUNT bridge`,aircraft:rows(payload).filter(isPositionedAircraft),raw:payload}}
  async function point(lat,lon,radius=250){
    const a=Number(lat),o=Number(lon),r=Math.max(1,Math.min(250,Math.round(Number(radius)||250)));
    if(!Number.isFinite(a)||a< -90||a>90||!Number.isFinite(o)||o< -180||o>180) throw new Error("Invalid aircraft search coordinates.");
    return result(await scheduledFetch(`/point?lat=${encodeURIComponent(a)}&lon=${encodeURIComponent(o)}&radius=${r}`,12000));
  }
  async function hex(value){const clean=String(value||"").trim().toLowerCase();if(!/^[0-9a-f]{6}$/.test(clean))throw new Error("Invalid ICAO hex address.");return result(await scheduledFetch(`/hex?hex=${clean}`,12000))}
  window.SKYHUNT_AIRCRAFT_API={source:SOURCE,base:BASE,point,hex,friendlyError,isPositionedAircraft};
})();
