/* SKYHUNT v5.2.1 — core.js */
const $=s=>document.querySelector(s);

const spinBtn=$("#spinBtn"),spinAgain=$("#spinAgain"),scan=$("#scan"),errorBox=$("#error"),result=$("#result");
const showMapBtn=$("#showMapBtn"),mapSection=$("#mapSection"),autoFollowBtn=$("#autoFollowBtn"),centreBtn=$("#centreBtn");
const saveCardBtn=$("#saveCardBtn");
const hangarBackdrop=$("#hangarBackdrop"),hangarClose=$("#hangarClose"),hangarGrid=$("#hangarGrid"),collectorToast=$("#collectorToast");
const nearbyScanBtn=$("#nearbyScanBtn"),nearbyStatus=$("#nearbyStatus"),nearbyRadarDot=$("#nearbyRadarDot"),nearbyResults=$("#nearbyResults"),nearbyRefreshBtn=$("#nearbyRefreshBtn"),nearbyCount=$("#nearbyCount"),nearbyClosest=$("#nearbyClosest"),nearbyFeed=$("#nearbyFeed"),nearbyResultsSub=$("#nearbyResultsSub");
const totalCards=$("#totalCards"),uniqueTypes=$("#uniqueTypes"),rareCards=$("#rareCards"),uniqueAircraft=$("#uniqueAircraft"),progressText=$("#progressText"),progressFill=$("#progressFill"),clearHangar=$("#clearHangar");
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
