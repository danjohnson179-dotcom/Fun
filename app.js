/* SKYHUNT v5.2.4 — app.js */
// SKYHUNT v5.2.4 — APP BOOTSTRAP
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



// SKYHUNT v5 — PRODUCT NAVIGATION
const labsBackdrop=$("#labsBackdrop"),labsClose=$("#labsClose"),labsNavBtn=$("#labsNavBtn");
const labsSkyLens=$("#labsSkyLens"),labsAiFinder=$("#labsAiFinder"),collectionFlightIdCard=$("#collectionFlightIdCard");
function openLabs(){labsBackdrop.classList.add("show");labsBackdrop.setAttribute("aria-hidden","false")}
function closeLabs(){labsBackdrop.classList.remove("show");labsBackdrop.setAttribute("aria-hidden","true")}
labsNavBtn.addEventListener("click",openLabs);labsClose.addEventListener("click",closeLabs);labsBackdrop.addEventListener("click",e=>{if(e.target===labsBackdrop)closeLabs()});labsSkyLens.addEventListener("click",()=>{closeLabs();openSkyLens()});labsAiFinder.addEventListener("click",()=>{closeLabs();openAiFinder()});collectionFlightIdCard.addEventListener("click",()=>showV2View("passport"));



window.addEventListener("beforeunload",stopTracking);

$("#heroNearbyBtn").addEventListener("click",()=>showV2View("nearby"));
