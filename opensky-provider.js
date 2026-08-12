/* ==========================================================
   SKYHUNT — OpenSky Provider v1.0

   Primary: OpenSky Network live state vectors
   Fallback: IntelSky (military/government supplement)

   Designed for GitHub Pages / browser-only deployment.
   ========================================================== */

(function(){
  "use strict";

  const OPENSKY_URL="https://opensky-network.org/api/states/all";
  const INTELSKY_URL="https://intelsky.org/api/";

  const CACHE_MS=9000;
  let openSkyCache=null;
  let openSkyCacheAt=0;
  let openSkyInFlight=null;

  let intelCache=null;
  let intelCacheAt=0;
  let intelInFlight=null;

  function valid(a){
    return Number.isFinite(Number(a?.lat)) &&
           Number.isFinite(Number(a?.lon)) &&
           !!(a?.flight || a?.r || a?.hex);
  }

  function metersToFeet(value){
    const n=Number(value);
    return Number.isFinite(n) ? Math.round(n*3.28084) : null;
  }

  function metresPerSecondToKnots(value){
    const n=Number(value);
    return Number.isFinite(n) ? Number((n*1.943844).toFixed(1)) : null;
  }

  function openSkyRowToAircraft(row){
    if(!Array.isArray(row)) return null;

    const hex=String(row[0]||"").trim().toLowerCase();
    const flight=String(row[1]||"").trim();
    const lon=Number(row[5]);
    const lat=Number(row[6]);
    const baroAlt=row[7];
    const onGround=!!row[8];
    const velocity=row[9];
    const track=row[10];
    const verticalRate=row[11];
    const geoAlt=row[13];
    const squawk=row[14];

    if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
      hex,
      flight,
      lat,
      lon,
      alt_baro:onGround ? "ground" : metersToFeet(baroAlt),
      alt_geom:metersToFeet(geoAlt),
      gs:metresPerSecondToKnots(velocity),
      track:Number.isFinite(Number(track)) ? Number(track) : null,
      baro_rate:Number.isFinite(Number(verticalRate))
        ? Math.round(Number(verticalRate)*196.8504)
        : null,
      squawk:squawk || null,
      r:"",
      t:"",
      desc:"",
      _openskyOrigin:String(row[2]||""),
      _skyhuntSource:"OpenSky"
    };
  }

  async function fetchJson(url,timeout=12000){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),timeout);

    try{
      const response=await fetch(url,{
        signal:ctl.signal,
        cache:"no-store",
        headers:{Accept:"application/json"}
      });

      if(!response.ok){
        throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
      }

      return await response.json();
    }finally{
      clearTimeout(timer);
    }
  }

  async function fetchOpenSky(force=false){
    const now=Date.now();

    if(!force && openSkyCache && (now-openSkyCacheAt)<CACHE_MS){
      return openSkyCache;
    }

    if(openSkyInFlight) return openSkyInFlight;

    openSkyInFlight=(async()=>{
      try{
        const data=await fetchJson(OPENSKY_URL,14000);
        const states=Array.isArray(data?.states) ? data.states : [];

        const rows=states
          .map(openSkyRowToAircraft)
          .filter(Boolean)
          .filter(valid);

        if(!rows.length){
          throw new Error("OpenSky returned no positioned aircraft");
        }

        openSkyCache=rows;
        openSkyCacheAt=Date.now();
        return rows;
      }finally{
        openSkyInFlight=null;
      }
    })();

    return openSkyInFlight;
  }

  async function fetchIntelSky(force=false){
    const now=Date.now();

    if(!force && intelCache && (now-intelCacheAt)<CACHE_MS){
      return intelCache;
    }

    if(intelInFlight) return intelInFlight;

    intelInFlight=(async()=>{
      try{
        const data=await fetchJson(INTELSKY_URL,12000);
        const rows=(data?.ac || data?.aircraft || [])
          .filter(valid)
          .map(a=>({...a,_skyhuntSource:"IntelSky"}));

        intelCache=rows;
        intelCacheAt=Date.now();
        return rows;
      }finally{
        intelInFlight=null;
      }
    })();

    return intelInFlight;
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

  function aroundRows(rows,lat,lon,radius){
    const r=Math.max(1,Math.min(250,Number(radius)||250));

    return rows
      .map(a=>({
        ...a,
        _distanceNm:distanceNm(lat,lon,a.lat,a.lon)
      }))
      .filter(a=>Number.isFinite(a._distanceNm) && a._distanceNm<=r)
      .sort((a,b)=>a._distanceNm-b._distanceNm);
  }

  async function globalLive(force=false){
    try{
      return {
        source:"OpenSky",
        aircraft:await fetchOpenSky(force)
      };
    }catch(openSkyError){
      const intel=await fetchIntelSky(force);

      if(intel.length){
        return {
          source:"IntelSky",
          aircraft:intel,
          primaryError:openSkyError
        };
      }

      throw openSkyError;
    }
  }

  async function around(lat,lon,radius=250,force=false){
    const global=await globalLive(force);

    return {
      source:global.source,
      aircraft:aroundRows(global.aircraft,lat,lon,radius)
    };
  }

  async function byHex(hex,force=false){
    const clean=String(hex||"").trim().toLowerCase();
    if(!clean) return {source:"OpenSky",aircraft:[]};

    const global=await globalLive(force);

    return {
      source:global.source,
      aircraft:global.aircraft.filter(
        a=>String(a?.hex||"").trim().toLowerCase()===clean
      )
    };
  }

  window.SKYHUNT_LIVE={
    global:globalLive,
    around,
    byHex
  };

  /* ---------------------------------------------------------
     Compatibility layer for existing SKYHUNT feature modules.
     --------------------------------------------------------- */

  window.scanAdsbLol = scanAdsbLol = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Scanning OpenSky near ${name}…`;
    }

    const result=await around(lat,lon,250);

    return result.aircraft.map(a=>({
      ...a,
      _skyhuntSource:result.source
    }));
  };

  window.scanAirplanesLive = scanAirplanesLive = async function(name,lat,lon){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Refreshing OpenSky near ${name}…`;
    }

    const result=await around(lat,lon,250,true);

    return result.aircraft.map(a=>({
      ...a,
      _skyhuntSource:result.source
    }));
  };

  window.localFeedRequest = localFeedRequest = async function(feed,pos,radius){
    const lat=Number(pos?.lat);
    const lon=Number(pos?.lon);

    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      throw new Error("Invalid nearby coordinates.");
    }

    const result=await around(
      lat,
      lon,
      radius,
      feed==="Airplanes.live"
    );

    return {
      source:result.source,
      aircraft:result.aircraft.map(a=>({
        ...a,
        _localSource:result.source
      }))
    };
  };

  window.refreshTrackedAircraft = refreshTrackedAircraft = async function(){
    if(!currentHex || trackingBusy) return;

    trackingBusy=true;

    try{
      const result=await byHex(currentHex,true);
      const list=result.aircraft;

      if(!list.length){
        trackStatus.textContent="● WAITING";
        mapMeta.textContent="No fresh OpenSky position returned. Keeping the last known location and trying again…";
        return;
      }

      const a=list[0];

      currentSource=result.source;
      currentAircraft={
        ...(currentAircraft||{}),
        ...a,
        _zone:currentZone,
        _source:result.source
      };

      updateTelemetry(a);
      updateMapPoint(a,false);
      trackStatus.textContent="● TRACKING";
    }catch(err){
      trackStatus.textContent="● RETRYING";
      mapMeta.textContent=`Live refresh failed (${err.message}). The tracker will retry automatically.`;
    }finally{
      trackingBusy=false;
    }
  };

  console.info("SKYHUNT OpenSky provider active.");
})();
