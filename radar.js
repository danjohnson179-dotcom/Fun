/* SKYHUNT v5.2.9 — radar.js */
// ===== v2.0.0 LIVE WORLD =====
const worldView=$("#worldView"), homeView=$("#homeView"), nearbyView=$("#nearbyView"), hangarView=$("#hangarViewV2"), passportView=$("#passportView");
const bottomBtns=[...document.querySelectorAll(".bottomNav button[data-view]")];
const worldStatus=$("#worldStatus"), worldMapEl=$("#worldMap"), worldCount=$("#worldCount");
let worldMap=null, worldLayer=null, worldPlanes=[], worldBusy=false;
let selectedWorldAircraft=null;

function showV2View(name){
  [homeView,worldView,nearbyView,hangarView,passportView].forEach(v=>v&&v.classList.remove("activeView"));
  const target={spin:homeView,world:worldView,nearby:nearbyView,hangar:hangarView,passport:passportView}[name]||homeView;
  target.classList.add("activeView");
  bottomBtns.forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(name==="world"){ setTimeout(()=>{initWorldMap();worldMap.invalidateSize()},80); }
  if(name==="nearby"){ setTimeout(()=>{initNearbyMap();nearbyMap.invalidateSize()},80); }
  if(name==="hangar"){renderHangarV2()}
  if(name==="passport"){renderPassport()}
  window.scrollTo({top:0,behavior:"smooth"});
}
bottomBtns.forEach(b=>b.addEventListener("click",()=>showV2View(b.dataset.view)));

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
  const ok=window.SKYHUNT_HANGAR?.captureAircraft(a,{zone:a._zone||"Live World",source:a._worldSource||"Live ADS-B"});
  $("#sheetCaptureBtn").textContent=ok?"CAPTURED ✓":"CAPTURE FAILED";
});
$("#worldHudScanBtn").addEventListener("click",scanWorldRadar);
$("#worldRecenterBtn").addEventListener("click",()=>{
  if(worldMap) worldMap.setView([22,8],2);
});

$("#worldScanBtn").addEventListener("click",scanWorldRadar);
$("#heroWorldBtn").addEventListener("click",()=>{showV2View("world");setTimeout(scanWorldRadar,200)});
$("#heroSpinMode").addEventListener("click",()=>document.querySelector("#spinBtn").scrollIntoView({behavior:"smooth",block:"center"}));
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
// Upgrade old navigation targets into v2 views
