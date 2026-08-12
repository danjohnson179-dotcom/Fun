/* ==========================================================
   SKYHUNT ADS-B FI HOTFIX
   Primary: adsb.fi
   Fallback 1: adsb.lol
   Fallback 2: ADSB One

   Load AFTER nearby.js and BEFORE skylens.js / ai-finder.js / radar.js.
   ========================================================== */

(function(){
  "use strict";

  const SKYHUNT_ADSB = {
    async point(provider, lat, lon, radius=250){
      const safeLat = Number(lat);
      const safeLon = Number(lon);
      const safeRadius = Math.max(1, Math.min(250, Number(radius)||250));

      if(!Number.isFinite(safeLat) || !Number.isFinite(safeLon)){
        throw new Error("Invalid aircraft search coordinates.");
      }

      let url;
      let source;

      if(provider==="adsb.fi"){
        source="adsb.fi";
        url=`https://opendata.adsb.fi/api/v3/lat/${safeLat}/lon/${safeLon}/dist/${safeRadius}`;
      }else if(provider==="adsb.lol"){
        source="adsb.lol";
        url=`https://api.adsb.lol/v2/point/${safeLat}/${safeLon}/${safeRadius}`;
      }else if(provider==="adsb.one"){
        source="ADSB One";
        url=`https://api.adsb.one/v2/point/${safeLat}/${safeLon}/${safeRadius}`;
      }else{
        throw new Error("Unknown aircraft provider.");
      }

      const payload = await fetchJson(url, 11000);
      const rows = (payload?.ac || payload?.aircraft || [])
        .filter(validAircraft);

      return {
        source,
        aircraft: rows
      };
    },

    async byIcao(hex){
      const clean = String(hex||"").trim().toLowerCase();
      if(!clean) throw new Error("Missing ICAO hex.");

      const payload = await fetchJson(
        `https://opendata.adsb.fi/api/v2/icao/${encodeURIComponent(clean)}`,
        10000
      );

      return (payload?.ac || payload?.aircraft || [])
        .filter(validAircraft);
    },

    async pointWithFallback(name, lat, lon, radius=250){
      const failures = [];

      for(const provider of ["adsb.fi","adsb.lol","adsb.one"]){
        try{
          if(typeof scan!=="undefined" && scan){
            scan.textContent =
              provider==="adsb.fi"
                ? `Scanning live aircraft near ${name} via adsb.fiâ¦`
                : `Trying ${provider==="adsb.one"?"ADSB One":provider} near ${name}â¦`;
          }

          const result = await this.point(provider,lat,lon,radius);

          if(result.aircraft.length){
            return result;
          }

          failures.push(`${result.source}: zero aircraft`);
        }catch(err){
          failures.push(`${provider}: ${err?.message||err}`);
        }

        // All three public APIs are rate-limited. Keep requests spaced.
        await sleep(1100);
      }

      throw new Error(failures.join(" | "));
    }
  };

  window.SKYHUNT_ADSB = SKYHUNT_ADSB;

  /* -------------------------------------------------------
     DISCOVER / GLOBAL RADAR / AI FINDER
     Existing modules already call these two functions.
     ------------------------------------------------------- */

  window.scanAdsbLol = scanAdsbLol = async function(name,lat,lon){
    const result = await SKYHUNT_ADSB.pointWithFallback(name,lat,lon,250);

    return result.aircraft.map(a=>({
      ...a,
      _skyhuntSource: result.source
    }));
  };

  // Keep the old function name for compatibility, but it no longer calls Airplanes.live.
  window.scanAirplanesLive = scanAirplanesLive = async function(name,lat,lon){
    const failures=[];

    for(const provider of ["adsb.lol","adsb.one"]){
      try{
        if(typeof scan!=="undefined" && scan){
          scan.textContent=`Trying ${provider==="adsb.one"?"ADSB One":provider} near ${name}â¦`;
        }

        const result=await SKYHUNT_ADSB.point(provider,lat,lon,250);

        if(result.aircraft.length){
          return result.aircraft.map(a=>({
            ...a,
            _skyhuntSource:result.source
          }));
        }

        failures.push(`${result.source}: zero aircraft`);
      }catch(err){
        failures.push(`${provider}: ${err?.message||err}`);
      }

      await sleep(1100);
    }

    throw new Error(failures.join(" | "));
  };

  /* -------------------------------------------------------
     NEARBY / SKY LENS
     Both use localFeedRequest().
     We reinterpret the old provider labels so no other
     feature module has to be rewritten.
     ------------------------------------------------------- */

  window.localFeedRequest = localFeedRequest = async function(feed,pos,radius){
    const lat=Number(pos?.lat);
    const lon=Number(pos?.lon);

    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      throw new Error("Invalid nearby location.");
    }

    if(feed==="adsb.lol"){
      // Existing code thinks this is the primary. It is now adsb.fi.
      const primary=await SKYHUNT_ADSB.point("adsb.fi",lat,lon,radius);

      if(primary.aircraft.length){
        return primary;
      }

      // A successful zero result can still try adsb.lol before returning zero.
      await sleep(1100);

      const secondary=await SKYHUNT_ADSB.point("adsb.lol",lat,lon,radius);
      if(secondary.aircraft.length){
        return secondary;
      }

      return primary;
    }

    if(feed==="Airplanes.live"){
      // Existing fallback call now routes to ADSB One.
      return SKYHUNT_ADSB.point("adsb.one",lat,lon,radius);
    }

    if(feed==="adsb.fi"){
      return SKYHUNT_ADSB.point("adsb.fi",lat,lon,radius);
    }

    throw new Error("Unknown aircraft feed.");
  };

  /* -------------------------------------------------------
     LIVE FOLLOW
     Move individual ICAO refreshes to adsb.fi as well.
     ------------------------------------------------------- */

  window.refreshTrackedAircraft = refreshTrackedAircraft = async function(){
    if(!currentHex || trackingBusy) return;
    trackingBusy=true;

    try{
      const list=await SKYHUNT_ADSB.byIcao(currentHex);

      if(!list.length){
        trackStatus.textContent="â WAITING";
        mapMeta.textContent="No fresh position returned. Keeping the last known location and trying againâ¦";
        return;
      }

      const a=list[0];
      currentSource="adsb.fi";
      currentAircraft={
        ...(currentAircraft||{}),
        ...a,
        _zone:currentZone,
        _source:"adsb.fi"
      };

      updateTelemetry(a);
      updateMapPoint(a,false);
      trackStatus.textContent="â TRACKING";
    }catch(err){
      trackStatus.textContent="â RETRYING";
      mapMeta.textContent=`Live refresh failed (${err.message}). The tracker will retry automatically.`;
    }finally{
      trackingBusy=false;
    }
  };

  console.info("SKYHUNT ADS-B hotfix active: adsb.fi â adsb.lol â ADSB One");
})();
