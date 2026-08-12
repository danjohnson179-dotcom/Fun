/* SKYHUNT — Aircraft Feed Recovery Layer
   Load AFTER nearby.js and BEFORE ai-finder.js / radar.js.
   Adds resilient public ADS-B provider fallbacks without modifying feature modules. */

(function(){
  "use strict";

  const providerSleep = (ms)=>new Promise(resolve=>setTimeout(resolve,ms));

  function usableRows(payload){
    return (payload?.ac || payload?.aircraft || [])
      .filter(a=>{
        return Number.isFinite(Number(a?.lat)) &&
               Number.isFinite(Number(a?.lon)) &&
               !!(a?.flight || a?.r || a?.hex);
      });
  }

  async function providerRequest(provider,name,lat,lon,radius=250){
    const safeLat=Number(lat);
    const safeLon=Number(lon);
    const safeRadius=Math.min(250,Math.max(1,Number(radius)||250));

    if(!Number.isFinite(safeLat)||!Number.isFinite(safeLon)){
      throw new Error("Invalid radar coordinates");
    }

    let url="";
    let label="";

    switch(provider){
      case "adsb.lol":
        label="adsb.lol";
        url=`https://api.adsb.lol/v2/point/${safeLat}/${safeLon}/${safeRadius}`;
        break;

      case "adsb.fi":
        label="adsb.fi";
        url=`https://opendata.adsb.fi/api/v3/lat/${safeLat}/lon/${safeLon}/dist/${safeRadius}`;
        break;

      case "adsb.one":
        label="ADSB One";
        url=`https://api.adsb.one/v2/point/${safeLat}/${safeLon}/${safeRadius}`;
        break;

      case "airplanes.live":
        label="Airplanes.live";
        url=`https://api.airplanes.live/v2/point/${safeLat}/${safeLon}/${safeRadius}`;
        break;

      default:
        throw new Error("Unknown ADS-B provider");
    }

    const payload=await fetchJson(url,11000);
    const rows=usableRows(payload);

    return {source:label,aircraft:rows};
  }

  async function resilientPrimaryScan(name,lat,lon,radius=250){
    const providers=["adsb.lol","adsb.fi","adsb.one"];
    const failures=[];

    for(let i=0;i<providers.length;i++){
      const provider=providers[i];

      try{
        if(typeof scan!=="undefined" && scan){
          scan.textContent=i===0
            ? `Scanning live aircraft near ${name}…`
            : `Trying ${provider} near ${name}…`;
        }

        const result=await providerRequest(provider,name,lat,lon,radius);

        if(result.aircraft.length){
          // Tag aircraft so downstream UI can see which network supplied it.
          return result.aircraft.map(a=>({
            ...a,
            _skyhuntProvider:result.source
          }));
        }

        failures.push(`${result.source}: zero aircraft`);
      }catch(err){
        failures.push(`${provider}: ${err?.message||err}`);
      }

      if(i<providers.length-1){
        await providerSleep(1100);
      }
    }

    throw new Error(`Primary radar providers unavailable. ${failures.join(" | ")}`);
  }

  async function resilientAirplanesLive(name,lat,lon,radius=250){
    if(typeof scan!=="undefined" && scan){
      scan.textContent=`Trying final backup radar near ${name}…`;
    }

    const result=await providerRequest("airplanes.live",name,lat,lon,radius);

    if(!result.aircraft.length){
      throw new Error("Airplanes.live returned zero usable aircraft");
    }

    return result.aircraft.map(a=>({
      ...a,
      _skyhuntProvider:result.source
    }));
  }

  /* ---------------------------------------------------------
     Override shared global functions used by:
     - Discover
     - Global Radar
     - AI Finder
     --------------------------------------------------------- */
  if(typeof window.scanAdsbLol==="function" || typeof scanAdsbLol==="function"){
    window.scanAdsbLol = scanAdsbLol = async function(name,lat,lon){
      return resilientPrimaryScan(name,lat,lon,250);
    };
  }

  if(typeof window.scanAirplanesLive==="function" || typeof scanAirplanesLive==="function"){
    window.scanAirplanesLive = scanAirplanesLive = async function(name,lat,lon){
      return resilientAirplanesLive(name,lat,lon,250);
    };
  }

  /* ---------------------------------------------------------
     Nearby uses localFeedRequest() rather than scanAdsbLol().
     Override just that request function while preserving all
     Nearby UI, sorting, map and location code.
     --------------------------------------------------------- */
  if(typeof window.localFeedRequest==="function" || typeof localFeedRequest==="function"){
    window.localFeedRequest = localFeedRequest = async function(feed,pos,radius){
      const lat=Number(pos?.lat);
      const lon=Number(pos?.lon);

      if(feed==="adsb.lol"){
        const providers=["adsb.lol","adsb.fi","adsb.one"];
        const failures=[];

        for(let i=0;i<providers.length;i++){
          const provider=providers[i];

          try{
            if(typeof setNearbyStatus==="function"){
              setNearbyStatus(
                i===0
                  ? `Scanning ${radius} NM via adsb.lol…`
                  : `Trying ${provider} for ${radius} NM…`,
                "scanning"
              );
            }

            const result=await providerRequest(provider,"Nearby",lat,lon,radius);

            if(result.aircraft.length){
              return {
                source:result.source,
                aircraft:result.aircraft.map(a=>({
                  ...a,
                  _skyhuntProvider:result.source
                }))
              };
            }

            failures.push(`${result.source}: zero aircraft`);
          }catch(err){
            failures.push(`${provider}: ${err?.message||err}`);
          }

          if(i<providers.length-1){
            await providerSleep(1100);
          }
        }

        throw new Error(`Primary nearby feeds unavailable. ${failures.join(" | ")}`);
      }

      if(feed==="Airplanes.live"){
        const result=await providerRequest("airplanes.live","Nearby",lat,lon,radius);
        return {
          source:result.source,
          aircraft:result.aircraft.map(a=>({
            ...a,
            _skyhuntProvider:result.source
          }))
        };
      }

      throw new Error("Unknown aircraft feed");
    };
  }

  console.info("SKYHUNT aircraft provider recovery active: adsb.lol → adsb.fi → ADSB One → Airplanes.live");
})();
