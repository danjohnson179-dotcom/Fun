/* SKYHUNT — nearby embedded radar with optional detailed aircraft cards */
let nearbyAircraft=[];
let nearbyPosition=null;
let nearbySelectedRadius=50;
let nearbyMap=null;
let nearbyScanning=false;
let nearbyLastSource=null;

function nearbySafeText(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

function distanceNm(lat1,lon1,lat2,lon2){
  const R=3440.065,toRad=value=>value*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function bearingDeg(lat1,lon1,lat2,lon2){
  const r=Math.PI/180,p1=lat1*r,p2=lat2*r,delta=(lon2-lon1)*r;
  const y=Math.sin(delta)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(delta);
  return ((Math.atan2(y,x)/r)%360+360)%360;
}

function compassPoint(deg){
  return ["N","NE","E","SE","S","SW","W","NW"][Math.round(Number(deg)/45)%8];
}

function getBrowserLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error("This browser does not support location access."));
    navigator.geolocation.getCurrentPosition(
      position=>resolve({lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy}),
      error=>reject(new Error(
        error.code===1?"Location permission was denied. Enable location access for SKYHUNT and try again.":
        error.code===2?"Your location could not be determined right now.":
        "The location request timed out. Try again."
      )),
      {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
    );
  });
}

async function localFeedRequest(_feed,pos,radius){
  return window.SKYHUNT_AIRCRAFT_API.point(pos.lat,pos.lon,radius);
}

function friendlyLocalError(error){
  return window.SKYHUNT_AIRCRAFT_API?.friendlyError(error)||String(error?.message||error||"Detailed aircraft service unavailable.");
}

function setNearbyStatus(text,state="idle"){
  nearbyStatus.textContent=text;
  nearbyRadarDot.className="radarDot";
  if(state==="scanning")nearbyRadarDot.classList.add("scanning");
  if(state==="live")nearbyRadarDot.classList.add("liveNow");
}

function nearbyZoom(radius){
  if(radius<=25)return 10;
  if(radius<=50)return 9;
  if(radius<=100)return 8;
  return 7;
}

function initNearbyMap(){
  nearbyMap=$("#nearbyRadarFrame");
  return nearbyMap;
}

function renderNearbyMap(){
  const frame=initNearbyMap();
  if(!frame||!nearbyPosition)return;
  const key=`${Number(nearbyPosition.lat).toFixed(4)}:${Number(nearbyPosition.lon).toFixed(4)}:${nearbySelectedRadius}`;
  if(frame.dataset.radarKey===key)return;
  frame.dataset.radarKey=key;
  frame.src=`https://adsb.lol/?lat=${Number(nearbyPosition.lat).toFixed(4)}&lon=${Number(nearbyPosition.lon).toFixed(4)}&zoom=${nearbyZoom(nearbySelectedRadius)}`;
}

function nearbyValue(value,fallback="—"){
  return value===undefined||value===null||value===""?fallback:String(value);
}
function nearbyCallsign(aircraft){
  return nearbyValue(aircraft?.flight,"").trim()||nearbyValue(aircraft?.r,"").trim()||nearbyValue(aircraft?.hex,"").trim()||"UNKNOWN";
}
function nearbyAltitude(aircraft){
  if(String(aircraft?.alt_baro).toLowerCase()==="ground")return "Ground";
  return Number.isFinite(Number(aircraft?.alt_baro))?`${Math.round(Number(aircraft.alt_baro)).toLocaleString("en-GB")} ft`:"Altitude unavailable";
}
function nearbySpeed(aircraft){
  return Number.isFinite(Number(aircraft?.gs))?`${Math.round(Number(aircraft.gs))} kt`:"Speed unavailable";
}

function nearbyCardHtml(aircraft,index){
  const call=nearbyCallsign(aircraft),type=nearbyValue(aircraft?.t,"Unknown type"),reg=nearbyValue(aircraft?.r,"");
  const distance=Number.isFinite(Number(aircraft?._distance))?Number(aircraft._distance):null;
  const bearing=Number.isFinite(Number(aircraft?._bearing))?Number(aircraft._bearing):null;
  const distanceText=distance!==null?distance.toFixed(1):"—";
  const bearingText=bearing!==null?`${Math.round(bearing)}° ${compassPoint(bearing)}`:"—";
  return `<article class="nearbyAircraftCard">
    <div class="nearbyAircraftMain"><div class="nearbyCall">${nearbySafeText(call)}</div><div class="nearbyType">${nearbySafeText(type)} ${reg?`· ${nearbySafeText(reg)}`:""}</div></div>
    <div class="nearbyDistance">${distanceText} <small>NM</small></div>
    <div class="nearbyAircraftStats">
      <span><b>${nearbySafeText(nearbyAltitude(aircraft))}</b><small>ALTITUDE</small></span>
      <span><b>${nearbySafeText(nearbySpeed(aircraft))}</b><small>SPEED</small></span>
      <span><b>${nearbySafeText(bearingText)}</b><small>BEARING</small></span>
    </div>
    <div class="nearbyAircraftActions">
      <button data-near-open="${index}" class="nearbyAction primary">OPEN TARGET</button>
      <button data-near-save="${index}" class="nearbyAction">＋ CAPTURE</button>
    </div>
  </article>`;
}

function bindNearbyCardActions(){
  nearbyResults.querySelectorAll("[data-near-open]").forEach(button=>button.addEventListener("click",()=>openNearbyAircraft(Number(button.dataset.nearOpen))));
  nearbyResults.querySelectorAll("[data-near-save]").forEach(button=>button.addEventListener("click",()=>{
    const aircraft=nearbyAircraft[Number(button.dataset.nearSave)];
    if(!aircraft)return;
    currentAircraft={...aircraft,_zone:"Nearby",_source:aircraft._localSource||"AirLabs"};
    currentHex=nearbyValue(aircraft.hex,"").trim().toLowerCase();
    currentZone="Nearby";currentSource=aircraft._localSource||"AirLabs";
    lastLat=Number(aircraft.lat);lastLon=Number(aircraft.lon);
    const saved=window.SKYHUNT_COLLECTION?.capture(aircraft,{zone:"Nearby",source:currentSource});
    button.textContent=saved?"CAPTURED ✓":"CAPTURE FAILED";
    button.disabled=!!saved;
  }));
}

function renderNearby(){
  nearbyCount.textContent=nearbyAircraft.length||"LIVE";
  nearbyClosest.textContent=nearbyAircraft.length?`${nearbyAircraft[0]._distance.toFixed(1)} NM`:"—";
  nearbyFeed.textContent=nearbyLastSource||"adsb.lol";
  if(!nearbyAircraft.length)return;
  nearbyResultsSub.textContent=`${nearbyAircraft.length} detailed aircraft sorted by distance. The map remains independently live.`;
  nearbyResults.innerHTML=nearbyAircraft.map(nearbyCardHtml).join("");
  bindNearbyCardActions();
}

function showMapOnlyMessage(message){
  nearbyCount.textContent="LIVE";
  nearbyClosest.textContent="—";
  nearbyFeed.textContent="adsb.lol";
  nearbyResultsSub.textContent="The embedded radar is live; optional detailed cards are unavailable.";
  nearbyResults.innerHTML=`<div class="nearbyEmpty">
    <div class="nearbyEmptyIcon">✈</div>
    <strong>Your live radar is working.</strong>
    <span>Pan, zoom and select aircraft on the map above. ${nearbySafeText(message)}</span>
  </div>`;
}

function openNearbyAircraft(index){
  const aircraft=nearbyAircraft[index];
  if(!aircraft)return;
  renderAircraft(aircraft,"Nearby",aircraft._localSource||"AirLabs");
  showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),150);
}

async function scanNearby(){
  if(nearbyScanning)return;
  nearbyScanning=true;
  nearbyScanBtn.disabled=true;nearbyRefreshBtn.disabled=true;nearbyScanBtn.textContent="LOADING…";
  try{
    setNearbyStatus("Getting your location…","scanning");
    nearbyPosition=await getBrowserLocation();
    renderNearbyMap();
    nearbyLastSource="adsb.lol";
    setNearbyStatus(`Live radar centred on you · ${nearbySelectedRadius} NM view`,"live");
    showMapOnlyMessage("Configure the optional AirLabs key in Cloudflare to add SKYHUNT detail cards.");
    nearbyRefreshBtn.disabled=false;

    try{
      const response=await localFeedRequest("AirLabs",nearbyPosition,nearbySelectedRadius);
      nearbyAircraft=(response.aircraft||[]).map(aircraft=>({
        ...aircraft,
        _distance:distanceNm(nearbyPosition.lat,nearbyPosition.lon,Number(aircraft.lat),Number(aircraft.lon)),
        _bearing:bearingDeg(nearbyPosition.lat,nearbyPosition.lon,Number(aircraft.lat),Number(aircraft.lon)),
        _localSource:response.source
      })).filter(aircraft=>Number.isFinite(aircraft._distance)&&aircraft._distance<=nearbySelectedRadius+1)
        .sort((a,b)=>a._distance-b._distance).slice(0,40);
      nearbyLastSource=response.source;
      if(nearbyAircraft.length){
        setNearbyStatus(`Live radar · ${nearbyAircraft.length} detailed aircraft found`,"live");
        renderNearby();
      }else{
        showMapOnlyMessage("AirLabs returned no positioned aircraft in this radius; the live radar above is unaffected.");
      }
    }catch(detailError){
      showMapOnlyMessage(friendlyLocalError(detailError));
    }
  }catch(locationError){
    setNearbyStatus(locationError.message,"idle");
    nearbyResults.innerHTML=`<div class="nearbyEmpty error"><div class="nearbyEmptyIcon">!</div><strong>Location was not available.</strong><span>${nearbySafeText(locationError.message)}</span></div>`;
  }finally{
    nearbyScanning=false;
    nearbyScanBtn.disabled=false;
    nearbyRefreshBtn.disabled=!nearbyPosition;
    nearbyScanBtn.textContent=nearbyPosition?"SCAN AGAIN":"⌖ USE MY LOCATION & SCAN";
  }
}

function openAbove(){showV2View("nearby");initNearbyMap()}
function closeAbove(){}

document.querySelectorAll("#nearbyRadius button").forEach(button=>button.addEventListener("click",()=>{
  nearbySelectedRadius=Number(button.dataset.radius);
  document.querySelectorAll("#nearbyRadius button").forEach(item=>item.classList.toggle("active",item===button));
  if(nearbyPosition){
    renderNearbyMap();
    setNearbyStatus(`Live radar updated · ${nearbySelectedRadius} NM view`,"live");
    nearbyResultsSub.textContent="Radius changed. Use Refresh to update optional detail cards.";
  }
}));

nearbyScanBtn.addEventListener("click",scanNearby);
nearbyRefreshBtn.addEventListener("click",scanNearby);
