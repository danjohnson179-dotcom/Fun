/* SKYHUNT v5.2.7 — hangar.js
   Targeted iPhone/event-binding recovery.
   Hangar actions use delegated document clicks so re-rendered buttons stay functional. */

const HANGAR_KEY="flightRouletteHangarV1";
const TARGET_TYPES=30;

function hangarSafeText(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function getSaveCardButton(){
  return document.querySelector("#saveCardBtn");
}

function getHangar(){
  try{
    const raw=JSON.parse(localStorage.getItem(HANGAR_KEY)||"[]");
    if(!Array.isArray(raw))return [];
    return raw.filter(x=>x&&typeof x==="object");
  }catch(e){
    console.warn("Invalid Hangar storage; resetting.",e);
    try{localStorage.removeItem(HANGAR_KEY)}catch(_){}
    return [];
  }
}

function setHangar(items){
  try{
    localStorage.setItem(HANGAR_KEY,JSON.stringify(Array.isArray(items)?items:[]));
    return true;
  }catch(e){
    console.error("Hangar save failed:",e);
    showHangarToast("Could not save to this browser");
    return false;
  }
}

function aircraftRarity(type,desc=""){
  const t=String(type||"").toUpperCase();
  const d=String(desc||"").toUpperCase();
  const ultra=["A388","A380","B748","AN22","AN124","A225"];
  const rare=["B744","B742","B743","A346","A345","A343","B753","B752","MD11","DC10","CONC","B703","IL96"];
  const uncommon=["B763","B762","B764","B788","B789","B78X","A332","A333","A338","A339","A359","A35K","B77L","B77W","B772","E190","E195","BCS1","BCS3"];

  if(ultra.includes(t)||d.includes("ANTONOV AN-225"))return {name:"Ultra Rare",cls:"ultra"};
  if(rare.includes(t))return {name:"Rare",cls:"rare"};
  if(uncommon.includes(t))return {name:"Uncommon",cls:"uncommon"};
  return {name:"Common",cls:"common"};
}

function currentCardData(){
  if(typeof currentAircraft==="undefined" || !currentAircraft)return null;

  const flight=String(currentAircraft.flight||"").trim();
  const rarity=aircraftRarity(currentAircraft.t,currentAircraft.desc);

  let altitude="Not available";
  if(String(currentAircraft.alt_baro).toLowerCase()==="ground"){
    altitude="Ground";
  }else if(Number.isFinite(Number(currentAircraft.alt_baro))){
    altitude=`${Math.round(Number(currentAircraft.alt_baro)).toLocaleString("en-GB")} ft`;
  }

  const resolvedHex=String(
    (typeof currentHex!=="undefined"&&currentHex) || currentAircraft.hex || ""
  ).trim().toLowerCase();

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
    lat:Number.isFinite(Number(currentAircraft.lat))?Number(currentAircraft.lat):(typeof lastLat!=="undefined"?lastLat:null),
    lon:Number.isFinite(Number(currentAircraft.lon))?Number(currentAircraft.lon):(typeof lastLon!=="undefined"?lastLon:null),
    zone:(typeof currentZone!=="undefined"&&currentZone)||currentAircraft._zone||"Unknown area",
    source:(typeof currentSource!=="undefined"&&currentSource)||currentAircraft._source||"Live ADS-B",
    rarity:rarity.name,
    rarityClass:rarity.cls,
    firstSaved:new Date().toISOString(),
    discoveries:1
  };
}

function showHangarToast(text){
  const toast=document.querySelector("#collectorToast");
  if(!toast)return;
  toast.textContent=text;
  toast.classList.add("show");
  clearTimeout(showHangarToast._timer);
  showHangarToast._timer=setTimeout(()=>toast.classList.remove("show"),2200);
}

function renderHangarV2(){
  try{
    const items=getHangar();
    const grid=document.querySelector("#v2HangarGrid");
    const empty=document.querySelector("#v2HangarEmpty");
    const cardCount=document.querySelector("#v2CardCount");
    const typeCount=document.querySelector("#v2TypeCount");
    const rareCount=document.querySelector("#v2RareCount");

    if(!grid||!empty)return;

    const captures=items.reduce((sum,x)=>sum+(Number(x.discoveries)||1),0);
    const types=new Set(items.map(x=>String(x.type||"Unknown").toUpperCase()));
    const rarePlus=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;

    if(cardCount)cardCount.textContent=captures;
    if(typeCount)typeCount.textContent=types.size;
    if(rareCount)rareCount.textContent=rarePlus;

    if(!items.length){
      grid.innerHTML="";
      empty.style.display="block";
      empty.innerHTML="<strong>Your Hangar is empty.</strong><br>Capture a live aircraft and it will appear here automatically.";
      return;
    }

    empty.style.display="none";

    grid.innerHTML=items.map(card=>{
      try{
        const rarity=aircraftRarity(card.type,card.description||card.desc||"");
        const firstSaved=card.firstSaved||new Date().toISOString();
        const dt=new Date(firstSaved);
        const date=Number.isNaN(dt.getTime())?"Unknown date":
          dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});

        return `<article class="v2CollectCard ${hangarSafeText(card.rarityClass||rarity.cls)}">
          <div class="foil"></div>
          <div class="v2Rarity">${hangarSafeText(card.rarity||rarity.name)}</div>
          <div class="cardPlane">✈</div>
          <div class="v2Call">${hangarSafeText(card.callsign||card.flight||card.registration||card.hex||"UNKNOWN")}</div>
          <div class="v2Type">${hangarSafeText(card.type||"Unknown")}${card.description?` • ${hangarSafeText(card.description)}`:""}</div>
          <div class="v2Stats">
            <span>${hangarSafeText(card.altitude||"Not available")}<small>CAPTURE ALT</small></span>
            <span>${hangarSafeText(card.speed||"Not available")}<small>SPEED</small></span>
          </div>
          <div class="v2Reg">${hangarSafeText(card.registration||"Unknown")} · ${hangarSafeText(card.hex||"Unknown")}</div>
          <div class="v2Reg">Captured near ${hangarSafeText(card.zone||"Unknown area")} · ${hangarSafeText(date)}</div>
          ${(Number(card.discoveries)||1)>1?`<div class="v2Dup">×${Number(card.discoveries)||1}</div>`:""}
        </article>`;
      }catch(e){
        console.warn("Skipped unreadable Hangar card:",e);
        return "";
      }
    }).join("");
  }catch(e){
    console.error("Hangar render error:",e);
  }
}

function renderHangar(){
  renderHangarV2();
}

function openHangar(){
  if(typeof showV2View==="function")showV2View("hangar");
}

function closeHangar(){}

function saveCurrentCard(){
  const button=getSaveCardButton();
  const oldText=button?button.textContent:"";

  // This happens immediately so a user can see that the tap was received.
  if(button){
    button.disabled=true;
    button.textContent="SAVING…";
  }

  try{
    const card=currentCardData();

    if(!card){
      if(button){
        button.disabled=false;
        button.textContent=oldText||"SAVE COLLECTOR CARD TO HANGAR";
      }
      showHangarToast("Open a live aircraft first");
      return false;
    }

    const items=getHangar();
    const cardId=String(card.id||"").toLowerCase();

    const match=items.find(x=>{
      const existingId=String(x?.id||"").toLowerCase();
      const existingHex=String(x?.hex||"").toLowerCase();
      return existingId===cardId ||
        (card.hex!=="Unknown" && existingHex===String(card.hex).toLowerCase());
    });

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

    if(!setHangar(items)){
      if(button){
        button.disabled=false;
        button.textContent="TRY CAPTURE AGAIN";
      }
      return false;
    }

    renderHangarV2();

    if(typeof renderPassport==="function"){
      try{renderPassport()}catch(e){console.warn("Flight ID refresh failed",e)}
    }

    if(button){
      button.disabled=false;
      button.classList.add("saved");
      button.textContent=match
        ?`✓ DUPLICATE FOUND — NOW ×${match.discoveries}`
        :"✓ CAPTURED TO HANGAR";
    }

    showHangarToast(
      match
        ?`Duplicate! ${card.callsign} is now ×${match.discoveries}`
        :`${card.callsign} captured to your Hangar ✓`
    );

    return true;

  }catch(e){
    console.error("Hangar capture exception:",e);
    if(button){
      button.disabled=false;
      button.textContent="CAPTURE FAILED — TAP TO RETRY";
    }
    showHangarToast("Hangar capture failed");
    return false;
  }
}

function clearHangarStorage(){
  if(!confirm("Clear every aircraft from your Hangar on this device?"))return;
  try{localStorage.removeItem(HANGAR_KEY)}catch(e){}
  renderHangarV2();
  if(typeof renderPassport==="function"){
    try{renderPassport()}catch(e){}
  }
  showHangarToast("Hangar cleared");
}

/*
  IMPORTANT:
  Delegated handling is intentional.
  It works even if another module replaces/re-renders the button after startup.
*/
document.addEventListener("click",event=>{
  const target=event.target.closest ? event.target.closest("button") : event.target;
  if(!target)return;

  if(target.id==="saveCardBtn"){
    event.preventDefault();
    event.stopPropagation();
    saveCurrentCard();
    return;
  }

  if(target.matches && target.matches('.bottomNav button[data-view="hangar"]')){
    // Provide a Hangar-owned fallback in case another navigation listener failed.
    if(typeof showV2View==="function"){
      event.preventDefault();
      showV2View("hangar");
    }
    return;
  }

  if(target.id==="v2ClearHangar"){
    event.preventDefault();
    clearHangarStorage();
    return;
  }

  if(target.id==="collectionFlightIdCard"){
    if(typeof showV2View==="function"){
      event.preventDefault();
      showV2View("passport");
    }
  }
},true);

// Make capture callable from other modules/debugging without relying on lexical scope.
window.saveCurrentCard=saveCurrentCard;
window.renderHangarV2=renderHangarV2;

// Initial paint is intentionally non-fatal.
try{renderHangarV2()}catch(e){console.error("Initial Hangar render failed:",e)}
