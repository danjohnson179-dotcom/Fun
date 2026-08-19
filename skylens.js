/* SKYHUNT v5.3.3 — skylens.js */
// ===== v5.2.5 SKY LENS =====
const skyLensBackdrop=$("#skyLensBackdrop"),skyLensVideo=$("#skyLensVideo"),skyLensClose=$("#skyLensClose");
const skyLensStart=$("#skyLensStart"),lensStartBtn=$("#lensStartBtn"),lensUnsupported=$("#lensUnsupported");
const skyLensTargets=$("#skyLensTargets"),skyLensHeading=$("#skyLensHeading"),lensStatus=$("#lensStatus");
const lensHelp=$("#lensHelp"),lensTargetCount=$("#lensTargetCount"),lensRescanBtn=$("#lensRescanBtn"),lensOpenBestBtn=$("#lensOpenBestBtn");

let lensStream=null,lensPosition=null,lensHeading=0,lensPitch=0,lensAircraft=[],lensBest=null,lensActive=false;
let lensOrientationHandler=null;

function lensSafeText(value){
  return String(value ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));
}


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
  const result=await localFeedRequest("adsb.fi",lensPosition,40);
  lensAircraft=(result.aircraft||[]).map(a=>{
    const dist=distanceKm(lensPosition.lat,lensPosition.lon,Number(a.lat),Number(a.lon));
    return {...a,_lensDistanceKm:dist,_lensBearing:bearingDeg(lensPosition.lat,lensPosition.lon,Number(a.lat),Number(a.lon)),_lensSource:result.source};
  }).sort((a,b)=>a._lensDistanceKm-b._lensDistanceKm).slice(0,18);
  lensTargetCount.textContent=`${lensAircraft.length} TARGET${lensAircraft.length===1?"":"S"}`;
  lensStatus.textContent=lensAircraft.length?`Tracking ${lensAircraft.length} nearby aircraft via ${result.source}.`:"No nearby tracked aircraft found.";
  try{
    renderLensTargets();
  }catch(err){
    console.error("Sky Lens target renderer failed",err);
    lensHelp.textContent=`Target overlay error: ${err.message||"unknown rendering error"}`;
  }
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
    try{
      const a=o.a,call=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
      const alt=String(a.alt_baro).toLowerCase()==="ground"
        ?"Ground"
        :Number.isFinite(Number(a.alt_baro))
          ?`${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`
          :"Alt —";

      return `<button class="lensTarget ${i===0?"best":""}" data-lens-index="${lensAircraft.indexOf(a)}" style="left:${Math.max(72,Math.min(w-72,o.x))}px;top:${Math.max(120,Math.min(h-155,o.y))}px">
        <span class="lensArrow">⌃</span>
        <div class="lensCall">${lensSafeText(call)}</div>
        <div class="lensMeta">${lensSafeText(a.t||"Unknown type")} · ${lensSafeText(alt)}<br>${Number(a._lensDistanceKm).toFixed(1)} km · ${Math.round(Number(a._lensBearing)||0)}°</div>
      </button>`;
    }catch(err){
      console.warn("Sky Lens skipped an unreadable aircraft target",err);
      return "";
    }
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

function returnFromLabsToHome(){
  try{
    if(typeof showV2View==="function")showV2View("spin");
  }catch(_){}
  document.querySelectorAll(".bottomNav button[data-view]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.view==="spin");
  });
  try{window.scrollTo({top:0,behavior:"auto"})}catch(_){}
}

function openSkyLens(){
  skyLensBackdrop.classList.add("show");
  skyLensBackdrop.setAttribute("aria-hidden","false");
  skyLensStart.classList.remove("hidden");
}
function closeSkyLens(){
  lensActive=false;
  stopOrientation();
  if(lensStream){
    lensStream.getTracks().forEach(t=>t.stop());
    lensStream=null;
  }
  skyLensVideo.srcObject=null;
  skyLensTargets.innerHTML="";
  lensAircraft=[];
  lensBest=null;
  skyLensBackdrop.classList.remove("show");
  skyLensBackdrop.setAttribute("aria-hidden","true");
  skyLensStart.classList.remove("hidden");
  returnFromLabsToHome();
}
if(skyLensClose)skyLensClose.addEventListener("click",closeSkyLens);
lensStartBtn.addEventListener("click",startSkyLens);
lensRescanBtn.addEventListener("click",scanLensAircraft);
lensOpenBestBtn.addEventListener("click",()=>{if(lensBest)openLensAircraft(lensBest)});
window.addEventListener("resize",renderLensTargets);

// iOS-safe fallback: catch the close action even if the direct listener is lost.
document.addEventListener("click",event=>{
  const button=event.target.closest?.("#skyLensClose");
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  closeSkyLens();
},true);
