/* SKYHUNT — nearby.js */

let nearbyAircraft=[];
let nearbyPosition=null;
let nearbySelectedRadius=50;
let nearbyMap=null;
let nearbyLayer=null;
let nearbyUserMarker=null;
let nearbyScanning=false;

function nearbySafeText(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
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
  return window.SKYHUNT_AIRCRAFT_API.point(pos.lat,pos.lon,radius);
}

function friendlyLocalError(err){
  return window.SKYHUNT_AIRCRAFT_API.friendlyError(err);
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

function nearbyValue(value,fallback="—"){
  if(value===undefined||value===null||value==="")return fallback;
  return String(value);
}

function nearbyCallsign(a){
  const flight=nearbyValue(a?.flight,"").trim();
  if(flight)return flight;
  const reg=nearbyValue(a?.r,"").trim();
  if(reg)return reg;
  const hex=nearbyValue(a?.hex,"").trim();
  return hex||"UNKNOWN";
}

function nearbyCardHtml(a,i){
  try{
    const call=nearbyCallsign(a);
    const type=nearbyValue(a?.t,"Unknown type");
    const reg=nearbyValue(a?.r,"");
    const distance=Number.isFinite(Number(a?._distance))?Number(a._distance):null;
    const bearing=Number.isFinite(Number(a?._bearing))?Number(a._bearing):null;
    const distanceText=distance!==null?distance.toFixed(1):"—";
    const bearingText=bearing!==null?`${Math.round(bearing)}° ${compassPoint(bearing)}`:"—";

    return `<article class="nearbyAircraftCard">
      <div class="nearbyAircraftMain">
        <div class="nearbyCall">${nearbySafeText(call)}</div>
        <div class="nearbyType">${nearbySafeText(type)} ${reg?`· ${nearbySafeText(reg)}`:""}</div>
      </div>
      <div class="nearbyDistance">${distanceText} <small>NM</small></div>
      <div class="nearbyAircraftStats">
        <span><b>${nearbySafeText(nearbyAltitude(a))}</b><small>ALTITUDE</small></span>
        <span><b>${nearbySafeText(nearbySpeed(a))}</b><small>SPEED</small></span>
        <span><b>${nearbySafeText(bearingText)}</b><small>BEARING</small></span>
      </div>
      <div class="nearbyAircraftActions">
        <button data-near-open="${i}" class="nearbyAction primary">OPEN TARGET</button>
        <button data-near-save="${i}" class="nearbyAction">＋ CAPTURE</button>
      </div>
    </article>`;
  }catch(err){
    console.warn("SKYHUNT Nearby: skipped malformed aircraft record",err,a);
    return "";
  }
}

function bindNearbyCardActions(){
  nearbyResults.querySelectorAll("[data-near-open]").forEach(btn=>{
    btn.addEventListener("click",()=>openNearbyAircraft(Number(btn.dataset.nearOpen)));
  });

  nearbyResults.querySelectorAll("[data-near-save]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const a=nearbyAircraft[Number(btn.dataset.nearSave)];
      if(!a)return;
      currentAircraft={...a,_zone:"Nearby",_source:a._localSource||"Live ADS-B"};
      currentHex=nearbyValue(a.hex,"").trim().toLowerCase();
      currentZone="Nearby";
      currentSource=a._localSource||"Live ADS-B";
      lastLat=Number(a.lat);
      lastLon=Number(a.lon);
      const ok=window.SKYHUNT_COLLECTION?.capture(a,{zone:"Nearby",source:a._localSource||"Live ADS-B"});
      btn.textContent=ok?"CAPTURED ✓":"CAPTURE FAILED";
      btn.disabled=!!ok;
    });
  });
}

function renderNearby(){
  nearbyCount.textContent=nearbyAircraft.length;
  nearbyClosest.textContent=nearbyAircraft.length&&Number.isFinite(Number(nearbyAircraft[0]._distance))
    ? `${Number(nearbyAircraft[0]._distance).toFixed(1)} NM`
    : "—";
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

  const cards=nearbyAircraft.map((a,i)=>nearbyCardHtml(a,i)).filter(Boolean).join("");

  nearbyResults.innerHTML=cards||`<div class="nearbyEmpty error">
    <div class="nearbyEmptyIcon">!</div>
    <strong>Aircraft were found but their details could not be displayed.</strong>
    <span>Refresh the scan to try again.</span>
  </div>`;

  bindNearbyCardActions();

  // Map rendering is deliberately last. A Leaflet/map issue must not prevent list results.
  try{
    renderNearbyMap();
  }catch(err){
    console.warn("SKYHUNT Nearby map render warning",err);
  }
}

function openNearbyAircraft(index){
  const a=nearbyAircraft[index];
  if(!a)return;
  renderAircraft(a,"Nearby",a._localSource||"Live ADS-B");
  showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

async function requestNearbyFeed(pos,radius){
  setNearbyStatus(`Scanning ${radius} NM via adsb.fi…`,"scanning");
  return localFeedRequest("adsb.fi",pos,radius);
}

async function scanNearby(){
  if(nearbyScanning)return;

  const hadResults=nearbyAircraft.length>0;
  nearbyScanning=true;
  nearbyScanBtn.disabled=true;
  nearbyRefreshBtn.disabled=true;
  nearbyScanBtn.textContent="SCANNING…";

  if(!hadResults){
    nearbyCount.textContent="0";
    nearbyClosest.textContent="—";
    nearbyFeed.textContent="—";
    nearbyResults.innerHTML=`<div class="nearbyEmpty">
      <div class="nearbyLoadingRing"></div>
      <strong>Finding your local traffic…</strong>
      <span>Getting your position and checking the live aircraft feeds.</span>
    </div>`;
  }else{
    nearbyResultsSub.textContent="Refreshing live aircraft… current results remain visible.";
  }

  try{
    setNearbyStatus("Getting your location…","scanning");
    const nextPosition=await getBrowserLocation();
    const result=await requestNearbyFeed(nextPosition,nearbySelectedRadius);

    const nextAircraft=(result.aircraft||[])
      .map(a=>({
        ...a,
        _distance:distanceNm(nextPosition.lat,nextPosition.lon,Number(a.lat),Number(a.lon)),
        _bearing:bearingDeg(nextPosition.lat,nextPosition.lon,Number(a.lat),Number(a.lon)),
        _localSource:result.source
      }))
      .filter(a=>Number.isFinite(a._distance)&&a._distance<=nearbySelectedRadius+1)
      .sort((a,b)=>a._distance-b._distance)
      .slice(0,40);

    // Commit the new scan only after all processing succeeded.
    nearbyPosition=nextPosition;
    nearbyLastSource=result.source;
    nearbyAircraft=nextAircraft;

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

    if(hadResults&&nearbyAircraft.length){
      nearbyResultsSub.textContent=`Refresh failed · showing previous results. ${msg}`;
    }else{
      nearbyResults.innerHTML=`<div class="nearbyEmpty error">
        <div class="nearbyEmptyIcon">!</div>
        <strong>Nearby scan could not complete.</strong>
        <span>${nearbySafeText(msg)}</span>
      </div>`;
    }
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
