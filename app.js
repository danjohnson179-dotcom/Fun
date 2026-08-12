/* SKYHUNT v5.3.0 — app.js */
// SKYHUNT v5.3.0 — APP BOOTSTRAP
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



// SKYHUNT v5.3.0 — PRODUCT NAVIGATION
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



// ===== v5.3.0 — COLLECTION INTEGRATION FALLBACK =====
// This handler is deliberately independent of radar.js.
// If another module fails, the Collection tab can still open.
document.addEventListener("click",event=>{
  const target=event.target.closest ? event.target.closest("button") : null;
  if(!target)return;

  if(target.matches('.bottomNav button[data-view="collection"]')){
    event.preventDefault();

    const home=document.querySelector("#homeView");
    const world=document.querySelector("#worldView");
    const nearby=document.querySelector("#nearbyView");
    const collection=document.querySelector("#collectionView");
    const passport=document.querySelector("#passportView");

    [home,world,nearby,collection,passport].forEach(view=>{
      if(view)view.classList.remove("activeView");
    });

    if(collection)collection.classList.add("activeView");

    document.querySelectorAll(".bottomNav button[data-view]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.view==="collection");
    });

    if(typeof window.renderHangarV2==="function"){
      try{window.renderHangarV2()}catch(err){console.error("Collection render failed:",err)}
    }else if(typeof renderHangarV2==="function"){
      try{renderHangarV2()}catch(err){console.error("Collection render failed:",err)}
    }

    window.scrollTo({top:0,behavior:"smooth"});
  }
},true);
