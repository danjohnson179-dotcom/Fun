/* SKYHUNT v5.2.0 — nearby.js */
let nearbyAircraft=[];

function openAbove(){
  aboveBackdrop.classList.add("show");
  aboveBackdrop.setAttribute("aria-hidden","false");
}
function closeAbove(){
  aboveBackdrop.classList.remove("show");
  aboveBackdrop.setAttribute("aria-hidden","true");
}
function distanceNm(lat1,lon1,lat2,lon2){
  const R=3440.065;
  const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function getBrowserLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error("This browser does not support location access."));
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>{
        const msg=e.code===1?"Location permission was denied. Enable location access for this site and try again.":
                  e.code===2?"Your location could not be determined right now.":
                  "Location request timed out. Try again.";
        reject(new Error(msg));
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
    );
  });
}
async function localFeedRequest(feed,pos,radius){
  const lat=Number(pos.lat).toFixed(5);
  const lon=Number(pos.lon).toFixed(5);

  if(feed==="adsb.lol"){
    const url=`https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`;
    const j=await fetchJson(url,10000);
    return {source:"adsb.lol",aircraft:(j.ac||j.aircraft||[]).filter(validAircraft)};
  }

  if(feed==="Airplanes.live"){
    const url=`https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`;
    const j=await fetchJson(url,10000);
    return {source:"Airplanes.live",aircraft:(j.aircraft||j.ac||[]).filter(validAircraft)};
  }

  throw new Error("Unknown feed");
}

function friendlyLocalError(err){
  const msg=String(err?.message||err||"Unknown error");

  if(/aborted|abort/i.test(msg)) return "The live aircraft feed took too long to respond.";
  if(/failed to fetch|load failed|networkerror|network request failed/i.test(msg))
    return "The browser could not connect to that live aircraft feed.";
  if(/HTTP 429/.test(msg)) return "The live aircraft feed is temporarily rate-limiting requests.";
  if(/HTTP 403/.test(msg)) return "The live aircraft feed rejected this browser request.";
  if(/HTTP 5\d\d/.test(msg)) return "The live aircraft service is temporarily unavailable.";

  return msg;
}

async function scanAboveMe(){
  locateBtn.disabled=true;
  aboveList.innerHTML="";
  nearbyAircraft=[];
  aboveStatus.textContent="Getting your location…";

  try{
    const pos=await getBrowserLocation();
    const radii=[25,50,100];
    const feeds=["adsb.lol","Airplanes.live"];
    const failures=[];

    for(const radius of radii){
      for(const feed of feeds){
        aboveStatus.textContent=`Scanning ${radius} NM around you via ${feed}…`;

        try{
          const result=await localFeedRequest(feed,pos,radius);

          if(result.aircraft.length){
            nearbyAircraft=result.aircraft
              .map(a=>({
                ...a,
                _distance:distanceNm(pos.lat,pos.lon,Number(a.lat),Number(a.lon)),
                _localSource:result.source
              }))
              .sort((a,b)=>a._distance-b._distance)
              .slice(0,25);

            aboveStatus.textContent=
              `Found ${nearbyAircraft.length} tracked aircraft within ${radius} NM • ${result.source} • location accuracy ±${Math.round(pos.accuracy)} m`;

            renderNearby();
            return;
          }

          failures.push(`${feed} returned 0 aircraft at ${radius} NM`);
        }catch(err){
          failures.push(`${feed}: ${friendlyLocalError(err)}`);
        }

        // Avoid immediately hammering public endpoints.
        await sleep(1100);
      }
    }

    const technicalFailures=failures.filter(x=>!/returned 0 aircraft/.test(x));

    if(technicalFailures.length>=4){
      aboveStatus.textContent="Both live feeds are currently unreachable from this browser.";
      aboveList.innerHTML=
        `<div class="aboveEmpty">
          <strong style="display:block;color:#fff;margin-bottom:6px">Local radar couldn’t connect.</strong>
          Both aircraft feeds were tried automatically. This can be caused by a temporary API outage, browser/network filtering or rate limiting.
          <br><br>
          <span style="font-size:11px">${safeText(technicalFailures.slice(-2).join(" • "))}</span>
        </div>`;
    }else{
      aboveStatus.textContent="No tracked aircraft found within 100 nautical miles.";
      aboveList.innerHTML=
        `<div class="aboveEmpty">
          Both live feeds were checked at 25, 50 and 100 NM. No usable aircraft positions were returned right now.
          Try another scan in a few minutes.
        </div>`;
    }

  }catch(e){
    const message=friendlyLocalError(e);
    aboveStatus.textContent=message;
    aboveList.innerHTML=
      `<div class="aboveEmpty">
        <strong style="display:block;color:#fff;margin-bottom:6px">Unable to start local radar.</strong>
        ${safeText(message)}
      </div>`;
  }finally{
    locateBtn.disabled=false;
  }
}

function nearbyAltitude(a){
  if(String(a.alt_baro).toLowerCase()==="ground") return "Ground";
  if(a.alt_baro!==undefined&&a.alt_baro!==null&&!isNaN(Number(a.alt_baro))) return `${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
  return "Altitude unavailable";
}
function renderNearby(){
  aboveList.innerHTML=nearbyAircraft.map((a,i)=>{
    const flight=(a.flight||"").trim();
    const title=flight||a.r||a.hex||"Unknown aircraft";
    const type=a.t||"Type unknown";
    const speed=(a.gs!==undefined&&a.gs!==null&&!isNaN(Number(a.gs)))?`${Math.round(Number(a.gs))} kt`:"Speed unavailable";
    return `<article class="nearPlane">
      <div>
        <h4>✈️ ${safeText(title)}</h4>
        <div class="nearMeta">${safeText(type)} • ${safeText(nearbyAltitude(a))} • ${safeText(speed)} • ${a._distance.toFixed(1)} NM away • ${safeText(a._localSource||"Live ADS-B")}</div>
      </div>
      <div class="nearActions">
        <button class="nearBtn" data-track="${i}">FOLLOW LIVE</button>
        <button class="nearBtn capture" data-capture="${i}">SAVE TO HANGAR</button>
      </div>
    </article>`;
  }).join("");

  aboveList.querySelectorAll("[data-track]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const a=nearbyAircraft[Number(btn.dataset.track)];
      closeAbove();
      renderAircraft(a,"your location",a._localSource||"adsb.lol");
      setTimeout(startTracking,180);
    });
  });

  aboveList.querySelectorAll("[data-capture]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const a=nearbyAircraft[Number(btn.dataset.capture)];
      currentAircraft={...a,_zone:"your location",_source:(a._localSource||"Live ADS-B")};
      currentHex=(a.hex||"").trim().toLowerCase();
      currentZone="your location";
      currentSource=a._localSource||"Live ADS-B";
      lastLat=Number(a.lat);lastLon=Number(a.lon);
      saveCurrentCard();
      btn.textContent="SAVED ✓";
    });
  });
}
aboveClose.addEventListener("click",closeAbove);
aboveBackdrop.addEventListener("click",e=>{if(e.target===aboveBackdrop)closeAbove()});
locateBtn.addEventListener("click",scanAboveMe);
