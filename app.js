/*
SKYHUNT v5.1.3 — SAFE FILE REFACTOR
Core JavaScript remains together intentionally in this first split so functionality is unchanged.
Feature files are prepared for the next modularisation pass but are not loaded by index.html yet.
*/
const $=s=>document.querySelector(s);

const spinBtn=$("#spinBtn"),spinAgain=$("#spinAgain"),scan=$("#scan"),errorBox=$("#error"),result=$("#result");
const showMapBtn=$("#showMapBtn"),mapSection=$("#mapSection"),autoFollowBtn=$("#autoFollowBtn"),centreBtn=$("#centreBtn");
const saveCardBtn=$("#saveCardBtn");
const hangarBackdrop=$("#hangarBackdrop"),hangarClose=$("#hangarClose"),hangarGrid=$("#hangarGrid"),collectorToast=$("#collectorToast");
const aboveBackdrop=$("#aboveBackdrop"),aboveClose=$("#aboveClose"),locateBtn=$("#locateBtn"),aboveStatus=$("#aboveStatus"),aboveList=$("#aboveList");
const totalCards=$("#totalCards"),uniqueTypes=$("#uniqueTypes"),rareCards=$("#rareCards"),uniqueAircraft=$("#uniqueAircraft"),progressText=$("#progressText"),progressFill=$("#progressFill"),menuHangarCount=$("#menuHangarCount"),clearHangar=$("#clearHangar");
const mapMeta=$("#mapMeta"),trackStatus=$("#trackStatus"),versionBtn=$("#versionBtn"),releaseBackdrop=$("#releaseBackdrop"),releaseClose=$("#releaseClose");

let lastLat=null,lastLon=null,currentHex=null,currentZone=null,currentSource=null,currentAircraft=null;
let map=null,planeMarker=null,trailLine=null,trailPoints=[];
let trackingTimer=null,trackingBusy=false,autoFollow=true,lastTrack=null;

const zones=[
 ["London",51.4700,-0.4543],["Paris",49.0097,2.5479],["Amsterdam",52.3105,4.7683],["Frankfurt",50.0379,8.5622],
 ["Madrid",40.4983,-3.5676],["Rome",41.8003,12.2389],["Istanbul",41.2753,28.7519],["Dubai",25.2532,55.3657],
 ["Doha",25.2731,51.6081],["New York",40.6413,-73.7781],["Chicago",41.9742,-87.9073],["Atlanta",33.6407,-84.4277],
 ["Los Angeles",33.9416,-118.4085],["Toronto",43.6777,-79.6248],["São Paulo",-23.4356,-46.4731],
 ["Singapore",1.3644,103.9915],["Bangkok",13.6900,100.7501],["Tokyo",35.5494,139.7798],
 ["Seoul",37.4602,126.4407],["Hong Kong",22.3080,113.9185],["Delhi",28.5562,77.1000],
 ["Mumbai",19.0896,72.8656],["Sydney",-33.9399,151.1753],["Melbourne",-37.6690,144.8410],
 ["Johannesburg",-26.1337,28.2420],["Cairo",30.1219,31.4056]
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const choose=a=>a[Math.floor(Math.random()*a.length)];
const validAircraft=a=>Number.isFinite(Number(a?.lat))&&Number.isFinite(Number(a?.lon))&&(a?.flight||a?.r||a?.hex);

function showError(msg){errorBox.textContent=msg;errorBox.style.display="block"}
function clearError(){errorBox.style.display="none";errorBox.textContent=""}

async function fetchJson(url,timeout=9000){
 const ctl=new AbortController();
 const t=setTimeout(()=>ctl.abort(),timeout);
 try{
  const r=await fetch(url,{signal:ctl.signal,cache:"no-store",headers:{Accept:"application/json"}});
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{throw new Error(`Invalid JSON from ${new URL(url).hostname}`)}
  if(!r.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${r.status}`);
  return data;
 }finally{clearTimeout(t)}
}

async function scanAdsbLol(name,lat,lon){
 scan.textContent=`Scanning live aircraft near ${name}…`;
 const j=await fetchJson(`https://api.adsb.lol/v2/point/${lat}/${lon}/250`);
 return (j.ac||[]).filter(validAircraft);
}

async function scanAirplanesLive(name,lat,lon){
 scan.textContent=`Trying backup radar near ${name}…`;
 const j=await fetchJson(`https://api.airplanes.live/v2/point/${lat}/${lon}/250`);
 return (j.aircraft||j.ac||[]).filter(validAircraft);
}

function stopTracking(){
 if(trackingTimer){clearInterval(trackingTimer);trackingTimer=null}
 trackingBusy=false;
}

function resetTrackingMap(){
 stopTracking();
 trailPoints=[];
 if(trailLine){trailLine.setLatLngs([])}
 mapSection.style.display="none";
}

async function findRealAircraft(){
 clearError();
 result.style.display="none";
 resetTrackingMap();
 spinBtn.disabled=true;spinAgain.disabled=true;spinBtn.classList.add("loading");

 let technicalErrors=[];
 try{
   const shuffled=[...zones].sort(()=>Math.random()-.5).slice(0,8);

   for(let i=0;i<shuffled.length;i++){
     const [name,lat,lon]=shuffled[i];

     try{
       const list=await scanAdsbLol(name,lat,lon);
       if(list.length){
         renderAircraft(choose(list),name,"adsb.lol");
         return;
       }
     }catch(e){technicalErrors.push(`adsb.lol: ${e.message}`)}

     await sleep(1050);

     try{
       const list2=await scanAirplanesLive(name,lat,lon);
       if(list2.length){
         renderAircraft(choose(list2),name,"Airplanes.live");
         return;
       }
     }catch(e){technicalErrors.push(`Airplanes.live: ${e.message}`)}

     if(i<shuffled.length-1) await sleep(1050);
   }

   if(technicalErrors.length>=4){
     throw new Error("The live feeds are being blocked or rate-limited. "+technicalErrors.slice(-2).join(" | "));
   }
   throw new Error("The live APIs returned zero usable aircraft in all scanned regions.");
 }catch(e){
   showError("Couldn’t find a live aircraft: "+e.message);
   scan.textContent="Live feed unavailable right now.";
 }finally{
   spinBtn.disabled=false;spinAgain.disabled=false;spinBtn.classList.remove("loading");
 }
}

function renderAircraft(a,zone,source){
 const flight=(a.flight||"").trim();
 currentHex=(a.hex||"").trim().toLowerCase();
 currentZone=zone;
 currentSource=source;
 currentAircraft={...a, _zone:zone, _source:source};
 saveCardBtn.classList.remove("saved");
 saveCardBtn.textContent="🃏 SAVE COLLECTOR CARD TO HANGAR";

 $("#callsign").textContent=flight||a.r||a.hex||"UNKNOWN";
 $("#ident").textContent=flight?`Callsign ${flight} • ${source}`:a.r?`Registration ${a.r} • ${source}`:`ICAO ${a.hex||"unknown"} • ${source}`;

 updateTelemetry(a);

 lastLat=Number(a.lat);lastLon=Number(a.lon);
 $("#where").textContent=`Near ${zone}`;
 $("#whereSub").textContent=`${lastLat.toFixed(3)}, ${lastLon.toFixed(3)} • ${source}`;

 showMapBtn.disabled=!currentHex;
 showMapBtn.textContent=currentHex?"📡 FOLLOW LIVE":"LIVE FOLLOW UNAVAILABLE";

 result.style.display="block";
 scan.textContent=`Real aircraft found via ${source} ✈️`;
 setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),80);
}

function updateTelemetry(a){
 const onGround=String(a.alt_baro).toLowerCase()==="ground";
 $("#airState").textContent=onGround?"ON GROUND":"AIRBORNE";

 if(Number.isFinite(Number(a.lat))&&Number.isFinite(Number(a.lon))){
   lastLat=Number(a.lat);lastLon=Number(a.lon);
   $("#whereSub").textContent=`${lastLat.toFixed(3)}, ${lastLon.toFixed(3)}${currentSource?` • ${currentSource}`:""}`;
 }

 let alt="Not available";
 if(onGround) alt="Ground";
 else if(a.alt_baro!==undefined&&a.alt_baro!==null&&!isNaN(Number(a.alt_baro))) alt=`${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
 $("#altitude").textContent=alt;

 $("#speed").textContent=(a.gs!==undefined&&a.gs!==null&&!isNaN(Number(a.gs)))?`${Math.round(Number(a.gs))} kt`:"Not available";
 $("#heading").textContent=(a.track!==undefined&&a.track!==null&&!isNaN(Number(a.track)))?`${Math.round(Number(a.track))}°`:"Not available";
 $("#type").textContent=a.t||"Not available";
 $("#typeMore").textContent=a.desc||"ICAO aircraft type code where available";
 $("#registration").textContent=a.r||"Not available";
 $("#icao").textContent=`ICAO hex: ${a.hex||currentHex||"Not available"}`;

 lastTrack=Number.isFinite(Number(a.track))?Number(a.track):lastTrack;
}

function planeIcon(track){
 const heading=Number.isFinite(Number(track))?Number(track):0;
 return L.divIcon({
   className:"",
   html:`<div class="planeMarker" style="transform:rotate(${heading-45}deg)">✈️</div>`,
   iconSize:[36,36],
   iconAnchor:[18,18]
 });
}

function initMap(){
 if(map) return;
 map=L.map("liveMap",{zoomControl:true,attributionControl:true});
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
   maxZoom:19,
   attribution:'&copy; OpenStreetMap contributors'
 }).addTo(map);

 trailLine=L.polyline([],{weight:4,opacity:.72}).addTo(map);
}

function updateMapPoint(a,initial=false){
 if(!Number.isFinite(Number(a.lat))||!Number.isFinite(Number(a.lon))) return;

 const lat=Number(a.lat),lon=Number(a.lon);
 lastLat=lat;lastLon=lon;

 const point=[lat,lon];
 const prev=trailPoints[trailPoints.length-1];
 if(!prev || Math.abs(prev[0]-lat)>.00001 || Math.abs(prev[1]-lon)>.00001){
   trailPoints.push(point);
   if(trailPoints.length>120) trailPoints.shift();
   trailLine.setLatLngs(trailPoints);
 }

 if(!planeMarker){
   planeMarker=L.marker(point,{icon:planeIcon(a.track)}).addTo(map);
 }else{
   planeMarker.setLatLng(point);
   planeMarker.setIcon(planeIcon(a.track));
 }

 const label=((a.flight||"").trim()||a.r||a.hex||"Aircraft");
 planeMarker.bindPopup(`<strong>${label}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`);

 if(initial){
   map.setView(point,8);
 }else if(autoFollow){
   map.panTo(point,{animate:true,duration:.7});
 }

 mapMeta.textContent=`Last live fix: ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} • ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

async function refreshTrackedAircraft(){
 if(!currentHex||trackingBusy) return;
 trackingBusy=true;

 try{
   const j=await fetchJson(`https://api.adsb.lol/v2/icao/${encodeURIComponent(currentHex)}`,8000);
   const list=(j.ac||[]).filter(validAircraft);

   if(!list.length){
     trackStatus.textContent="● WAITING";
     mapMeta.textContent="No fresh position returned. Keeping the last known location and trying again…";
     return;
   }

   const a=list[0];
   currentSource="adsb.lol";
   currentAircraft={...(currentAircraft||{}),...a,_zone:currentZone,_source:"adsb.lol"};
   updateTelemetry(a);
   updateMapPoint(a,false);
   trackStatus.textContent="● TRACKING";
 }catch(e){
   trackStatus.textContent="● RETRYING";
   mapMeta.textContent=`Live refresh failed (${e.message}). The tracker will retry automatically.`;
 }finally{
   trackingBusy=false;
 }
}

function startTracking(){
 if(!currentHex){
   showError("This aircraft does not have a usable ICAO hex address, so live follow is unavailable.");
   return;
 }

 initMap();
 mapSection.style.display="block";
 setTimeout(()=>map.invalidateSize(),100);

 const initialAircraft={
   lat:lastLat,
   lon:lastLon,
   track:lastTrack,
   flight:$("#callsign").textContent,
   hex:currentHex
 };
 updateMapPoint(initialAircraft,true);

 stopTracking();
 refreshTrackedAircraft();
 trackingTimer=setInterval(refreshTrackedAircraft,5000);

 showMapBtn.textContent="📡 FOLLOWING LIVE";
 setTimeout(()=>mapSection.scrollIntoView({behavior:"smooth",block:"start"}),120);
}



let nearbyAircraft=[];

function openAbove(){
  closeMenu();
  aboveBackdrop.classList.add("show");
  aboveBackdrop.setAttribute("aria-hidden","false");
}
function closeAbove(){
  aboveBackdrop.classList.remove("show");
  aboveBackdrop.setAttribute("aria-hidden","true");
  if(!document.querySelector(".bottomNav button.active[data-view]")) showV2View("spin");
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



// ===== v5.1.0.1 SKY LENS =====
const skyLensBackdrop=$("#skyLensBackdrop"),skyLensVideo=$("#skyLensVideo"),skyLensClose=$("#skyLensClose");
const skyLensStart=$("#skyLensStart"),lensStartBtn=$("#lensStartBtn"),lensUnsupported=$("#lensUnsupported");
const skyLensTargets=$("#skyLensTargets"),skyLensHeading=$("#skyLensHeading"),lensStatus=$("#lensStatus");
const lensHelp=$("#lensHelp"),lensTargetCount=$("#lensTargetCount"),lensRescanBtn=$("#lensRescanBtn"),lensOpenBestBtn=$("#lensOpenBestBtn");

let lensStream=null,lensPosition=null,lensHeading=0,lensPitch=0,lensAircraft=[],lensBest=null,lensActive=false;
let lensOrientationHandler=null;

function normalizeDeg(x){return ((x%360)+360)%360}
function shortestAngle(target,current){
  let d=normalizeDeg(target)-normalizeDeg(current);
  if(d>180)d-=360;
  if(d<-180)d+=360;
  return d;
}
function bearingDeg(lat1,lon1,lat2,lon2){
  const r=Math.PI/180;
  const p1=lat1*r,p2=lat2*r,dl=(lon2-lon1)*r;
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return normalizeDeg(Math.atan2(y,x)/r);
}
function distanceKm(lat1,lon1,lat2,lon2){
  const R=6371,r=Math.PI/180,dlat=(lat2-lat1)*r,dlon=(lon2-lon1)*r;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dlon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function estimatedElevationDeg(distanceKmValue,altFeet){
  const altKm=(Number(altFeet)||0)*0.0003048;
  if(distanceKmValue<=0.01)return 90;
  return Math.atan2(Math.max(0,altKm),distanceKmValue)*180/Math.PI;
}
function lensAltitudeFeet(a){
  if(String(a.alt_baro).toLowerCase()==="ground")return 0;
  return Number.isFinite(Number(a.alt_baro))?Number(a.alt_baro):0;
}
function getLensLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error("Location is not supported on this browser."));
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(new Error(e.code===1?"Location permission was denied.":"Unable to determine your location.")),
      {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
    )
  })
}
async function requestOrientationPermissionIfNeeded(){
  if(typeof DeviceOrientationEvent!=="undefined" && typeof DeviceOrientationEvent.requestPermission==="function"){
    const result=await DeviceOrientationEvent.requestPermission();
    if(result!=="granted")throw new Error("Motion & Orientation permission was not granted.");
  }
}
function orientationHeading(e){
  // iOS Safari exposes webkitCompassHeading; otherwise alpha is used as a best-effort fallback.
  if(typeof e.webkitCompassHeading==="number")return normalizeDeg(e.webkitCompassHeading);
  if(typeof e.alpha==="number")return normalizeDeg(360-e.alpha);
  return lensHeading;
}
function startOrientation(){
  lensOrientationHandler=e=>{
    lensHeading=orientationHeading(e);
    lensPitch=Number.isFinite(Number(e.beta))?Number(e.beta):0;
    skyLensHeading.textContent=`HEADING ${Math.round(lensHeading).toString().padStart(3,"0")}°`;
    renderLensTargets();
  };
  window.addEventListener("deviceorientation",lensOrientationHandler,true);
}
function stopOrientation(){
  if(lensOrientationHandler)window.removeEventListener("deviceorientation",lensOrientationHandler,true);
  lensOrientationHandler=null;
}
async function scanLensAircraft(){
  if(!lensPosition)return;
  lensStatus.textContent="Scanning nearby live aircraft…";
  const result=await localFeedRequest("adsb.lol",lensPosition,40).catch(async()=>{
    await sleep(1100);
    return localFeedRequest("Airplanes.live",lensPosition,40);
  });
  lensAircraft=(result.aircraft||[]).map(a=>{
    const dist=distanceKm(lensPosition.lat,lensPosition.lon,Number(a.lat),Number(a.lon));
    return {...a,_lensDistanceKm:dist,_lensBearing:bearingDeg(lensPosition.lat,lensPosition.lon,Number(a.lat),Number(a.lon)),_lensSource:result.source};
  }).sort((a,b)=>a._lensDistanceKm-b._lensDistanceKm).slice(0,18);
  lensTargetCount.textContent=`${lensAircraft.length} TARGET${lensAircraft.length===1?"":"S"}`;
  lensStatus.textContent=lensAircraft.length?`Tracking ${lensAircraft.length} nearby aircraft via ${result.source}.`:"No nearby tracked aircraft found.";
  renderLensTargets();
}
function renderLensTargets(){
  if(!lensActive||!lensAircraft.length){
    skyLensTargets.innerHTML="";
    lensBest=null;
    return;
  }

  const fovH=58; // approximate mobile camera horizontal FOV
  const fovV=72; // approximate vertical FOV
  const w=window.innerWidth,h=window.innerHeight;
  let candidates=[];

  lensAircraft.forEach(a=>{
    const az=shortestAngle(a._lensBearing,lensHeading);
    const elev=estimatedElevationDeg(a._lensDistanceKm,lensAltitudeFeet(a));
    // beta is ~90 when phone held upright; turn that into a rough camera elevation.
    const cameraElev=Math.max(-30,Math.min(70,90-Math.abs(lensPitch)));
    const elDiff=elev-cameraElev;
    const visible=Math.abs(az)<fovH*.72 && Math.abs(elDiff)<fovV*.62;
    if(!visible)return;

    const x=w/2+(az/(fovH/2))*(w*.43);
    const y=h/2-(elDiff/(fovV/2))*(h*.34);
    const score=Math.abs(az)+Math.abs(elDiff)*.7+a._lensDistanceKm*.03;
    candidates.push({a,x,y,score});
  });

  candidates.sort((a,b)=>a.score-b.score);
  lensBest=candidates[0]?.a||lensAircraft[0]||null;

  skyLensTargets.innerHTML=candidates.slice(0,7).map((o,i)=>{
    const a=o.a,call=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
    const alt=String(a.alt_baro).toLowerCase()==="ground"?"Ground":Number.isFinite(Number(a.alt_baro))?`${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`:"Alt —";
    return `<button class="lensTarget ${i===0?"best":""}" data-lens-index="${lensAircraft.indexOf(a)}" style="left:${Math.max(72,Math.min(w-72,o.x))}px;top:${Math.max(120,Math.min(h-155,o.y))}px">
      <span class="lensArrow">⌃</span>
      <div class="lensCall">${safeText(call)}</div>
      <div class="lensMeta">${safeText(a.t||"Unknown type")} · ${safeText(alt)}<br>${a._lensDistanceKm.toFixed(1)} km · ${Math.round(a._lensBearing)}°</div>
    </button>`;
  }).join("");

  skyLensTargets.querySelectorAll("[data-lens-index]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const a=lensAircraft[Number(btn.dataset.lensIndex)];
      if(a)openLensAircraft(a);
    })
  });

  if(!candidates.length){
    lensHelp.textContent="No aircraft are currently inside the estimated camera field of view. Turn slowly while keeping the phone upright.";
  }else{
    lensHelp.textContent="Target positions are approximate. Turn slowly and use the highlighted target as the best current match.";
  }
}
function openLensAircraft(a){
  closeSkyLens();
  renderAircraft(a,"Sky Lens",a._lensSource||"Live ADS-B");
  showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),180);
}
async function startSkyLens(){
  lensUnsupported.style.display="none";
  lensStartBtn.disabled=true;
  lensStartBtn.textContent="STARTING…";
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera access is not supported in this browser.");
    await requestOrientationPermissionIfNeeded();
    lensPosition=await getLensLocation();
    lensStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    skyLensVideo.srcObject=lensStream;
    await skyLensVideo.play();
    lensActive=true;
    skyLensStart.classList.add("hidden");
    startOrientation();
    await scanLensAircraft();
  }catch(e){
    lensUnsupported.textContent=e.message||"Sky Lens could not start.";
    lensUnsupported.style.display="block";
  }finally{
    lensStartBtn.disabled=false;
    lensStartBtn.textContent="START SKY LENS";
  }
}
function openSkyLens(){
  closeMenu();
  skyLensBackdrop.classList.add("show");
  skyLensBackdrop.setAttribute("aria-hidden","false");
  skyLensStart.classList.remove("hidden");
}
function closeSkyLens(){
  lensActive=false;
  stopOrientation();
  if(lensStream){lensStream.getTracks().forEach(t=>t.stop());lensStream=null}
  skyLensVideo.srcObject=null;
  skyLensTargets.innerHTML="";
  lensAircraft=[];
  lensBest=null;
  skyLensBackdrop.classList.remove("show");
  skyLensBackdrop.setAttribute("aria-hidden","true");
}
skyLensClose.addEventListener("click",closeSkyLens);
lensStartBtn.addEventListener("click",startSkyLens);
lensRescanBtn.addEventListener("click",scanLensAircraft);
lensOpenBestBtn.addEventListener("click",()=>{if(lensBest)openLensAircraft(lensBest)});
window.addEventListener("resize",renderLensTargets);



// ===== v5.1.0.1 — AI FINDER =====
const aiFinderBackdrop=$("#aiFinderBackdrop"),aiMessages=$("#aiMessages"),aiInput=$("#aiInput");
const aiSend=$("#aiSend"),aiClose=$("#aiClose");
let aiLastMatches=[];

const AI_AIRLINES={
  "british airways":["BAW","SHT"],"ba":["BAW","SHT"],"ryanair":["RYR"],"easyjet":["EZY"],
  "lufthansa":["DLH"],"emirates":["UAE"],"qatar":["QTR"],"qatar airways":["QTR"],
  "american airlines":["AAL"],"delta":["DAL"],"united":["UAL"],"klm":["KLM"],
  "air france":["AFR"],"virgin atlantic":["VIR"],"turkish":["THY"],"wizz":["WZZ"],
  "wizz air":["WZZ"],"jet2":["EXS"],"tui":["TOM"],"singapore airlines":["SIA"],
  "cathay pacific":["CPA"],"etihad":["ETD"],"southwest":["SWA"],"fedex":["FDX"],"ups":["UPS"]
};
const AI_TYPES={
  "a380":["A388"],"airbus a380":["A388"],"747":["B741","B742","B743","B744","B748"],
  "boeing 747":["B741","B742","B743","B744","B748"],"787":["B788","B789","B78X"],
  "dreamliner":["B788","B789","B78X"],"777":["B772","B773","B77L","B77W"],
  "a350":["A359","A35K"],"a330":["A332","A333","A338","A339"],
  "a320":["A318","A319","A320","A321","A20N","A21N"],"737":["B736","B737","B738","B739","B38M","B39M"]
};
function aiEsc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function aiAddBubble(text,who="bot",htmlMode=false){
  const d=document.createElement("div");d.className=`aiBubble ${who}`;
  if(htmlMode)d.innerHTML=text;else d.textContent=text;
  aiMessages.appendChild(d);aiMessages.scrollTop=aiMessages.scrollHeight;return d;
}
function aiParse(q){
  const s=q.toLowerCase().trim(),p={raw:q,airline:[],types:[],minAlt:null,maxAlt:null,minSpeed:null,maxSpeed:null,sort:null,direction:null};
  for(const [name,codes] of Object.entries(AI_AIRLINES))if(s.includes(name)){p.airline=codes;break}
  for(const [name,codes] of Object.entries(AI_TYPES))if(s.includes(name)){p.types=codes;break}
  const above=s.match(/(?:above|over|higher than)\s*([\d,]+)\s*(?:ft|feet)?/);
  const below=s.match(/(?:below|under|lower than)\s*([\d,]+)\s*(?:ft|feet)?/);
  const speedAbove=s.match(/(?:above|over|faster than)\s*([\d,]+)\s*(?:kt|kts|knots)/);
  if(above)p.minAlt=Number(above[1].replace(/,/g,""));
  if(below)p.maxAlt=Number(below[1].replace(/,/g,""));
  if(speedAbove)p.minSpeed=Number(speedAbove[1].replace(/,/g,""));
  if(/\bhighest\b/.test(s))p.sort="highest";
  else if(/\blowest\b/.test(s))p.sort="lowest";
  else if(/\bfastest\b/.test(s))p.sort="fastest";
  else if(/\bslowest\b/.test(s))p.sort="slowest";
  if(/\bwest(?:bound|ward)?\b/.test(s))p.direction="west";
  if(/\beast(?:bound|ward)?\b/.test(s))p.direction="east";
  if(/\bnorth(?:bound|ward)?\b/.test(s))p.direction="north";
  if(/\bsouth(?:bound|ward)?\b/.test(s))p.direction="south";
  return p;
}
function aiAlt(a){return String(a.alt_baro).toLowerCase()==="ground"?0:Number(a.alt_baro)}
function aiDirectionOK(track,dir){
  const t=Number(track);if(!Number.isFinite(t)||!dir)return !dir;
  if(dir==="north")return t>=315||t<45;if(dir==="east")return t>=45&&t<135;
  if(dir==="south")return t>=135&&t<225;if(dir==="west")return t>=225&&t<315;return true;
}
function aiMatchScore(a,p){
  const flight=(a.flight||"").trim().toUpperCase(),type=(a.t||"").toUpperCase();
  if(p.airline.length&&!p.airline.some(c=>flight.startsWith(c)))return -1;
  if(p.types.length&&!p.types.includes(type))return -1;
  const alt=aiAlt(a),speed=Number(a.gs);
  if(p.minAlt!==null&&(!Number.isFinite(alt)||alt<p.minAlt))return -1;
  if(p.maxAlt!==null&&(!Number.isFinite(alt)||alt>p.maxAlt))return -1;
  if(p.minSpeed!==null&&(!Number.isFinite(speed)||speed<p.minSpeed))return -1;
  if(!aiDirectionOK(a.track,p.direction))return -1;
  let score=0;if(p.airline.length)score+=5;if(p.types.length)score+=5;
  if(p.minAlt!==null||p.maxAlt!==null)score+=2;if(p.direction)score+=1;
  return score;
}
async function aiLiveSample(){
  // Reuse an existing fresh Global Radar sample when available.
  if(Array.isArray(worldPlanes)&&worldPlanes.length>20)return worldPlanes;
  const sample=[...zones].sort(()=>Math.random()-.5).slice(0,5),all=[];
  for(let i=0;i<sample.length;i++){
    const [name,lat,lon]=sample[i];let rows=[];
    try{rows=(await scanAdsbLol(name,lat,lon)).slice(0,100)}
    catch(e){await sleep(1100);try{rows=(await scanAirplanesLive(name,lat,lon)).slice(0,100)}catch(_){}}
    rows.forEach(a=>all.push({...a,_zone:name,_worldSource:"Live ADS-B"}));
    if(i<sample.length-1)await sleep(1100);
  }
  const seen=new Set();
  return all.filter(a=>{const k=(a.hex||"").toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true});
}
function aiResultCard(a,index){
  const call=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
  const alt=Number.isFinite(aiAlt(a))?`${Math.round(aiAlt(a)).toLocaleString("en-GB")} ft`:"—";
  const sp=Number.isFinite(Number(a.gs))?`${Math.round(Number(a.gs))} kt`:"—";
  return `<div class="aiResult">
    <div class="aiResultTop"><div><div class="aiResultCall">${aiEsc(call)}</div><div class="aiResultType">${aiEsc(a.t||"Unknown type")} · ${aiEsc(a.r||a.hex||"Unknown registration")}</div></div><div class="aiMatch">LIVE MATCH</div></div>
    <div class="aiResultStats"><div><b>${aiEsc(alt)}</b><span>ALTITUDE</span></div><div><b>${aiEsc(sp)}</b><span>SPEED</span></div><div><b>${Math.round(Number(a.track)||0)}°</b><span>TRACK</span></div></div>
    <div class="aiResultActions"><button class="aiResultBtn primary" data-ai-open="${index}">OPEN TARGET</button><button class="aiResultBtn" data-ai-save="${index}">＋ CAPTURE</button></div>
  </div>`;
}
async function aiSearch(q){
  const p=aiParse(q),thinking=aiAddBubble('<span class="aiThinking"><i></i><i></i><i></i></span> Searching the live sky…',"bot",true);
  try{
    const planes=await aiLiveSample();
    let matches=planes.map(a=>({a,score:aiMatchScore(a,p)})).filter(x=>x.score>=0);
    if(p.sort==="highest")matches.sort((x,y)=>(aiAlt(y.a)||-1)-(aiAlt(x.a)||-1));
    else if(p.sort==="lowest")matches.sort((x,y)=>(aiAlt(x.a)||1e9)-(aiAlt(y.a)||1e9));
    else if(p.sort==="fastest")matches.sort((x,y)=>(Number(y.a.gs)||-1)-(Number(x.a.gs)||-1));
    else if(p.sort==="slowest")matches.sort((x,y)=>(Number(x.a.gs)||1e9)-(Number(y.a.gs)||1e9));
    else matches.sort((x,y)=>y.score-x.score);
    aiLastMatches=matches.slice(0,3).map(x=>x.a);
    thinking.remove();
    if(!aiLastMatches.length){
      aiAddBubble(`I searched ${planes.length} live aircraft in the current radar sample but couldn't find a match. That doesn't prove none are flying — try a broader description or scan again later.`);
      return;
    }
    aiAddBubble(`I found ${matches.length} matching live target${matches.length===1?"":"s"}. Best ${Math.min(3,matches.length)} shown below.`);
    aiLastMatches.forEach((a,i)=>aiAddBubble(aiResultCard(a,i),"bot",true));
    aiMessages.querySelectorAll("[data-ai-open]").forEach(b=>b.onclick=()=>aiOpen(Number(b.dataset.aiOpen)));
    aiMessages.querySelectorAll("[data-ai-save]").forEach(b=>b.onclick=()=>aiSave(Number(b.dataset.aiSave),b));
  }catch(e){thinking.remove();aiAddBubble(`The live search couldn't complete: ${e.message||"feed unavailable"}. Try again in a moment.`)}
}
function aiOpen(i){
  const a=aiLastMatches[i];if(!a)return;closeAiFinder();
  renderAircraft(a,a._zone||"AI Finder",a._worldSource||"Live ADS-B");showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),160);
}
function aiSave(i,btn){
  const a=aiLastMatches[i];if(!a)return;
  currentAircraft={...a,_zone:a._zone||"AI Finder",_source:a._worldSource||"Live ADS-B"};
  currentHex=(a.hex||"").trim().toLowerCase();currentZone=a._zone||"AI Finder";currentSource=a._worldSource||"Live ADS-B";
  lastLat=Number(a.lat);lastLon=Number(a.lon);saveCurrentCard();btn.textContent="CAPTURED ✓";
}
function openAiFinder(){closeMenu();aiFinderBackdrop.classList.add("show");setTimeout(()=>aiInput.focus(),150)}
function closeAiFinder(){aiFinderBackdrop.classList.remove("show")}
function aiSubmit(){const q=aiInput.value.trim();if(!q)return;aiAddBubble(q,"user");aiInput.value="";aiSearch(q)}aiClose.addEventListener("click",closeAiFinder);aiSend.addEventListener("click",aiSubmit);
aiInput.addEventListener("keydown",e=>{if(e.key==="Enter")aiSubmit()});
document.querySelectorAll(".aiExample").forEach(b=>b.addEventListener("click",()=>{aiInput.value=b.textContent;aiSubmit()}));

const HANGAR_KEY="flightRouletteHangarV1";
const TARGET_TYPES=30;

function getHangar(){
  try{
    const raw=JSON.parse(localStorage.getItem(HANGAR_KEY)||"[]");
    return Array.isArray(raw)?raw:[];
  }catch(e){return []}
}
function setHangar(items){
  localStorage.setItem(HANGAR_KEY,JSON.stringify(items));
}
function aircraftRarity(type,desc=""){
  const t=String(type||"").toUpperCase();
  const d=String(desc||"").toUpperCase();

  const ultra=["A388","A380","B748","AN22","AN124","A225"];
  const rare=["B744","B742","B743","A346","A345","A343","B753","B752","MD11","DC10","CONC","B703","IL96"];
  const uncommon=["B763","B762","B764","B788","B789","B78X","A332","A333","A339","A359","A35K","B77L","B77W","B772","E190","E195","BCS1","BCS3"];

  if(ultra.includes(t) || d.includes("ANTONOV AN-225")) return {name:"Ultra Rare",cls:"ultra"};
  if(rare.includes(t)) return {name:"Rare",cls:"rare"};
  if(uncommon.includes(t)) return {name:"Uncommon",cls:"uncommon"};
  return {name:"Common",cls:"common"};
}
function currentCardData(){
  if(!currentAircraft) return null;

  const flight=(currentAircraft.flight||"").trim();
  const rarity=aircraftRarity(currentAircraft.t,currentAircraft.desc);

  let altitude="Not available";
  if(String(currentAircraft.alt_baro).toLowerCase()==="ground") altitude="Ground";
  else if(currentAircraft.alt_baro!==undefined&&currentAircraft.alt_baro!==null&&!isNaN(Number(currentAircraft.alt_baro)))
    altitude=`${Math.round(Number(currentAircraft.alt_baro)).toLocaleString("en-GB")} ft`;

  return {
    id: currentHex || currentAircraft.hex || currentAircraft.r || flight || String(Date.now()),
    callsign: flight || currentAircraft.r || currentAircraft.hex || "UNKNOWN",
    type: currentAircraft.t || "Unknown",
    description: currentAircraft.desc || "",
    registration: currentAircraft.r || "Unknown",
    hex: currentAircraft.hex || currentHex || "Unknown",
    altitude,
    speed: currentAircraft.gs!==undefined&&currentAircraft.gs!==null&&!isNaN(Number(currentAircraft.gs)) ? `${Math.round(Number(currentAircraft.gs))} kt` : "Not available",
    heading: currentAircraft.track!==undefined&&currentAircraft.track!==null&&!isNaN(Number(currentAircraft.track)) ? `${Math.round(Number(currentAircraft.track))}°` : "Not available",
    lat: Number.isFinite(Number(currentAircraft.lat))?Number(currentAircraft.lat):lastLat,
    lon: Number.isFinite(Number(currentAircraft.lon))?Number(currentAircraft.lon):lastLon,
    zone: currentZone || currentAircraft._zone || "Unknown area",
    source: currentSource || currentAircraft._source || "Live ADS-B",
    rarity: rarity.name,
    rarityClass: rarity.cls,
    firstSaved: new Date().toISOString(),
    discoveries: 1
  };
}
function saveCurrentCard(){
  const card=currentCardData();
  if(!card){
    showError("Spin the skies and discover an aircraft before saving a collector card.");
    return;
  }

  const items=getHangar();
  const match=items.find(x=>String(x.id).toLowerCase()===String(card.id).toLowerCase());

  if(match){
    match.discoveries=(match.discoveries||1)+1;
    match.lastSeen=new Date().toISOString();
    match.altitude=card.altitude;
    match.speed=card.speed;
    match.heading=card.heading;
    match.lat=card.lat;
    match.lon=card.lon;
    match.zone=card.zone;
  }else{
    items.unshift(card);
  }

  setHangar(items);
  renderHangar();

  saveCardBtn.classList.add("saved");
  saveCardBtn.textContent=match?`✓ DUPLICATE FOUND — NOW ×${match.discoveries}`:"✓ SAVED TO MY HANGAR";
  showToast(match?`Duplicate! ${card.callsign} is now ×${match.discoveries}`:`${card.callsign} saved to My Hangar ✓`);
}
function showToast(text){
  collectorToast.textContent=text;
  collectorToast.classList.add("show");
  setTimeout(()=>collectorToast.classList.remove("show"),2200);
}
function safeText(v){
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function renderHangar(){
  const items=getHangar();
  const types=[...new Set(items.map(x=>String(x.type||"Unknown").toUpperCase()).filter(Boolean))];
  const aircraftIds=[...new Set(items.map(x=>String(x.id||"").toLowerCase()).filter(Boolean))];
  const rarePlus=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare");

  totalCards.textContent=items.reduce((sum,x)=>sum+(x.discoveries||1),0);
  uniqueTypes.textContent=types.length;
  rareCards.textContent=rarePlus.length;
  uniqueAircraft.textContent=aircraftIds.length;
  if(menuHangarCount) menuHangarCount.textContent=items.reduce((sum,x)=>sum+(x.discoveries||1),0);

  const pct=Math.min(100,(types.length/TARGET_TYPES)*100);
  progressText.textContent=`${types.length} / ${TARGET_TYPES}`;
  progressFill.style.width=pct+"%";

  if(!items.length){
    hangarGrid.innerHTML=`<div class="emptyHangar" style="grid-column:1/-1"><strong>Your Hangar is empty.</strong>Spin the skies, find a real aircraft and save your first collector card.</div>`;
    return;
  }

  hangarGrid.innerHTML=items.map(card=>{
    const dt=new Date(card.firstSaved);
    const date=Number.isNaN(dt.getTime())?"Unknown date":dt.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    return `<article class="collectCard">
      <div class="rarity ${safeText(card.rarityClass||"common")}">${safeText(card.rarity||"Common")}</div>
      <div class="cardCallsign">${safeText(card.callsign)}</div>
      <div class="cardType">${safeText(card.type)}${card.description?` • ${safeText(card.description)}`:""}</div>
      <div class="cardMeta">
        <div><b>${safeText(card.altitude)}</b><span>Captured altitude</span></div>
        <div><b>${safeText(card.speed)}</b><span>Captured speed</span></div>
        <div><b>${safeText(card.registration)}</b><span>Registration</span></div>
        <div><b>${safeText(card.hex)}</b><span>ICAO hex</span></div>
      </div>
      <div class="cardFoot">Captured near ${safeText(card.zone)} • ${safeText(date)}</div>
      ${(card.discoveries||1)>1?`<div class="duplicateBadge">×${card.discoveries} FOUND</div>`:""}
    </article>`;
  }).join("");
}
function openHangar(){
  renderHangar();
  hangarBackdrop.classList.add("show");
  hangarBackdrop.setAttribute("aria-hidden","false");
}
function closeHangar(){
  hangarBackdrop.classList.remove("show");
  hangarBackdrop.setAttribute("aria-hidden","true");
}
function openMenu(){}
function closeMenu(){}

saveCardBtn.addEventListener("click",saveCurrentCard);

hangarClose.addEventListener("click",closeHangar);
hangarBackdrop.addEventListener("click",e=>{if(e.target===hangarBackdrop)closeHangar()});
clearHangar.addEventListener("click",()=>{
  if(confirm("Clear every aircraft from My Hangar on this device?")){
    localStorage.removeItem(HANGAR_KEY);
    renderHangar();
    showToast("My Hangar cleared");
  }
});
renderHangar();


spinBtn.addEventListener("click",findRealAircraft);
spinAgain.addEventListener("click",findRealAircraft);
showMapBtn.addEventListener("click",startTracking);

autoFollowBtn.addEventListener("click",()=>{
 autoFollow=!autoFollow;
 autoFollowBtn.classList.toggle("active",autoFollow);
 autoFollowBtn.textContent=autoFollow?"◎ AUTO-FOLLOW ON":"◎ AUTO-FOLLOW OFF";
});

centreBtn.addEventListener("click",()=>{
 if(map&&Number.isFinite(lastLat)&&Number.isFinite(lastLon)) map.setView([lastLat,lastLon],Math.max(map.getZoom(),8),{animate:true});
});

versionBtn.addEventListener("click",()=>{
 releaseBackdrop.classList.add("show");
 releaseBackdrop.setAttribute("aria-hidden","false");
});
function closeRelease(){
 releaseBackdrop.classList.remove("show");
 releaseBackdrop.setAttribute("aria-hidden","true");
}
releaseClose.addEventListener("click",closeRelease);
releaseBackdrop.addEventListener("click",e=>{if(e.target===releaseBackdrop)closeRelease()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeRelease();closeMenu();closeHangar();closeAbove();closeSkyLens();closeAiFinder();closeLabs();closeLegal();}});


// ===== v2.0.0 LIVE WORLD =====
const worldView=$("#worldView"), homeView=$("#homeView"), hangarView=$("#hangarViewV2"), passportView=$("#passportView");
const bottomBtns=[...document.querySelectorAll(".bottomNav button")];
const worldStatus=$("#worldStatus"), worldMapEl=$("#worldMap"), worldCount=$("#worldCount");
let worldMap=null, worldLayer=null, worldPlanes=[], worldBusy=false;
let selectedWorldAircraft=null;

function showV2View(name){
  [homeView,worldView,hangarView,passportView].forEach(v=>v&&v.classList.remove("activeView"));
  const target={spin:homeView,world:worldView,hangar:hangarView,passport:passportView}[name]||homeView;
  target.classList.add("activeView");
  bottomBtns.forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="world"){ setTimeout(()=>{initWorldMap();worldMap.invalidateSize()},80); }
  if(name==="hangar"){renderHangarV2()}
  if(name==="passport"){renderPassport()}
  window.scrollTo({top:0,behavior:"smooth"});
}
bottomBtns.filter(b=>b.dataset.view).forEach(b=>b.addEventListener("click",()=>showV2View(b.dataset.view)));

function initWorldMap(){
  if(worldMap) return;
  worldMap=L.map("worldMap",{zoomControl:false,worldCopyJump:true,minZoom:2}).setView([25,5],2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"&copy; OpenStreetMap"}).addTo(worldMap);
  L.control.zoom({position:"bottomright"}).addTo(worldMap);
  worldLayer=L.layerGroup().addTo(worldMap);
}
function radarPlaneIcon(a){
  const h=Number.isFinite(Number(a.track))?Number(a.track):0;
  return L.divIcon({className:"",html:`<div class="radarPlane" style="transform:rotate(${h-45}deg)">✈</div>`,iconSize:[26,26],iconAnchor:[13,13]});
}
async function scanWorldRadar(){
  if(worldBusy)return;

  worldBusy=true;
  initWorldMap();
  worldLayer.clearLayers();
  worldPlanes=[];

  const radarDot=$("#worldRadarDot");
  const scanButton=$("#worldScanBtn");

  radarDot.className="radarDot scanning";
  scanButton.disabled=true;
  scanButton.textContent="SCANNING…";
  worldStatus.textContent="STARTING RADAR SWEEP";
  worldCount.textContent="0";

  // Fewer regions + deliberate spacing keeps us friendly to public APIs
  // and avoids Airplanes.live's documented 1 request/sec rate limit.
  const sample=[...zones].sort(()=>Math.random()-.5).slice(0,5);
  const errors=[];

  try{
    for(let i=0;i<sample.length;i++){
      const [name,lat,lon]=sample[i];
      worldStatus.textContent=`${i+1}/${sample.length} • ${name.toUpperCase()}`;

      let aircraft=[];
      let source="adsb.lol";

      try{
        const primary=await scanAdsbLol(name,lat,lon);
        aircraft=primary.slice(0,60);
      }catch(err){
        errors.push(`adsb.lol ${name}: ${friendlyLocalError(err)}`);

        // Leave enough time before the documented 1 req/sec fallback.
        await sleep(1100);

        try{
          const fallback=await scanAirplanesLive(name,lat,lon);
          aircraft=fallback.slice(0,60);
          source="Airplanes.live";
        }catch(err2){
          errors.push(`Airplanes.live ${name}: ${friendlyLocalError(err2)}`);
        }
      }

      aircraft.forEach(a=>worldPlanes.push({...a,_zone:name,_worldSource:source}));

      // Deliberate pause between regions.
      if(i<sample.length-1) await sleep(1100);
    }

    const seen=new Set();
    worldPlanes=worldPlanes.filter(a=>{
      const key=(a.hex||`${Number(a.lat).toFixed(4)}-${Number(a.lon).toFixed(4)}`).toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).slice(0,250);

    worldPlanes.forEach(a=>{
      const marker=L.marker([Number(a.lat),Number(a.lon)],{icon:radarPlaneIcon(a)}).addTo(worldLayer);
      const flight=(a.flight||"").trim()||a.r||a.hex||"Aircraft";
      marker.bindTooltip(`${flight} • ${a.t||"Unknown type"}`,{direction:"top"});
      marker.on("click",()=>{
        selectedWorldAircraft=a;
        showAircraftSheet(a);
      });
    });

    worldCount.textContent=worldPlanes.length;
    if($("#worldHudCount")) $("#worldHudCount").textContent=worldPlanes.length;

    if(worldPlanes.length){
      radarDot.className="radarDot liveNow";
      worldStatus.textContent=`RADAR LIVE • ${sample.length} REGIONS SCANNED`;
    }else if(errors.length){
      radarDot.className="radarDot";
      worldStatus.textContent="LIVE FEEDS DIDN’T RETURN A USABLE SAMPLE";
    }else{
      radarDot.className="radarDot";
      worldStatus.textContent="NO AIRCRAFT RETURNED IN THIS SAMPLE";
    }

  }catch(err){
    radarDot.className="radarDot";
    worldStatus.textContent=`RADAR ERROR • ${friendlyLocalError(err)}`;
  }finally{
    worldBusy=false;
    scanButton.disabled=false;
    scanButton.textContent="SCAN AGAIN";
  }
}


function worldDisplayAlt(a){
  if(String(a?.alt_baro).toLowerCase()==="ground") return "Ground";
  if(a?.alt_baro!==undefined&&a?.alt_baro!==null&&!isNaN(Number(a.alt_baro))) return `${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
  return "—";
}
function worldDisplaySpeed(a){
  if(a?.gs!==undefined&&a?.gs!==null&&!isNaN(Number(a.gs))) return `${Math.round(Number(a.gs))} kt`;
  return "—";
}
function showAircraftSheet(a){
  const flight=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
  $("#sheetCall").textContent=flight;
  $("#sheetType").textContent=`${a.t||"Unknown type"} • ${a._zone||"Live World"}`;
  $("#sheetAlt").textContent=worldDisplayAlt(a);
  $("#sheetSpeed").textContent=worldDisplaySpeed(a);
  $("#sheetReg").textContent=a.r||"—";
  $("#aircraftSheet").classList.add("show");
}
$("#sheetClose").addEventListener("click",()=>$("#aircraftSheet").classList.remove("show"));
$("#sheetOpenBtn").addEventListener("click",()=>{
  if(!selectedWorldAircraft)return;
  const a=selectedWorldAircraft;
  $("#aircraftSheet").classList.remove("show");
  renderAircraft(a,a._zone||"Live World",a._worldSource||"Live ADS-B");
  showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),150);
});
$("#sheetCaptureBtn").addEventListener("click",()=>{
  if(!selectedWorldAircraft)return;
  const a=selectedWorldAircraft;
  currentAircraft={...a,_zone:a._zone||"Live World",_source:a._worldSource||"Live ADS-B"};
  currentHex=(a.hex||"").trim().toLowerCase();
  currentZone=a._zone||"Live World";
  currentSource=a._worldSource||"Live ADS-B";
  lastLat=Number(a.lat);lastLon=Number(a.lon);
  saveCurrentCard();
  $("#sheetCaptureBtn").textContent="CAPTURED ✓";
});
$("#worldHudScanBtn").addEventListener("click",scanWorldRadar);
$("#worldRecenterBtn").addEventListener("click",()=>{
  if(worldMap) worldMap.setView([22,8],2);
});

$("#worldScanBtn").addEventListener("click",scanWorldRadar);
$("#heroWorldBtn").addEventListener("click",()=>{showV2View("world");setTimeout(scanWorldRadar,200)});
$("#heroSpinMode").addEventListener("click",()=>document.querySelector("#spinBtn").scrollIntoView({behavior:"smooth",block:"center"}));
$("#heroNearbyBtn").addEventListener("click",()=>{openAbove()});

function renderHangarV2(){
  const items=getHangar();
  const grid=$("#v2HangarGrid"), empty=$("#v2HangarEmpty");
  $("#v2CardCount").textContent=items.reduce((s,x)=>s+(x.discoveries||1),0);
  $("#v2TypeCount").textContent=new Set(items.map(x=>x.type)).size;
  $("#v2RareCount").textContent=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;
  if(!items.length){grid.innerHTML="";empty.style.display="block";return}
  empty.style.display="none";
  grid.innerHTML=items.map(card=>`
    <article class="v2CollectCard ${safeText(card.rarityClass||"common")}">
      <div class="foil"></div>
      <div class="v2Rarity">${safeText(card.rarity||"Common")}</div>
      <div class="cardPlane">✈</div>
      <div class="v2Call">${safeText(card.callsign)}</div>
      <div class="v2Type">${safeText(card.type)} ${card.description?"• "+safeText(card.description):""}</div>
      <div class="v2Stats"><span>${safeText(card.altitude)}<small>CAPTURE ALT</small></span><span>${safeText(card.speed)}<small>SPEED</small></span></div>
      <div class="v2Reg">${safeText(card.registration)} · ${safeText(card.hex)}</div>
      ${(card.discoveries||1)>1?`<div class="v2Dup">×${card.discoveries}</div>`:""}
    </article>`).join("");
}
function renderPassport(){
  const items=getHangar();
  const types=new Set(items.map(x=>x.type).filter(Boolean));
  const total=items.reduce((s,x)=>s+(x.discoveries||1),0);
  const rare=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;
  const level=Math.max(1,Math.floor(total/5)+1);
  const titles=["Passenger","Plane Spotter","Cadet","First Officer","Captain","Air Traffic Controller","Aviation Legend"];
  const title=titles[Math.min(titles.length-1,Math.floor((level-1)/2))];
  $("#passportLevel").textContent=`LEVEL ${level}`;
  $("#passportTitle").textContent=title;
  $("#passportCaptures").textContent=total;
  $("#passportTypes").textContent=types.size;
  $("#passportRare").textContent=rare;
  $("#passportProgress").style.width=`${Math.min(100,(total%5)/5*100)}%`;
  $("#passportNext").textContent=`${5-(total%5||0)} captures to next level`;
}
$("#v2ClearHangar").addEventListener("click",()=>{
 if(confirm("Clear every aircraft from your Hangar on this device?")){localStorage.removeItem(HANGAR_KEY);renderHangarV2();renderPassport();renderHangar()}
});

// Upgrade old navigation targets into v2 views


// ===== v5.1.0.1 — TERMS / PRIVACY / DATA / SAFETY =====
const firstRunGate=$("#firstRunGate"),acceptTermsBtn=$("#acceptTermsBtn"),readTermsBtn=$("#readTermsBtn");
const legalBackdrop=$("#legalBackdrop"),legalClose=$("#legalClose"),legalTitle=$("#legalTitle"),legalContent=$("#legalContent");
const termsLink=$("#termsLink"),privacyLink=$("#privacyLink"),sourcesLink=$("#sourcesLink"),safetyLink=$("#safetyLink");
const SKYHUNT_TERMS_KEY="skyhuntTermsAccepted_v4_demo";

const LEGAL_DOCS={
terms:{
 title:"Terms of Use",
 html:`
 <div class="legalSection"><h3>1. What SKYHUNT is</h3><p>SKYHUNT is an entertainment, discovery and educational web application that displays and derives information from public or third-party aviation data. It is not an air-navigation, air-traffic-control, emergency, operational or safety system.</p></div>
 <div class="legalSection"><h3>2. No operational reliance</h3><p>Do not rely on SKYHUNT to navigate, operate, dispatch, intercept, identify, avoid or make safety decisions concerning any aircraft. Data may be delayed, incomplete, inaccurate, unavailable or misidentified.</p></div>
 <div class="legalSection"><h3>3. Availability</h3><p>SKYHUNT is provided on an “as available” basis. Features may stop working because of browser restrictions, device permissions, network conditions, third-party service changes, API limits or outages.</p></div>
 <div class="legalSection"><h3>4. Acceptable use</h3><p>Use SKYHUNT only for lawful discovery, entertainment and educational purposes. Do not use it to harass, stalk, threaten, interfere with aviation operations, facilitate unlawful activity, bypass service limits or overload connected services.</p></div>
 <div class="legalSection"><h3>5. Collector features</h3><p>Hangar cards, rarity labels, levels and collection mechanics are SKYHUNT game features. They are not official aviation classifications and do not imply ownership of, affiliation with or rights in an aircraft.</p></div>
 <div class="legalSection"><h3>6. Third-party data</h3><p>SKYHUNT relies on third-party aircraft-data and mapping services. Their availability, licensing and terms are separate from SKYHUNT and may change.</p></div>
 <div class="legalSection"><h3>7. Demo status</h3><p>This build is a SKYHUNTnstration. Before commercial use, data-provider licensing, hosting, legal terms, privacy obligations and infrastructure should be reviewed for the intended deployment.</p></div>`
},
privacy:{
 title:"Privacy & Data Notice",
 html:`
 <div class="legalSection"><h3>Browser storage</h3><p>SKYHUNT stores your Hangar, collection progress and acceptance of these terms in your browser using localStorage. This data is local to the browser/device unless a future account service is introduced.</p></div>
 <div class="legalSection"><h3>Location</h3><p>Nearby and Sky Lens request location only after you choose to start them. Coordinates are used to request nearby aircraft from connected live-data services. SKYHUNT does not intentionally add your personal location to Hangar cards.</p></div>
 <div class="legalSection"><h3>Camera & orientation</h3><p>Sky Lens may request camera and device-orientation access. The camera stream is displayed locally in the browser and is not intentionally recorded or uploaded by SKYHUNT. Device orientation is used to estimate target direction.</p></div>
 <div class="legalSection"><h3>Third parties</h3><p>Aircraft-data providers, map-tile providers and other third-party services can receive ordinary technical request data such as IP address, user agent and requested coordinates as part of normal internet requests.</p></div>
 <div class="legalSection"><h3>Accounts</h3><p>This demo does not require a SKYHUNT account and does not intentionally collect passwords or payment-card details.</p></div>`
},
sources:{
 title:"Data & Sources",
 html:`
 <div class="legalSection"><h3>Live aircraft data</h3><p>SKYHUNT uses open live ADS-B/MLAT aircraft data. adsb.lol is used as a primary feed in the current build. Airplanes.live is retained as a fallback in selected demo features.</p></div>
 <div class="legalSection"><h3>Maps</h3><p>Interactive maps use Leaflet and OpenStreetMap tiles/attribution in the current demo.</p></div>
 <div class="legalSection"><h3>What the data means</h3><p>Aircraft fields are shown only when returned by the connected feed where practical. Coverage depends on receivers, aircraft broadcasts, MLAT availability and the upstream service. “Live” does not mean zero-delay or guaranteed completeness.</p></div>
 <div class="legalSection"><h3>AI Finder</h3><p>AI Finder currently uses a local natural-language query parser rather than a generative AI service. It searches sampled live aircraft data and does not invent a target when no match is found.</p></div>
 <div class="legalSection"><h3>Game rarity</h3><p>Common, Uncommon, Rare and Ultra Rare labels are SKYHUNT gameplay classifications, not authoritative measures of worldwide aircraft rarity.</p></div>`
},
safety:{
 title:"Safety Notice",
 html:`
 <div class="legalSection"><h3>Do not use while driving or operating equipment</h3><p>Do not interact with SKYHUNT, maps or Sky Lens while driving, cycling, operating machinery or doing anything that requires your full attention.</p></div>
 <div class="legalSection"><h3>Sky Lens</h3><p>Sky Lens is experimental approximate AR. Phone compass drift, pitch estimation, camera field-of-view assumptions, ADS-B latency and coverage can place labels away from the aircraft you can actually see.</p></div>
 <div class="legalSection"><h3>Respect people and property</h3><p>Do not trespass, enter restricted areas, obstruct roads, airports or emergency access, or use SKYHUNT to target or harass individuals.</p></div>
 <div class="legalSection"><h3>Emergency information</h3><p>SKYHUNT is not an emergency information source. Follow official authorities and aviation services for safety-critical information.</p></div>`
}
};

function openLegal(which){
  const d=LEGAL_DOCS[which]||LEGAL_DOCS.terms;
  legalTitle.textContent=d.title;
  legalContent.innerHTML=d.html;
  legalBackdrop.classList.add("show");
  legalBackdrop.setAttribute("aria-hidden","false");
}
function closeLegal(){
  legalBackdrop.classList.remove("show");
  legalBackdrop.setAttribute("aria-hidden","true");
}
termsLink.addEventListener("click",()=>openLegal("terms"));
privacyLink.addEventListener("click",()=>openLegal("privacy"));
sourcesLink.addEventListener("click",()=>openLegal("sources"));
safetyLink.addEventListener("click",()=>openLegal("safety"));
readTermsBtn.addEventListener("click",()=>openLegal("terms"));
legalClose.addEventListener("click",closeLegal);
legalBackdrop.addEventListener("click",e=>{if(e.target===legalBackdrop)closeLegal()});
acceptTermsBtn.addEventListener("click",()=>{
  localStorage.setItem(SKYHUNT_TERMS_KEY,new Date().toISOString());
  firstRunGate.classList.remove("show");
  firstRunGate.setAttribute("aria-hidden","true");
});
if(!localStorage.getItem(SKYHUNT_TERMS_KEY)){
  firstRunGate.classList.add("show");
  firstRunGate.setAttribute("aria-hidden","false");
}


// SKYHUNT v5 — PRODUCT NAVIGATION
const labsBackdrop=$("#labsBackdrop"),labsClose=$("#labsClose"),labsNavBtn=$("#labsNavBtn"),nearbyNavBtn=$("#nearbyNavBtn");
const labsSkyLens=$("#labsSkyLens"),labsAiFinder=$("#labsAiFinder"),collectionHangarCard=$("#collectionHangarCard"),collectionFlightIdCard=$("#collectionFlightIdCard");
function openLabs(){labsBackdrop.classList.add("show");labsBackdrop.setAttribute("aria-hidden","false")}
function closeLabs(){labsBackdrop.classList.remove("show");labsBackdrop.setAttribute("aria-hidden","true")}
labsNavBtn.addEventListener("click",()=>{bottomBtns.forEach(b=>b.classList.remove("active"));labsNavBtn.classList.add("active");openLabs()});labsClose.addEventListener("click",closeLabs);labsBackdrop.addEventListener("click",e=>{if(e.target===labsBackdrop)closeLabs()});nearbyNavBtn.addEventListener("click",()=>{bottomBtns.forEach(b=>b.classList.remove("active"));nearbyNavBtn.classList.add("active");openAbove()});labsSkyLens.addEventListener("click",()=>{closeLabs();openSkyLens()});labsAiFinder.addEventListener("click",()=>{closeLabs();openAiFinder()});collectionHangarCard.addEventListener("click",()=>showV2View("hangar"));collectionFlightIdCard.addEventListener("click",()=>showV2View("passport"));

window.addEventListener("beforeunload",stopTracking);
