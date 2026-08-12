/* SKYHUNT v5.2.0 — hangar.js */
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
