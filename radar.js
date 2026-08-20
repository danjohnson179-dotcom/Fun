/* SKYHUNT — resilient embedded live radar */
const worldView=$("#worldView"), homeView=$("#homeView"), nearbyView=$("#nearbyView"), collectionView=$("#collectionView"), passportView=$("#passportView");
const bottomBtns=[...document.querySelectorAll(".bottomNav button[data-view]")];
const worldStatus=$("#worldStatus"), worldCount=$("#worldCount");
const worldRadarFrame=$("#worldRadarFrame");
let worldMap=worldRadarFrame;
let worldPlanes=[];
let selectedWorldAircraft=null;

function showV2View(name){
  [homeView,worldView,nearbyView,collectionView,passportView].forEach(view=>view&&view.classList.remove("activeView"));
  const target={spin:homeView,world:worldView,nearby:nearbyView,collection:collectionView,passport:passportView}[name]||homeView;
  target.classList.add("activeView");
  bottomBtns.forEach(button=>button.classList.toggle("active",button.dataset.view===name));
  if(name==="world")initWorldMap();
  if(name==="nearby")initNearbyMap();
  if(name==="hangar")renderHangarV2();
  if(name==="passport")renderPassport();
  window.scrollTo({top:0,behavior:"smooth"});
}
bottomBtns.forEach(button=>button.addEventListener("click",()=>showV2View(button.dataset.view)));

function radarUrl(lat,lon,zoom=9){
  return `https://adsb.lol/?lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}&zoom=${Math.round(zoom)}`;
}

function setWorldArea(name,lat,lon,zoom=9){
  initWorldMap();
  const nextUrl=radarUrl(lat,lon,zoom);
  if(worldRadarFrame.src!==nextUrl)worldRadarFrame.src=nextUrl;
  worldRadarFrame.dataset.area=name;
  worldStatus.textContent=`LIVE MAP · ${String(name).toUpperCase()}`;
  $("#worldRadarDot").className="radarDot liveNow";
  worldCount.textContent="ADSB.LOL";
  $("#worldHudCount").textContent="LIVE";
}

function initWorldMap(){
  worldMap=worldRadarFrame;
  if(!worldRadarFrame.dataset.area)worldRadarFrame.dataset.area="London";
}

function scanWorldRadar(){
  const [name,lat,lon]=choose(zones);
  setWorldArea(name,lat,lon,9);
}

function resetWorldRadar(){
  setWorldArea("London",51.4700,-0.4543,9);
}

function showAircraftSheet(){
  // Aircraft selection happens inside the embedded provider map.
  $("#aircraftSheet")?.classList.remove("show");
}

$("#sheetClose")?.addEventListener("click",()=>$("#aircraftSheet")?.classList.remove("show"));
$("#sheetOpenBtn")?.addEventListener("click",()=>{});
$("#sheetCaptureBtn")?.addEventListener("click",()=>{});
$("#worldHudScanBtn")?.addEventListener("click",scanWorldRadar);
$("#worldRecenterBtn")?.addEventListener("click",resetWorldRadar);
$("#worldScanBtn")?.addEventListener("click",scanWorldRadar);
$("#heroWorldBtn")?.addEventListener("click",()=>{showV2View("world");resetWorldRadar()});
$("#heroSpinMode")?.addEventListener("click",()=>document.querySelector("#spinBtn")?.scrollIntoView({behavior:"smooth",block:"center"}));

function renderPassport(){
  const items=(window.SKYHUNT_COLLECTION && typeof window.SKYHUNT_COLLECTION.get==="function")
    ? window.SKYHUNT_COLLECTION.get()
    : [];
  const types=new Set(items.map(item=>item.type).filter(Boolean));
  const total=items.reduce((sum,item)=>sum+(item.discoveries||1),0);
  const rare=items.filter(item=>item.rarity==="Rare"||item.rarity==="Ultra Rare").length;
  const level=Math.max(1,Math.floor(total/5)+1);
  const titles=["Passenger","Plane Spotter","Cadet","First Officer","Captain","Air Traffic Controller","Aviation Legend"];
  const title=titles[Math.min(titles.length-1,Math.floor((level-1)/2))];
  $("#passportLevel").textContent=`LEVEL ${level}`;
  $("#passportTitle").textContent=title;
  $("#passportCaptures").textContent=total;
  $("#passportTypes").textContent=types.size;
  $("#passportRare").textContent=rare;
  $("#passportProgress").style.width=`${Math.min(100,(total%5)/5*100)}%`;
  const intoLevel=total%5;
  $("#passportNext").textContent=intoLevel===0&&total>0
    ? "5 captures to next level"
    : `${5-intoLevel} captures to next level`;
}

// Upgrade old navigation targets into v2 views.
