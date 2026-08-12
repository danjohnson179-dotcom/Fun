/* SKYHUNT v5.2.6 — hangar.js
   Targeted Hangar capture hotfix.
   This module is defensive against malformed legacy localStorage data. */

const HANGAR_KEY="flightRouletteHangarV1";
const TARGET_TYPES=30;

function hangarSafeText(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function normaliseHangarCard(raw,index=0){
  if(!raw || typeof raw!=="object") return null;

  const type=String(raw.type||"Unknown");
  const rarity=aircraftRarity(type,raw.description||raw.desc||"");
  const discoveries=Math.max(1,Number(raw.discoveries)||1);

  return {
    id:String(raw.id||raw.hex||raw.registration||raw.callsign||`legacy-${index}`),
    callsign:String(raw.callsign||raw.flight||raw.registration||raw.hex||"UNKNOWN"),
    type,
    description:String(raw.description||raw.desc||""),
    registration:String(raw.registration||raw.r||"Unknown"),
    hex:String(raw.hex||"Unknown"),
    altitude:String(raw.altitude||"Not available"),
    speed:String(raw.speed||"Not available"),
    heading:String(raw.heading||"Not available"),
    lat:Number.isFinite(Number(raw.lat))?Number(raw.lat):null,
    lon:Number.isFinite(Number(raw.lon))?Number(raw.lon):null,
    zone:String(raw.zone||"Unknown area"),
    source:String(raw.source||"Live ADS-B"),
    rarity:String(raw.rarity||rarity.name),
    rarityClass:String(raw.rarityClass||rarity.cls),
    firstSaved:String(raw.firstSaved||raw.savedAt||new Date().toISOString()),
    lastSeen:String(raw.lastSeen||""),
    discoveries
  };
}

function getHangar(){
  try{
    const parsed=JSON.parse(localStorage.getItem(HANGAR_KEY)||"[]");
    if(!Array.isArray(parsed)) return [];

    const cleaned=parsed
      .map((card,i)=>normaliseHangarCard(card,i))
      .filter(Boolean);

    // Repair malformed legacy storage quietly.
    if(cleaned.length!==parsed.length){
      localStorage.setItem(HANGAR_KEY,JSON.stringify(cleaned));
    }

    return cleaned;
  }catch(e){
    console.warn("SKYHUNT Hangar storage was invalid. Resetting safely.",e);
    try{localStorage.removeItem(HANGAR_KEY)}catch(_){}
    return [];
  }
}

function setHangar(items){
  try{
    const safeItems=(Array.isArray(items)?items:[])
      .map((card,i)=>normaliseHangarCard(card,i))
      .filter(Boolean);

    localStorage.setItem(HANGAR_KEY,JSON.stringify(safeItems));
    return true;
  }catch(e){
    console.error("SKYHUNT Hangar could not be saved:",e);
    showToast("Could not save to this browser");
    return false;
  }
}

function aircraftRarity(type,desc=""){
  const t=String(type||"").toUpperCase();
  const d=String(desc||"").toUpperCase();

  const ultra=["A388","A380","B748","AN22","AN124","A225"];
  const rare=["B744","B742","B743","A346","A345","A343","B753","B752","MD11","DC10","CONC","B703","IL96"];
  const uncommon=["B763","B762","B764","B788","B789","B78X","A332","A333","A338","A339","A359","A35K","B77L","B77W","B772","E190","E195","BCS1","BCS3"];

  if(ultra.includes(t)||d.includes("ANTONOV AN-225")) return {name:"Ultra Rare",cls:"ultra"};
  if(rare.includes(t)) return {name:"Rare",cls:"rare"};
  if(uncommon.includes(t)) return {name:"Uncommon",cls:"uncommon"};
  return {name:"Common",cls:"common"};
}

function currentCardData(){
  if(!currentAircraft || typeof currentAircraft!=="object") return null;

  const flight=String(currentAircraft.flight||"").trim();
  const rarity=aircraftRarity(currentAircraft.t,currentAircraft.desc);

  let altitude="Not available";
  if(String(currentAircraft.alt_baro).toLowerCase()==="ground"){
    altitude="Ground";
  }else if(Number.isFinite(Number(currentAircraft.alt_baro))){
    altitude=`${Math.round(Number(currentAircraft.alt_baro)).toLocaleString("en-GB")} ft`;
  }

  const resolvedHex=String(currentHex||currentAircraft.hex||"").trim().toLowerCase();
  const resolvedRegistration=String(currentAircraft.r||"").trim();

  return {
    id:resolvedHex||resolvedRegistration||flight||`capture-${Date.now()}`,
    callsign:flight||resolvedRegistration||resolvedHex||"UNKNOWN",
    type:currentAircraft.t||"Unknown",
    description:currentAircraft.desc||"",
    registration:resolvedRegistration||"Unknown",
    hex:resolvedHex||"Unknown",
    altitude,
    speed:Number.isFinite(Number(currentAircraft.gs))?`${Math.round(Number(currentAircraft.gs))} kt`:"Not available",
    heading:Number.isFinite(Number(currentAircraft.track))?`${Math.round(Number(currentAircraft.track))}°`:"Not available",
    lat:Number.isFinite(Number(currentAircraft.lat))?Number(currentAircraft.lat):lastLat,
    lon:Number.isFinite(Number(currentAircraft.lon))?Number(currentAircraft.lon):lastLon,
    zone:currentZone||currentAircraft._zone||"Unknown area",
    source:currentSource||currentAircraft._source||"Live ADS-B",
    rarity:rarity.name,
    rarityClass:rarity.cls,
    firstSaved:new Date().toISOString(),
    discoveries:1
  };
}

function showToast(text){
  if(!collectorToast) return;
  collectorToast.textContent=text;
  collectorToast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer=setTimeout(()=>collectorToast.classList.remove("show"),2200);
}

function renderHangarV2(){
  try{
    const items=getHangar();
    const grid=$("#v2HangarGrid");
    const empty=$("#v2HangarEmpty");
    const cardCount=$("#v2CardCount");
    const typeCount=$("#v2TypeCount");
    const rareCount=$("#v2RareCount");

    if(!grid||!empty) return;

    const captures=items.reduce((sum,x)=>sum+(Number(x.discoveries)||1),0);
    const types=new Set(items.map(x=>String(x.type||"Unknown").toUpperCase()));
    const rarePlus=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;

    if(cardCount) cardCount.textContent=captures;
    if(typeCount) typeCount.textContent=types.size;
    if(rareCount) rareCount.textContent=rarePlus;

    if(!items.length){
      grid.innerHTML="";
      empty.style.display="block";
      empty.innerHTML="<strong>Your Hangar is empty.</strong><br>Capture a live aircraft and it will appear here automatically.";
      return;
    }

    empty.style.display="none";

    grid.innerHTML=items.map((card,index)=>{
      try{
        const dt=new Date(card.firstSaved);
        const date=Number.isNaN(dt.getTime())
          ?"Unknown date"
          :dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

        return `<article class="v2CollectCard ${hangarSafeText(card.rarityClass||"common")}">
          <div class="foil"></div>
          <div class="v2Rarity">${hangarSafeText(card.rarity||"Common")}</div>
          <div class="cardPlane">✈</div>
          <div class="v2Call">${hangarSafeText(card.callsign||"UNKNOWN")}</div>
          <div class="v2Type">${hangarSafeText(card.type||"Unknown")}${card.description?` • ${hangarSafeText(card.description)}`:""}</div>
          <div class="v2Stats">
            <span>${hangarSafeText(card.altitude||"Not available")}<small>CAPTURE ALT</small></span>
            <span>${hangarSafeText(card.speed||"Not available")}<small>SPEED</small></span>
          </div>
          <div class="v2Reg">${hangarSafeText(card.registration||"Unknown")} · ${hangarSafeText(card.hex||"Unknown")}</div>
          <div class="v2Reg">Captured near ${hangarSafeText(card.zone||"Unknown area")} · ${hangarSafeText(date)}</div>
          ${(card.discoveries||1)>1?`<div class="v2Dup">×${Number(card.discoveries)||1}</div>`:""}
        </article>`;
      }catch(e){
        console.warn("Skipped unreadable Hangar card",index,e);
        return "";
      }
    }).join("");
  }catch(e){
    console.error("Hangar render failed without disabling capture:",e);
  }
}

// Compatibility alias.
function renderHangar(){
  renderHangarV2();
}

function openHangar(){
  if(typeof showV2View==="function") showV2View("hangar");
}

function closeHangar(){}

function saveCurrentCard(){
  try{
    const card=currentCardData();

    if(!card){
      if(typeof showError==="function"){
        showError("Open a live aircraft before capturing it to your Hangar.");
      }
      showToast("Open an aircraft first");
      return false;
    }

    const items=getHangar();
    const cardId=String(card.id).toLowerCase();

    const match=items.find(x=>
      String(x?.id||"").toLowerCase()===cardId ||
      (card.hex!=="Unknown" && String(x?.hex||"").toLowerCase()===String(card.hex).toLowerCase())
    );

    if(match){
      match.discoveries=(Number(match.discoveries)||1)+1;
      match.lastSeen=new Date().toISOString();
      match.altitude=card.altitude;
      match.speed=card.speed;
      match.heading=card.heading;
      match.lat=card.lat;
      match.lon=card.lon;
      match.zone=card.zone;
      match.source=card.source;
    }else{
      items.unshift(card);
    }

    if(!setHangar(items)) return false;

    // Update UI only AFTER persistence succeeds.
    renderHangarV2();

    if(typeof renderPassport==="function"){
      try{renderPassport()}catch(e){console.warn("Flight ID refresh failed:",e)}
    }

    if(saveCardBtn){
      saveCardBtn.classList.add("saved");
      saveCardBtn.textContent=match
        ?`✓ DUPLICATE FOUND — NOW ×${match.discoveries}`
        :"✓ CAPTURED TO HANGAR";
    }

    showToast(match
      ?`Duplicate! ${card.callsign} is now ×${match.discoveries}`
      :`${card.callsign} captured to your Hangar ✓`
    );

    return true;
  }catch(e){
    console.error("Capture to Hangar failed:",e);
    showToast("Hangar capture failed");
    return false;
  }
}

/*
 IMPORTANT:
 Attach the main capture listener BEFORE the first Hangar render.
 A broken legacy card must never be able to disable this button.
*/
if(saveCardBtn){
  saveCardBtn.addEventListener("click",saveCurrentCard);
}

const clearCollectionBtn=$("#v2ClearHangar");
if(clearCollectionBtn){
  clearCollectionBtn.addEventListener("click",()=>{
    if(!confirm("Clear every aircraft from your Hangar on this device?")) return;
    try{localStorage.removeItem(HANGAR_KEY)}catch(e){}
    renderHangarV2();
    if(typeof renderPassport==="function"){
      try{renderPassport()}catch(e){}
    }
    showToast("Hangar cleared");
  });
}

// Paint after listeners are safely attached.
try{
  renderHangarV2();
}catch(e){
  console.error("Initial Hangar paint failed:",e);
}
