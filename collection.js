/* SKYHUNT v5.3.1 — collection.js */
const COLLECTION_KEY="skyhuntCollectionV1";
const LEGACY_COLLECTION_KEYS=["flightRouletteHangarV1","skyhuntHangar_STAGING_v4_1"];
const COLLECTION_MIGRATION_KEY="skyhuntCollectionMigrationV1";
let selectedCollectionAircraft=null,selectedCollectionMeta={};

function collectionSafe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function collectionRarity(type,desc=""){
 const t=String(type||"").toUpperCase(),d=String(desc||"").toUpperCase();
 const ultra=["A388","A380","B748","AN22","AN124","A225"],rare=["B744","B742","B743","A346","A345","A343","B753","B752","MD11","DC10","CONC","B703","IL96"],uncommon=["B763","B762","B764","B788","B789","B78X","A332","A333","A338","A339","A359","A35K","B77L","B77W","B772","E190","E195","BCS1","BCS3"];
 if(ultra.includes(t)||d.includes("ANTONOV AN-225"))return{name:"Ultra Rare",cls:"ultra"};
 if(rare.includes(t))return{name:"Rare",cls:"rare"};
 if(uncommon.includes(t))return{name:"Uncommon",cls:"uncommon"};
 return{name:"Common",cls:"common"};
}
function migrateLegacyCollection(){
 // Migration is deliberately one-time. Clearing Collection must never resurrect old Hangar cards.
 if(localStorage.getItem(COLLECTION_MIGRATION_KEY)==="done")return;

 try{
   if(!localStorage.getItem(COLLECTION_KEY)){
     for(const key of LEGACY_COLLECTION_KEYS){
       try{
         const raw=localStorage.getItem(key);
         if(!raw)continue;
         const parsed=JSON.parse(raw);
         if(Array.isArray(parsed)&&parsed.length){
           localStorage.setItem(COLLECTION_KEY,JSON.stringify(parsed));
           break;
         }
       }catch(_){}
     }
   }
 }finally{
   localStorage.setItem(COLLECTION_MIGRATION_KEY,"done");
 }
}
function readCollection(){migrateLegacyCollection();try{const p=JSON.parse(localStorage.getItem(COLLECTION_KEY)||"[]");return Array.isArray(p)?p.filter(x=>x&&typeof x==="object"):[]}catch(e){return[]}}
function writeCollection(items){try{localStorage.setItem(COLLECTION_KEY,JSON.stringify(items));return true}catch(e){collectionToast("Could not save on this device");return false}}
function collectionToast(text){const t=document.querySelector("#collectorToast");if(!t)return;t.textContent=text;t.classList.add("show");clearTimeout(collectionToast._t);collectionToast._t=setTimeout(()=>t.classList.remove("show"),2200)}
function cardFromAircraft(a,meta={}){
 if(!a||typeof a!=="object")return null;
 const flight=String(a.flight||"").trim(),hex=String(meta.hex||a.hex||"").trim().toLowerCase(),registration=String(a.r||"").trim(),rarity=collectionRarity(a.t,a.desc);
 let altitude="Not available";if(String(a.alt_baro).toLowerCase()==="ground")altitude="Ground";else if(Number.isFinite(Number(a.alt_baro)))altitude=`${Math.round(Number(a.alt_baro)).toLocaleString("en-GB")} ft`;
 return{id:hex||registration||flight||`capture-${Date.now()}`,callsign:flight||registration||hex||"UNKNOWN",type:a.t||"Unknown",description:a.desc||"",registration:registration||"Unknown",hex:hex||"Unknown",altitude,speed:Number.isFinite(Number(a.gs))?`${Math.round(Number(a.gs))} kt`:"Not available",heading:Number.isFinite(Number(a.track))?`${Math.round(Number(a.track))}°`:"Not available",lat:Number.isFinite(Number(a.lat))?Number(a.lat):null,lon:Number.isFinite(Number(a.lon))?Number(a.lon):null,zone:meta.zone||a._zone||"Unknown area",source:meta.source||a._source||"Live ADS-B",rarity:rarity.name,rarityClass:rarity.cls,firstSaved:new Date().toISOString(),discoveries:1};
}
function selectCollectionAircraft(a,meta={}){selectedCollectionAircraft=a||null;selectedCollectionMeta={...meta};return!!selectedCollectionAircraft}
function captureAircraft(a,meta={}){
 const card=cardFromAircraft(a,meta);if(!card){collectionToast("No aircraft selected");return false}
 const items=readCollection(),id=String(card.id).toLowerCase(),hex=String(card.hex).toLowerCase();
 const match=items.find(x=>String(x.id||"").toLowerCase()===id||(hex!=="unknown"&&String(x.hex||"").toLowerCase()===hex));
 if(match){match.discoveries=(Number(match.discoveries)||1)+1;Object.assign(match,{lastSeen:new Date().toISOString(),altitude:card.altitude,speed:card.speed,heading:card.heading,lat:card.lat,lon:card.lon,zone:card.zone,source:card.source})}else items.unshift(card);
 if(!writeCollection(items))return false;renderCollection();try{if(typeof renderPassport==="function")renderPassport()}catch(_){}
 collectionToast(match?`Duplicate! ${card.callsign} is now ×${match.discoveries}`:`${card.callsign} added to Collection ✓`);return true;
}
function captureSelectedAircraft(){
 const b=document.querySelector("#captureBtn");if(b){b.disabled=true;b.textContent="CAPTURING…"}
 const ok=captureAircraft(selectedCollectionAircraft,selectedCollectionMeta);
 if(b){b.disabled=false;b.classList.toggle("saved",ok);b.textContent=ok?"✓ ADDED TO COLLECTION":"CAPTURE FAILED — TAP TO RETRY"}return ok;
}
function renderCollection(){
 const items=readCollection(),grid=document.querySelector("#collectionGrid"),empty=document.querySelector("#collectionEmpty");if(!grid||!empty)return;
 const c=document.querySelector("#collectionCardCount"),t=document.querySelector("#collectionTypeCount"),r=document.querySelector("#collectionRareCount");
 if(c)c.textContent=items.reduce((s,x)=>s+(Number(x.discoveries)||1),0);if(t)t.textContent=new Set(items.map(x=>String(x.type||"Unknown").toUpperCase())).size;if(r)r.textContent=items.filter(x=>x.rarity==="Rare"||x.rarity==="Ultra Rare").length;
 if(!items.length){grid.innerHTML="";empty.style.display="block";empty.innerHTML="<strong>Your Collection is empty.</strong><br>Capture a live aircraft and it will appear here.";return}
 empty.style.display="none";grid.innerHTML=items.map(item=>{const rarity=collectionRarity(item.type,item.description||""),d=new Date(item.firstSaved||Date.now()),date=Number.isNaN(d.getTime())?"Unknown date":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});return`<article class="v2CollectCard ${collectionSafe(item.rarityClass||rarity.cls)}"><div class="foil"></div><div class="v2Rarity">${collectionSafe(item.rarity||rarity.name)}</div><div class="cardPlane">✈</div><div class="v2Call">${collectionSafe(item.callsign||"UNKNOWN")}</div><div class="v2Type">${collectionSafe(item.type||"Unknown")}</div><div class="v2Stats"><span>${collectionSafe(item.altitude||"Not available")}<small>CAPTURE ALT</small></span><span>${collectionSafe(item.speed||"Not available")}<small>SPEED</small></span></div><div class="v2Reg">${collectionSafe(item.registration||"Unknown")} · ${collectionSafe(item.hex||"Unknown")}</div><div class="v2Reg">Captured near ${collectionSafe(item.zone||"Unknown area")} · ${collectionSafe(date)}</div>${(Number(item.discoveries)||1)>1?`<div class="v2Dup">×${Number(item.discoveries)||1}</div>`:""}</article>`}).join("");
}
function clearCollection(){
 if(!confirm("Clear every aircraft from your Collection on this device?"))return;

 try{
   localStorage.removeItem(COLLECTION_KEY);

   // Remove historical Hangar stores too, otherwise old cards can be imported again.
   for(const key of LEGACY_COLLECTION_KEYS){
     localStorage.removeItem(key);
   }

   // Explicitly mark migration complete so an empty Collection stays empty.
   localStorage.setItem(COLLECTION_MIGRATION_KEY,"done");
 }catch(e){
   console.warn("Collection clear encountered a storage error",e);
 }

 selectedCollectionAircraft=null;
 selectedCollectionMeta={};
 renderCollection();

 if(typeof renderPassport==="function"){
   try{renderPassport()}catch(e){console.warn("Flight ID refresh failed",e)}
 }

 collectionToast("Collection cleared");
}
window.SKYHUNT_COLLECTION={select:selectCollectionAircraft,capture:captureAircraft,captureSelected:captureSelectedAircraft,render:renderCollection,get:readCollection,clear:clearCollection};
document.addEventListener("click",e=>{const b=e.target.closest?.("button");if(!b)return;if(b.id==="captureBtn"){e.preventDefault();e.stopPropagation();captureSelectedAircraft()}else if(b.id==="clearCollection"){e.preventDefault();clearCollection()}},true);
migrateLegacyCollection();renderCollection();
