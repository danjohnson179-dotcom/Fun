/* SKYHUNT v5.2.9 — hangar.js
   Single source of truth for every capture path. */

const HANGAR_KEY="flightRouletteHangarV1";

function hangarSafe(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function aircraftRarity(type,desc=""){
  const t=String(type||"").toUpperCase(),d=String(desc||"").toUpperCase();
  const ultra=["A388","A380","B748","AN22","AN124","A225"];
  const rare=["B744","B742","B743","A346","A345","A343","B753","B752","MD11","DC10","CONC","B703","IL96"];
  const uncommon=["B763","B762","B764","B788","B789","B78X","A332","A333","A338","A339","A359","A35K","B77L","B77W","B772","E190","E195","BCS1","BCS3"];
  if(ultra.includes(t)||d.includes("ANTONOV AN-225"))return {name:"Ultra Rare",cls:"ultra"};
  if(rare.includes(t))return {name:"Rare",cls:"rare"};
  if(uncommon.includes(t))return {name:"Uncommon",cls:"uncommon"};
  return {name:"Common",cls:"common"};
}
function getHangar(){
  try{
    const a=JSON.parse(localStorage.getItem(HANGAR_KEY)||"[]");
    return Array.isArray(a)?a.filter(x=>x&&typeof x==="object"):[];
  }catch(e){
    console.warn("Invalid Hangar storage",e);
    return [];
  }
}
function setHangar(items){
  try{
    localStorage.setItem(HANGAR_KEY,JSON.stringify(items));
    return true;
  }catch(e){
    console.error("Hangar storage write failed",e);
    hangarToast("Could not save to this browser");
    return false;
  }
}
function hangarToast(text){
  const el=document.querySelector("#collectorToast");
  if(!el)return;
  el.textContent=text;el.classList.add("show");
  clearTimeout(hangarToast._t);
  hangarToast._t=setTimeout(()=>el.classList.remove("show"),2200);
}
function buildHangarCard(a,meta={}){
  if(!a||typeof a!=="object")return null;
  const flight=String(a.flight||"").trim();
  const hex=String(a.hex||meta.hex||"").trim().toLowerCase();
  const reg=String(a.r||"").trim();
  const rarity=aircraftRarity(a.t,a.desc);
  let altitude="Not available";
  if(String(a.alt_baro).toLowerCase()==="ground")altitude="Ground";
  else if(Number.isFinite(Number(a.alt_baro)))altitude=`${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
  return {
    id:hex||reg||flight||`capture-${Date.now()}`,
    callsign:flight||reg||hex||"UNKNOWN",
    type:a.t||"Unknown",
    description:a.desc||"",
    registration:reg||"Unknown",
    hex:hex||"Unknown",
    altitude,
    speed:Number.isFinite(Number(a.gs))?`${Math.round(Number(a.gs))} kt`:"Not available",
    heading:Number.isFinite(Number(a.track))?`${Math.round(Number(a.track))}°`:"Not available",
    lat:Number.isFinite(Number(a.lat))?Number(a.lat):null,
    lon:Number.isFinite(Number(a.lon))?Number(a.lon):null,
    zone:meta.zone||a._zone||"Unknown area",
    source:meta.source||a._source||"Live ADS-B",
    rarity:rarity.name,rarityClass:rarity.cls,
    firstSaved:new Date().toISOString(),discoveries:1
  };
}
function renderHangarV2(){
  try{
    const items=getHangar(),grid=document.querySelector("#v2HangarGrid"),empty=document.querySelector("#v2HangarEmpty");
    if(!grid||!empty)return;
    const captures=items.reduce((s,x)=>s+(Number(x.discoveries)||1),0);
    const types=new Set(items.map(x=>String(x.type||"Unknown").toUpperCase()));
    const rare=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;
    const c=document.querySelector("#v2CardCount"),t=document.querySelector("#v2TypeCount"),r=document.querySelector("#v2RareCount");
    if(c)c.textContent=captures;if(t)t.textContent=types.size;if(r)r.textContent=rare;
    if(!items.length){grid.innerHTML="";empty.style.display="block";return}
    empty.style.display="none";
    grid.innerHTML=items.map(card=>{
      const rarity=aircraftRarity(card.type,card.description||"");
      const d=new Date(card.firstSaved||Date.now());
      const date=Number.isNaN(d.getTime())?"Unknown date":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
      return `<article class="v2CollectCard ${hangarSafe(card.rarityClass||rarity.cls)}">
        <div class="foil"></div><div class="v2Rarity">${hangarSafe(card.rarity||rarity.name)}</div>
        <div class="cardPlane">✈</div><div class="v2Call">${hangarSafe(card.callsign||"UNKNOWN")}</div>
        <div class="v2Type">${hangarSafe(card.type||"Unknown")}</div>
        <div class="v2Stats"><span>${hangarSafe(card.altitude||"Not available")}<small>CAPTURE ALT</small></span><span>${hangarSafe(card.speed||"Not available")}<small>SPEED</small></span></div>
        <div class="v2Reg">${hangarSafe(card.registration||"Unknown")} · ${hangarSafe(card.hex||"Unknown")}</div>
        <div class="v2Reg">Captured near ${hangarSafe(card.zone||"Unknown area")} · ${hangarSafe(date)}</div>
        ${(Number(card.discoveries)||1)>1?`<div class="v2Dup">×${Number(card.discoveries)||1}</div>`:""}
      </article>`;
    }).join("");
  }catch(e){console.error("Hangar render failed",e)}
}
function captureAircraft(a,meta={}){
  try{
    const card=buildHangarCard(a,meta);
    if(!card){hangarToast("No aircraft selected");return false}
    const items=getHangar();
    const id=String(card.id).toLowerCase();
    const match=items.find(x=>String(x.id||"").toLowerCase()===id ||
      (card.hex!=="Unknown"&&String(x.hex||"").toLowerCase()===String(card.hex).toLowerCase()));
    if(match){
      match.discoveries=(Number(match.discoveries)||1)+1;
      Object.assign(match,{lastSeen:new Date().toISOString(),altitude:card.altitude,speed:card.speed,heading:card.heading,lat:card.lat,lon:card.lon,zone:card.zone,source:card.source});
    }else items.unshift(card);
    if(!setHangar(items))return false;
    renderHangarV2();
    try{if(typeof renderPassport==="function")renderPassport()}catch(_){}
    hangarToast(match?`Duplicate! ${card.callsign} is now ×${match.discoveries}`:`${card.callsign} captured ✓`);
    return true;
  }catch(e){console.error("Capture failed",e);hangarToast("Hangar capture failed");return false}
}
function saveCurrentCard(){
  const btn=document.querySelector("#saveCardBtn");
  if(btn){btn.disabled=true;btn.textContent="SAVING…"}
  const ok=captureAircraft(
    typeof currentAircraft!=="undefined"?currentAircraft:null,
    {hex:typeof currentHex!=="undefined"?currentHex:null,zone:typeof currentZone!=="undefined"?currentZone:null,source:typeof currentSource!=="undefined"?currentSource:null}
  );
  if(btn){
    btn.disabled=false;
    btn.textContent=ok?"✓ CAPTURED TO HANGAR":"CAPTURE FAILED — TAP TO RETRY";
  }
  return ok;
}
window.SKYHUNT_HANGAR={captureAircraft,saveCurrentCard,render:renderHangarV2,get:getHangar};
window.saveCurrentCard=saveCurrentCard;
window.renderHangarV2=renderHangarV2;

document.addEventListener("click",e=>{
  const b=e.target.closest?.("button");if(!b)return;
  if(b.id==="saveCardBtn"){e.preventDefault();saveCurrentCard()}
  if(b.id==="v2ClearHangar"){
    e.preventDefault();
    if(confirm("Clear every aircraft from your Hangar on this device?")){
      localStorage.removeItem(HANGAR_KEY);renderHangarV2();hangarToast("Hangar cleared");
    }
  }
},true);

try{renderHangarV2()}catch(e){}
