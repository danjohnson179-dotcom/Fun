/* SKYHUNT v5.2.1 — nearby.js
   Full-page Nearby experience. No modal architecture. */

let nearbyAircraft=[];
let nearbyPosition=null;
let nearbySelectedRadius=50;
let nearbyMap=null;
let nearbyLayer=null;
let nearbyUserMarker=null;
let nearbyScanning=false;
let nearbyLastSource=null;

function distanceNm(lat1,lon1,lat2,lon2){
  const R=3440.065;
  const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function bearingDeg(lat1,lon1,lat2,lon2){
  const r=Math.PI/180;
  const p1=lat1*r,p2=lat2*r,dl=(lon2-lon1)*r;
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return ((Math.atan2(y,x)/r)%360+360)%360;
}

function compassPoint(deg){
  const points=["N","NE","E","SE","S","SW","W","NW"];
  return points[Math.round(Number(deg)/45)%8];
}

function getBrowserLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(new Error("This browser does not support location access."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      p=>resolve({
        lat:p.coords.latitude,
        lon:p.coords.longitude,
        accuracy:p.coords.accuracy
      }),
      e=>{
        const msg=
          e.code===1 ? "Location permission was denied. Enable location access for SKYHUNT and try again." :
          e.code===2 ? "Your location could not be determined right now." :
          "The location request timed out. Try again.";
        reject(new Error(msg));
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
    );
  });
}

async function localFeedRequest(feed,pos,radius){
  const lat=Number(pos.lat).toFixed(5);
  const lon=Number(pos.lon).toFixed(5);

  if(feed==="adsb.lol"){
    const j=await fetchJson(`https://api.adsb.lol/v2/point/${lat}/${lon}/${radius}`,10000);
    return {
      source:"adsb.lol",
      aircraft:(j.ac||j.aircraft||[]).filter(validAircraft)
    };
  }

  if(feed==="Airplanes.live"){
    const j=await fetchJson(`https://api.airplanes.live/v2/point/${lat}/${lon}/${radius}`,10000);
    return {
      source:"Airplanes.live",
      aircraft:(j.aircraft||j.ac||[]).filter(validAircraft)
    };
  }

  throw new Error("Unknown aircraft feed.");
}

function friendlyLocalError(err){
  const msg=String(err?.message||err||"Unknown error");
  if(/aborted|abort/i.test(msg))return "The live aircraft feed timed out.";
  if(/failed to fetch|load failed|networkerror|network request failed/i.test(msg))
    return "Your browser could not connect to the live aircraft feed.";
  if(/HTTP 429/.test(msg))return "The live feed is temporarily rate-limiting requests.";
  if(/HTTP 403/.test(msg))return "The live feed rejected this browser request.";
  if(/HTTP 5\d\d/.test(msg))return "The live aircraft service is temporarily unavailable.";
  return msg;
}

function nearbyAltitude(a){
  if(String(a.alt_baro).toLowerCase()==="ground")return "Ground";
  if(Number.isFinite(Number(a.alt_baro)))
    return `${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
  return "Altitude unavailable";
}

function nearbySpeed(a){
  return Number.isFinite(Number(a.gs)) ? `${Math.round(Number(a.gs))} kt` : "Speed unavailable";
}

function setNearbyStatus(text,state="idle"){
  nearbyStatus.textContent=text;
  nearbyRadarDot.className="radarDot";
  if(state==="scanning")nearbyRadarDot.classList.add("scanning");
  if(state==="live")nearbyRadarDot.classList.add("liveNow");
}

function initNearbyMap(){
  if(nearbyMap)return;
  nearbyMap=L.map("nearbyMap",{zoomControl:false}).setView([54,-2],5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:18,
    attribution:"&copy; OpenStreetMap"
  }).addTo(nearbyMap);
  L.control.zoom({position:"bottomright"}).addTo(nearbyMap);
  nearbyLayer=L.layerGroup().addTo(nearbyMap);
}

function nearbyAircraftIcon(a){
  const track=Number.isFinite(Number(a.track))?Number(a.track):0;
  return L.divIcon({
    className:"",
    html:`<div class="nearbyPlaneMarker" style="transform:rotate(${track-45}deg)">✈</div>`,
    iconSize:[28,28],
    iconAnchor:[14,14]
  });
}

function renderNearbyMap(){
  initNearbyMap();
  nearbyLayer.clearLayers();

  if(!nearbyPosition)return;

  if(nearbyUserMarker)nearbyMap.removeLayer(nearbyUserMarker);
  nearbyUserMarker=L.circleMarker(
    [nearbyPosition.lat,nearbyPosition.lon],
    {radius:8,weight:3,fillOpacity:1}
  ).addTo(nearbyMap).bindTooltip("Your location");

  nearbyAircraft.forEach((a,i)=>{
    L.marker([Number(a.lat),Number(a.lon)],{icon:nearbyAircraftIcon(a)})
      .addTo(nearbyLayer)
      .bindTooltip(`${(a.flight||"").trim()||a.r||a.hex||"Aircraft"} · ${a._distance.toFixed(1)} NM`)
      .on("click",()=>openNearbyAircraft(i));
  });

  const radiusKm=nearbySelectedRadius*1.852;
  const bounds=L.latLng(nearbyPosition.lat,nearbyPosition.lon).toBounds(radiusKm*2000);
  nearbyMap.fitBounds(bounds,{padding:[24,24],animate:true});
  setTimeout(()=>nearbyMap.invalidateSize(),50);
}

function renderNearby(){
  nearbyCount.textContent=nearbyAircraft.length;
  nearbyClosest.textContent=nearbyAircraft.length?`${nearbyAircraft[0]._distance.toFixed(1)} NM`:"—";
  nearbyFeed.textContent=nearbyLastSource||"—";
  nearbyResultsSub.textContent=nearbyAircraft.length
    ? `${nearbyAircraft.length} live aircraft sorted by distance.`
    : "No aircraft returned in the selected radius.";

  if(!nearbyAircraft.length){
    nearbyResults.innerHTML=`<div class="nearbyEmpty">
      <div class="nearbyEmptyIcon">◎</div>
      <strong>No tracked aircraft returned.</strong>
      <span>Try a wider radius or refresh in a moment. ADS-B coverage varies by location.</span>
    </div>`;
    renderNearbyMap();
    return;
  }

  nearbyResults.innerHTML=nearbyAircraft.map((a,i)=>{
    const call=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
    const bearing=a._bearing;
    return `<article class="nearbyAircraftCard">
      <div class="nearbyAircraftMain">
        <div class="nearbyCall">${safeText(call)}</div>
        <div class="nearbyType">${safeText(a.t||"Unknown type")} ${a.r?`· ${safeText(a.r)}`:""}</div>
      </div>
      <div class="nearbyDistance">${a._distance.toFixed(1)} <small>NM</small></div>
      <div class="nearbyAircraftStats">
        <span><b>${safeText(nearbyAltitude(a))}</b><small>ALTITUDE</small></span>
        <span><b>${safeText(nearbySpeed(a))}</b><small>SPEED</small></span>
        <span><b>${Math.round(bearing)}° ${compassPoint(bearing)}</b><small>BEARING</small></span>
      </div>
      <div class="nearbyAircraftActions">
        <button data-near-open="${i}" class="nearbyAction primary">OPEN TARGET</button>
        <button data-near-save="${i}" class="nearbyAction">＋ CAPTURE</button>
      </div>
    </article>`;
  }).join("");

  nearbyResults.querySelectorAll("[data-near-open]").forEach(btn=>{
    btn.addEventListener("click",()=>openNearbyAircraft(Number(btn.dataset.nearOpen)));
  });

  nearbyResults.querySelectorAll("[data-near-save]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const a=nearbyAircraft[Number(btn.dataset.nearSave)];
      if(!a)return;
      currentAircraft={...a,_zone:"Nearby",_source:a._localSource||"Live ADS-B"};
      currentHex=(a.hex||"").trim().toLowerCase();
      currentZone="Nearby";
      currentSource=a._localSource||"Live ADS-B";
      lastLat=Number(a.lat);
      lastLon=Number(a.lon);
      saveCurrentCard();
      btn.textContent="CAPTURED ✓";
    });
  });

  renderNearbyMap();
}

function openNearbyAircraft(index){
  const a=nearbyAircraft[index];
  if(!a)return;
  renderAircraft(a,"Nearby",a._localSource||"Live ADS-B");
  showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

async function requestNearbyFeed(pos,radius){
  // Primary feed first. Only fall back if the request fails or returns no usable aircraft.
  let primaryError=null;
  try{
    setNearbyStatus(`Scanning ${radius} NM via adsb.lol…`,"scanning");
    const primary=await localFeedRequest("adsb.lol",pos,radius);
    if(primary.aircraft.length)return primary;
  }catch(err){
    primaryError=err;
  }

  // Public fallback is deliberately spaced.
  await sleep(1100);

  try{
    setNearbyStatus(`Trying backup live feed for ${radius} NM…`,"scanning");
    const fallback=await localFeedRequest("Airplanes.live",pos,radius);
    if(fallback.aircraft.length)return fallback;

    // A successful zero-result is still a valid response.
    if(!primaryError)return fallback;
  }catch(err){
    if(primaryError){
      throw new Error(`${friendlyLocalError(primaryError)} Backup feed: ${friendlyLocalError(err)}`);
    }
    throw err;
  }

  return {source:"adsb.lol",aircraft:[]};
}

async function scanNearby(){
  if(nearbyScanning)return;

  nearbyScanning=true;
  nearbyScanBtn.disabled=true;
  nearbyRefreshBtn.disabled=true;
  nearbyScanBtn.textContent="SCANNING…";
  nearbyAircraft=[];
  nearbyLastSource=null;
  nearbyCount.textContent="0";
  nearbyClosest.textContent="—";
  nearbyFeed.textContent="—";
  nearbyResults.innerHTML=`<div class="nearbyEmpty">
    <div class="nearbyLoadingRing"></div>
    <strong>Finding your local traffic…</strong>
    <span>Getting your position and checking the live aircraft feeds.</span>
  </div>`;

  try{
    setNearbyStatus("Getting your location…","scanning");
    nearbyPosition=await getBrowserLocation();

    const result=await requestNearbyFeed(nearbyPosition,nearbySelectedRadius);
    nearbyLastSource=result.source;

    nearbyAircraft=(result.aircraft||[])
      .map(a=>({
        ...a,
        _distance:distanceNm(
          nearbyPosition.lat,nearbyPosition.lon,
          Number(a.lat),Number(a.lon)
        ),
        _bearing:bearingDeg(
          nearbyPosition.lat,nearbyPosition.lon,
          Number(a.lat),Number(a.lon)
        ),
        _localSource:result.source
      }))
      .filter(a=>Number.isFinite(a._distance)&&a._distance<=nearbySelectedRadius+1)
      .sort((a,b)=>a._distance-b._distance)
      .slice(0,40);

    setNearbyStatus(
      nearbyAircraft.length
        ? `Live local radar · ${nearbyAircraft.length} aircraft found`
        : `Scan complete · no aircraft returned within ${nearbySelectedRadius} NM`,
      "live"
    );

    renderNearby();

  }catch(err){
    const msg=friendlyLocalError(err);
    setNearbyStatus(msg,"idle");
    nearbyResults.innerHTML=`<div class="nearbyEmpty error">
      <div class="nearbyEmptyIcon">!</div>
      <strong>Nearby scan could not complete.</strong>
      <span>${safeText(msg)}</span>
    </div>`;
  }finally{
    nearbyScanning=false;
    nearbyScanBtn.disabled=false;
    nearbyRefreshBtn.disabled=false;
    nearbyScanBtn.textContent=nearbyPosition?"SCAN AGAIN":"⌖ USE MY LOCATION & SCAN";
  }
}

function openAbove(){
  showV2View("nearby");
  setTimeout(()=>{
    initNearbyMap();
    nearbyMap.invalidateSize();
  },80);
}

// Kept for shared Escape-handler compatibility. Nearby is no longer a modal.
function closeAbove(){}

document.querySelectorAll("#nearbyRadius button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    nearbySelectedRadius=Number(btn.dataset.radius);
    document.querySelectorAll("#nearbyRadius button").forEach(b=>b.classList.toggle("active",b===btn));

    if(nearbyPosition){
      nearbyResultsSub.textContent=`Radius changed to ${nearbySelectedRadius} NM. Tap refresh to rescan.`;
      renderNearbyMap();
    }
  });
});

nearbyScanBtn.addEventListener("click",scanNearby);
nearbyRefreshBtn.addEventListener("click",scanNearby);
