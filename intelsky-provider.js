==========================================================
   SKYHUNT — IntelSky Provider v1.0
   Browser-safe GitHub Pages provider layer.

   Primary live feed:
   https://intelsky.org/api/

   IntelSky documents:
   - no API key required
   - CORS enabled
   - live JSON refreshed approximately every 8 seconds
   - 60 requests/minute live-feed allowance
   ========================================================== */

(function(){
  "use strict";

  const LIVE_URL="https://intelsky.org/api/";
  const CACHE_MS=6500;

  let cache=null;
  let cacheAt=0;
  let inFlight=null;

  function rowsFrom(payload){
    const rows=payload?.ac || payload?.aircraft || [];
    if(!Array.isArray(rows)) return [];

    return rows.filter(a=>
      Number.isFinite(Number(a?.lat)) &&
      Number.isFinite(Number(a?.lon)) &&
      (a?.flight || a?.r || a?.hex)
    );
  }

  async function fetchIntelSky(force=false){
    const now=Date.now();

    if(!force && cache && (now-cacheAt)<CACHE_MS){
      return cache;
    }

    if(inFlight) return inFlight;

    inFlight=(async()=>{
      const ctl=new AbortController();
      const timer=setTimeout(()=>ctl.abort(),12000);

      try{
        const response=await fetch(LIVE_URL,{
          signal:ctl.signal,
          cache:"no-store",
          headers:{Accept:"application/json"}
        });

        if(!response.ok){
          throw new Error(`IntelSky returned HTTP ${response.status}`);
        }

        const payload=await response.json();
        const rows=rowsFrom(payload);

        cache=rows;
        cacheAt=Date.now();

        return rows;
      }catch(err){
        throw new Error(`IntelSky live feed failed: ${err?.message||err}`);
      }finally{
        clearTimeout(timer);
        inFlight=null;
      }
    })();

    return inFlight;
  }

  function distanceNm(lat1,lon1,lat2,lon2){
    const R=3440.065;
    const rad=Math.PI/180;
    const p1=Number(lat1)*rad;
    const p2=Number(lat2)*rad;
    const dLat=(Number(lat2)-Number(lat1))*rad;
    const dLon=(Number(lon2)-Number(lon1))*rad;

    const a=
      Math.sin(dLat/2)**2 +
      Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;

    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  async function around(lat,lon,radius=250,force=false){
    const rows=await fetchIntelSky(force);
    const r=Math.max(1,Math.min(250,Number(radius)||250));

    return rows
      .map(a=>({
        ...a,
        _intelDistanceNm:distanceNm(lat,lon,Number(a.lat),Number(a.lon))
      }))
      .filter(a=>Number.isFinite(a._intelDistanceNm) && a._intelDistanceNm<=r)
      .sort((a,b)=>a._intelDistanceNm-b._intelDistanceNm);
  }

  async function byHex(hex,force=false){
    const clean=String(hex||"").trim().toLowerCase();
    if(!clean) return [];

    const rows=await fetchIntelSky(force);

    return rows.filter(a=>
      String(a?.hex||"").trim().toLowerCase()===clean
    );
  }

  const API={
    live:fetchIntelSky,
    around,
    byHex,
    distanceNm
  };

  window.SKYHUNT_INTELSKY=API;

  /* ========================================================
     Compatibility functions
     Existing SKYHUNT modules already call these names.
     ======================================================== */

  window.scanAdsbLol = scanAdsbLol = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Scanning IntelSky near ${name}…`;
    }

    const rows=await around(lat,lon,250);

    return rows.map(a=>({
      ...a,
      _skyhuntSource:"IntelSky"
    }));
  };

  // Legacy function name retained so Radar and AI Finder do not need rewrites.
  window.scanAirplanesLive = scanAirplanesLive = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Refreshing IntelSky near ${name}…`;
    }

    const rows=await around(lat,lon,250,true);

    return rows.map(a=>({
      ...a,
      _skyhuntSource:"IntelSky"
    }));
  };

  // Nearby and Sky Lens use this shared function.
  window.localFeedRequest = localFeedRequest = async function(feed,pos,radius){
    const lat=Number(pos?.lat);
    const lon=Number(pos?.lon);

    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      throw new Error("Invalid nearby coordinates.");
    }

    // Whatever legacy provider label the caller sends,
    // route it to IntelSky.
    const rows=await around(lat,lon,radius,feed==="Airplanes.live");

    return {
      source:"IntelSky",
      aircraft:rows.map(a=>({
        ...a,
        _localSource:"IntelSky"
      }))
    };
  };

  // Replace live-follow refresh so it no longer calls adsb.lol by ICAO.
  window.refreshTrackedAircraft = refreshTrackedAircraft = async function(){
    if(!currentHex || trackingBusy) return;

    trackingBusy=true;

    try{
      const list=await byHex(currentHex,true);

      if(!list.length){
        trackStatus.textContent="● WAITING";
        mapMeta.textContent="No fresh IntelSky position returned. Keeping the last known position and trying again…";
        return;
      }

      const a=list[0];

      currentSource="IntelSky";
      currentAircraft={
        ...(currentAircraft||{}),
        ...a,
        _zone:currentZone,
        _source:"IntelSky"
      };

      updateTelemetry(a);
      updateMapPoint(a,false);
      trackStatus.textContent="● TRACKING";
    }catch(err){
      trackStatus.textContent="● RETRYING";
      mapMeta.textContent=`IntelSky refresh failed (${err.message}). The tracker will retry automatically.`;
    }finally{
      trackingBusy=false;
    }
  };

  console.info("SKYHUNT IntelSky provider active.");
})();
