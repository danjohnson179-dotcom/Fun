/* SKYHUNT v5.3.3 — ai-finder.js */
// ===== v5.2.5 — AI FINDER =====
const aiFinderBackdrop=$("#aiFinderBackdrop"),aiMessages=$("#aiMessages"),aiInput=$("#aiInput");
const aiSend=$("#aiSend"),aiClose=$("#aiClose");
let aiLastMatches=[];

const AI_AIRLINES={
  "british airways":["BAW","SHT"],"ba":["BAW","SHT"],"ryanair":["RYR"],"easyjet":["EZY"],
  "lufthansa":["DLH"],"emirates":["UAE"],"qatar":["QTR"],"qatar airways":["QTR"],
  "american airlines":["AAL"],"delta":["DAL"],"united":["UAL"],"klm":["KLM"],
  "air france":["AFR"],"virgin atlantic":["VIR"],"turkish":["THY"],"wizz":["WZZ"],
  "wizz air":["WZZ"],"jet2":["EXS"],"tui":["TOM"],"singapore airlines":["SIA"],
  "cathay pacific":["CPA"],"etihad":["ETD"],"southwest":["SWA"],"fedex":["FDX"],"ups":["UPS"]
};
const AI_TYPES={
  "a380":["A388"],"airbus a380":["A388"],"747":["B741","B742","B743","B744","B748"],
  "boeing 747":["B741","B742","B743","B744","B748"],"787":["B788","B789","B78X"],
  "dreamliner":["B788","B789","B78X"],"777":["B772","B773","B77L","B77W"],
  "a350":["A359","A35K"],"a330":["A332","A333","A338","A339"],
  "a320":["A318","A319","A320","A321","A20N","A21N"],"737":["B736","B737","B738","B739","B38M","B39M"]
};
function aiEsc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function aiAddBubble(text,who="bot",htmlMode=false){
  const d=document.createElement("div");d.className=`aiBubble ${who}`;
  if(htmlMode)d.innerHTML=text;else d.textContent=text;
  aiMessages.appendChild(d);aiMessages.scrollTop=aiMessages.scrollHeight;return d;
}
function aiParse(q){
  const s=q.toLowerCase().trim(),p={raw:q,airline:[],types:[],minAlt:null,maxAlt:null,minSpeed:null,maxSpeed:null,sort:null,direction:null};
  for(const [name,codes] of Object.entries(AI_AIRLINES))if(s.includes(name)){p.airline=codes;break}
  for(const [name,codes] of Object.entries(AI_TYPES))if(s.includes(name)){p.types=codes;break}
  const above=s.match(/(?:above|over|higher than)\s*([\d,]+)\s*(?:ft|feet)?/);
  const below=s.match(/(?:below|under|lower than)\s*([\d,]+)\s*(?:ft|feet)?/);
  const speedAbove=s.match(/(?:above|over|faster than)\s*([\d,]+)\s*(?:kt|kts|knots)/);
  if(above)p.minAlt=Number(above[1].replace(/,/g,""));
  if(below)p.maxAlt=Number(below[1].replace(/,/g,""));
  if(speedAbove)p.minSpeed=Number(speedAbove[1].replace(/,/g,""));
  if(/\bhighest\b/.test(s))p.sort="highest";
  else if(/\blowest\b/.test(s))p.sort="lowest";
  else if(/\bfastest\b/.test(s))p.sort="fastest";
  else if(/\bslowest\b/.test(s))p.sort="slowest";
  if(/\bwest(?:bound|ward)?\b/.test(s))p.direction="west";
  if(/\beast(?:bound|ward)?\b/.test(s))p.direction="east";
  if(/\bnorth(?:bound|ward)?\b/.test(s))p.direction="north";
  if(/\bsouth(?:bound|ward)?\b/.test(s))p.direction="south";
  return p;
}
function aiAlt(a){return String(a.alt_baro).toLowerCase()==="ground"?0:Number(a.alt_baro)}
function aiDirectionOK(track,dir){
  const t=Number(track);if(!Number.isFinite(t)||!dir)return !dir;
  if(dir==="north")return t>=315||t<45;if(dir==="east")return t>=45&&t<135;
  if(dir==="south")return t>=135&&t<225;if(dir==="west")return t>=225&&t<315;return true;
}
function aiMatchScore(a,p){
  const flight=(a.flight||"").trim().toUpperCase(),type=(a.t||"").toUpperCase();
  if(p.airline.length&&!p.airline.some(c=>flight.startsWith(c)))return -1;
  if(p.types.length&&!p.types.includes(type))return -1;
  const alt=aiAlt(a),speed=Number(a.gs);
  if(p.minAlt!==null&&(!Number.isFinite(alt)||alt<p.minAlt))return -1;
  if(p.maxAlt!==null&&(!Number.isFinite(alt)||alt>p.maxAlt))return -1;
  if(p.minSpeed!==null&&(!Number.isFinite(speed)||speed<p.minSpeed))return -1;
  if(!aiDirectionOK(a.track,p.direction))return -1;
  let score=0;if(p.airline.length)score+=5;if(p.types.length)score+=5;
  if(p.minAlt!==null||p.maxAlt!==null)score+=2;if(p.direction)score+=1;
  return score;
}
async function aiLiveSample(){
  if(Array.isArray(worldPlanes)&&worldPlanes.length>20)return worldPlanes;

  const sample=[...zones].sort(()=>Math.random()-.5).slice(0,5),all=[];

  for(let i=0;i<sample.length;i++){
    const [name,lat,lon]=sample[i];

    try{
      const rows=(await scanAircraft(name,lat,lon)).slice(0,100);
      rows.forEach(a=>all.push({...a,_zone:name,_worldSource:window.SKYHUNT_AIRCRAFT_API.source}));
    }catch(_){}

    if(i<sample.length-1)await sleep(1100);
  }

  const seen=new Set();
  return all.filter(a=>{
    const k=(a.hex||"").toLowerCase();
    if(!k||seen.has(k))return false;
    seen.add(k);
    return true;
  });
}
function aiResultCard(a,index){
  const call=(a.flight||"").trim()||a.r||a.hex||"UNKNOWN";
  const alt=Number.isFinite(aiAlt(a))?`${Math.round(aiAlt(a)).toLocaleString("en-GB")} ft`:"—";
  const sp=Number.isFinite(Number(a.gs))?`${Math.round(Number(a.gs))} kt`:"—";
  return `<div class="aiResult">
    <div class="aiResultTop"><div><div class="aiResultCall">${aiEsc(call)}</div><div class="aiResultType">${aiEsc(a.t||"Unknown type")} · ${aiEsc(a.r||a.hex||"Unknown registration")}</div></div><div class="aiMatch">LIVE MATCH</div></div>
    <div class="aiResultStats"><div><b>${aiEsc(alt)}</b><span>ALTITUDE</span></div><div><b>${aiEsc(sp)}</b><span>SPEED</span></div><div><b>${Math.round(Number(a.track)||0)}°</b><span>TRACK</span></div></div>
    <div class="aiResultActions"><button class="aiResultBtn primary" data-ai-open="${index}">OPEN TARGET</button><button class="aiResultBtn" data-ai-save="${index}">＋ CAPTURE</button></div>
  </div>`;
}
async function aiSearch(q){
  const p=aiParse(q),thinking=aiAddBubble('<span class="aiThinking"><i></i><i></i><i></i></span> Searching the live sky…',"bot",true);
  try{
    const planes=await aiLiveSample();
    let matches=planes.map(a=>({a,score:aiMatchScore(a,p)})).filter(x=>x.score>=0);
    if(p.sort==="highest")matches.sort((x,y)=>(aiAlt(y.a)||-1)-(aiAlt(x.a)||-1));
    else if(p.sort==="lowest")matches.sort((x,y)=>(aiAlt(x.a)||1e9)-(aiAlt(y.a)||1e9));
    else if(p.sort==="fastest")matches.sort((x,y)=>(Number(y.a.gs)||-1)-(Number(x.a.gs)||-1));
    else if(p.sort==="slowest")matches.sort((x,y)=>(Number(x.a.gs)||1e9)-(Number(y.a.gs)||1e9));
    else matches.sort((x,y)=>y.score-x.score);
    aiLastMatches=matches.slice(0,3).map(x=>x.a);
    thinking.remove();
    if(!aiLastMatches.length){
      aiAddBubble(`I searched ${planes.length} live aircraft in the current radar sample but couldn't find a match. That doesn't prove none are flying — try a broader description or scan again later.`);
      return;
    }
    aiAddBubble(`I found ${matches.length} matching live target${matches.length===1?"":"s"}. Best ${Math.min(3,matches.length)} shown below.`);
    aiLastMatches.forEach((a,i)=>aiAddBubble(aiResultCard(a,i),"bot",true));
    aiMessages.querySelectorAll("[data-ai-open]").forEach(b=>b.onclick=()=>aiOpen(Number(b.dataset.aiOpen)));
    aiMessages.querySelectorAll("[data-ai-save]").forEach(b=>b.onclick=()=>aiSave(Number(b.dataset.aiSave),b));
  }catch(e){thinking.remove();aiAddBubble(`The live search couldn't complete: ${e.message||"feed unavailable"}. Try again in a moment.`)}
}
function aiOpen(i){
  const a=aiLastMatches[i];if(!a)return;closeAiFinder();
  renderAircraft(a,a._zone||"AI Finder",a._worldSource||"Live ADS-B");showV2View("spin");
  setTimeout(()=>result.scrollIntoView({behavior:"smooth",block:"start"}),160);
}
function aiSave(i,btn){
  const a=aiLastMatches[i];if(!a)return;
  currentAircraft={...a,_zone:a._zone||"AI Finder",_source:a._worldSource||"Live ADS-B"};
  currentHex=(a.hex||"").trim().toLowerCase();currentZone=a._zone||"AI Finder";currentSource=a._worldSource||"Live ADS-B";
  lastLat=Number(a.lat);lastLon=Number(a.lon);
  const ok=window.SKYHUNT_COLLECTION?.capture(a,{zone:a._zone||"AI Finder",source:a._worldSource||"Live ADS-B"});
  btn.textContent=ok?"CAPTURED ✓":"CAPTURE FAILED";
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

function openAiFinder(){
  aiFinderBackdrop.classList.add("show");
  aiFinderBackdrop.setAttribute("aria-hidden","false");
  setTimeout(()=>aiInput.focus(),150);
}
function closeAiFinder(){
  aiFinderBackdrop.classList.remove("show");
  aiFinderBackdrop.setAttribute("aria-hidden","true");
  returnFromLabsToHome();
}
function aiSubmit(){const q=aiInput.value.trim();if(!q)return;aiAddBubble(q,"user");aiInput.value="";aiSearch(q)}
if(aiClose)aiClose.addEventListener("click",closeAiFinder);aiSend.addEventListener("click",aiSubmit);
aiInput.addEventListener("keydown",e=>{if(e.key==="Enter")aiSubmit()});
document.querySelectorAll(".aiExample").forEach(b=>b.addEventListener("click",()=>{aiInput.value=b.textContent;aiSubmit()}));

// iOS-safe fallback for AI Finder exit.
document.addEventListener("click",event=>{
  const button=event.target.closest?.("#aiClose");
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  closeAiFinder();
},true);
