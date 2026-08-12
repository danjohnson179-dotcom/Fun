/* SKYHUNT v5.2.5 — app.js */
// SKYHUNT v5.2.5 — APP BOOTSTRAP
window.addEventListener("error", (event) => {
  console.error("SKYHUNT runtime error:", event.error || event.message);
});
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
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeRelease();closeHangar();closeAbove();closeSkyLens();closeAiFinder();closeLabs();closeLegal();}});



// SKYHUNT v5.2.5 — PRODUCT NAVIGATION
const labsBackdrop=$("#labsBackdrop");
const labsClose=$("#labsClose");
const labsNavBtn=$("#labsNavBtn");
const labsSkyLens=$("#labsSkyLens");
const labsAiFinder=$("#labsAiFinder");
const collectionFlightIdCard=$("#collectionFlightIdCard");

function openLabs(){
  if(!labsBackdrop)return;
  labsBackdrop.classList.add("show");
  labsBackdrop.setAttribute("aria-hidden","false");
}
function closeLabs(){
  if(!labsBackdrop)return;
  labsBackdrop.classList.remove("show");
  labsBackdrop.setAttribute("aria-hidden","true");
}

if(labsNavBtn)labsNavBtn.addEventListener("click",openLabs);
if(labsClose)labsClose.addEventListener("click",closeLabs);
if(labsBackdrop)labsBackdrop.addEventListener("click",e=>{if(e.target===labsBackdrop)closeLabs()});
if(labsSkyLens)labsSkyLens.addEventListener("click",()=>{closeLabs();openSkyLens()});
if(labsAiFinder)labsAiFinder.addEventListener("click",()=>{closeLabs();openAiFinder()});
if(collectionFlightIdCard)collectionFlightIdCard.addEventListener("click",()=>showV2View("passport"));

const heroNearby=$("#heroNearbyBtn");
if(heroNearby)heroNearby.addEventListener("click",()=>showV2View("nearby"));

window.addEventListener("beforeunload",stopTracking);
