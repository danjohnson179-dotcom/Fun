
(function(){
"use strict";

const $=s=>document.querySelector(s);
const results=[];
let discoveredHex="";
let userLocation=null;

const groups={
 browser:"#browserTests",
 aircraft:"#aircraftTests",
 device:"#deviceTests",
 platform:"#platformTests",
 news:"#newsTests"
};

const tests=[
 {id:"secure",group:"browser",name:"Secure browser context",run:testSecureContext},
 {id:"assets",group:"browser",name:"SKYHUNT deployed JS files",run:testAssets},
 {id:"providerWiring",group:"browser",name:"Aircraft provider wiring",run:testProviderWiring},
 {id:"online",group:"browser",name:"Browser network state",run:testOnline},

 {id:"airPoint",group:"aircraft",name:"Airplanes.live point search",run:testAircraftPoint},
 {id:"airShape",group:"aircraft",name:"Aircraft response format",run:testAircraftShape},
 {id:"airRepeat",group:"aircraft",name:"Rate-limit / repeat request",run:testAircraftRepeat},
 {id:"airHex",group:"aircraft",name:"Airplanes.live hex lookup",run:testAircraftHex},

 {id:"geoSupport",group:"device",name:"Geolocation support",run:testGeoSupport},
 {id:"geoLive",group:"device",name:"Live location permission",run:testGeoLive},
 {id:"camera",group:"device",name:"Camera / Sky Lens access",run:testCamera},
 {id:"orientation",group:"device",name:"Motion & orientation",run:testOrientation},

 {id:"leaflet",group:"platform",name:"Leaflet map engine",run:testLeaflet},
 {id:"osm",group:"platform",name:"OpenStreetMap tile delivery",run:testOSM},
 {id:"storage",group:"platform",name:"Local Collection storage",run:testStorage},

 {id:"newsRss",group:"news",name:"Google News RSS â rss2json",run:testRss2Json},
 {id:"newsFallback",group:"news",name:"AllOrigins RSS fallback",run:testAllOrigins},
 {id:"microlink",group:"news",name:"Microlink image metadata",run:testMicrolink}
];

function cardFor(t){
 const el=document.createElement("article");
 el.className="testCard";
 el.id="test-"+t.id;
 el.innerHTML=`<div class="testTop"><span class="testName">${esc(t.name)}</span><span class="badge">NOT RUN</span></div>
 <div class="testMessage">Waiting for diagnostic run.</div><div class="testDetail"></div><div class="testTime"></div>`;
 $(groups[t.group]).appendChild(el);
}
tests.forEach(cardFor);

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

function classifyFetchError(err,url){
 const msg=String(err?.message||err||"Unknown error");
 if(err?.name==="AbortError")return `TIMEOUT: the browser opened the request but no usable response arrived before the timeout.`;
 if(/load failed|failed to fetch|networkerror|network request failed/i.test(msg))
   return `NETWORK/CORS: Safari failed before receiving an HTTP response. The API may be blocking cross-origin browser requests, DNS/TLS may have failed, or the network blocked the request.`;
 return `${err?.name||"Error"}: ${msg}`;
}

async function timedFetch(url,opts={},timeout=12000){
 const ctl=new AbortController();
 const timer=setTimeout(()=>ctl.abort(),timeout);
 const started=performance.now();
 try{
   const res=await fetch(url,{...opts,signal:ctl.signal,cache:"no-store"});
   const ms=Math.round(performance.now()-started);
   const text=await res.text();
   let json=null;
   try{json=JSON.parse(text)}catch(_){}
   return {ok:res.ok,status:res.status,statusText:res.statusText,ms,text,json,headers:res.headers};
 }catch(err){
   return {ok:false,networkError:true,error:err,ms:Math.round(performance.now()-started),explanation:classifyFetchError(err,url)};
 }finally{clearTimeout(timer)}
}

function providerMeaning(r){
 if(r.networkError)return r.explanation;
 if(r.status===401)return "HTTP 401: authentication is required or the request is not authorised.";
 if(r.status===403)return "HTTP 403: Airplanes.live actively rejected this request/browser/IP.";
 if(r.status===404)return "HTTP 404: the endpoint path is not available.";
 if(r.status===429)return "HTTP 429: the public API rate limit has been exceeded. Wait before scanning again.";
 if(r.status>=500)return `HTTP ${r.status}: Airplanes.live is failing server-side. SKYHUNT code cannot repair this.`;
 if(!r.ok)return `HTTP ${r.status}: the API responded but rejected the request.`;
 if(r.json?.error)return `API ERROR: the server returned JSON with error="${r.json.error}".`;
 return "";
}

function setResult(id,status,message,detail="",ms=""){
 const t=tests.find(x=>x.id===id);
 const el=$("#test-"+id);
 el.className="testCard "+status;
 el.querySelector(".badge").textContent=status==="pass"?"PASS":status==="warn"?"WARNING":status==="fail"?"FAIL":"RUNNING";
 el.querySelector(".testMessage").textContent=message;
 el.querySelector(".testDetail").textContent=detail;
 el.querySelector(".testTime").textContent=ms!==""?`${ms} ms`:"";
 const existing=results.findIndex(x=>x.id===id);
 const row={id,name:t?.name||id,status,message,detail,ms};
 if(existing>=0)results[existing]=row;else results.push(row);
 updateSummary();
}
function setRunning(id){
 const el=$("#test-"+id);
 el.className="testCard running";
 el.querySelector(".badge").textContent="RUNNING";
 el.querySelector(".testMessage").textContent="Testingâ¦";
 el.querySelector(".testDetail").textContent="";
 el.querySelector(".testTime").textContent="";
}
function updateSummary(){
 const pass=results.filter(x=>x.status==="pass").length;
 const warn=results.filter(x=>x.status==="warn").length;
 const fail=results.filter(x=>x.status==="fail").length;
 $("#passCount").textContent=pass;$("#warnCount").textContent=warn;$("#failCount").textContent=fail;$("#testCount").textContent=results.length;
 if(fail){$("#overallStatus").textContent="FAULTS FOUND";$("#overallStatus").style.color="#ff8195";$("#overallDetail").textContent=`${fail} failed test${fail===1?"":"s"} Â· ${warn} warning${warn===1?"":"s"}`;}
 else if(warn){$("#overallStatus").textContent="DEGRADED";$("#overallStatus").style.color="#efc56f";$("#overallDetail").textContent=`No hard failures Â· ${warn} warning${warn===1?"":"s"}`;}
 else if(results.length){$("#overallStatus").textContent="HEALTHY";$("#overallStatus").style.color="#76d6a5";$("#overallDetail").textContent="All completed tests passed.";}
 renderReport();
}
function renderReport(){
 const lines=[
 "SKYHUNT FULL DIAGNOSTIC REPORT",
 `Time: ${new Date().toISOString()}`,
 `Page: ${location.href}`,
 `User agent: ${navigator.userAgent}`,
 `Online: ${navigator.onLine}`,
 `Secure context: ${window.isSecureContext}`,
 "",
 ...results.map(r=>`[${r.status.toUpperCase()}] ${r.name}${r.ms!==""?` (${r.ms} ms)`:""}\n${r.message}${r.detail?`\n${r.detail}`:""}`)
 ];
 $("#rawReport").textContent=lines.join("\n\n");
}

async function testSecureContext(){
 if(window.isSecureContext)setResult("secure","pass","HTTPS secure context is active.","Camera, geolocation and other protected browser APIs are allowed to operate.");
 else setResult("secure","fail","This page is not running in a secure context.","Camera and geolocation can fail unless the site is served over HTTPS.");
}
async function testOnline(){
 if(navigator.onLine)setResult("online","pass","Browser reports an active network connection.",`navigator.onLine = true`);
 else setResult("online","fail","Browser reports that it is offline.","No external API can work while the browser is offline.");
}
async function testAssets(){
 const names=["core.js","nearby.js","radar.js","ai-finder.js","skylens.js","news.js","collection.js","app.js"];
 const bad=[],ok=[];
 for(const name of names){
   const r=await timedFetch(`${name}?diag=${Date.now()}`,{},7000);
   if(r.ok)ok.push(`${name} HTTP ${r.status}`);else bad.push(`${name}: ${r.networkError?r.explanation:`HTTP ${r.status}`}`);
 }
 if(bad.length)setResult("assets","fail",`${bad.length} deployed SKYHUNT file${bad.length===1?"":"s"} could not be fetched.`,bad.join("\n"));
 else setResult("assets","pass","All core SKYHUNT JavaScript files are being served by GitHub Pages.",ok.join("\n"));
}
async function testProviderWiring(){
 const names=["core.js","nearby.js","radar.js","ai-finder.js","skylens.js"];
 const old=["api.adsb.lol","opendata.adsb.fi","api.adsb.one","opensky-network.org","intelsky.org"];
 const problems=[],details=[];
 for(const name of names){
   const r=await timedFetch(`${name}?diagwire=${Date.now()}`,{},7000);
   if(!r.ok){problems.push(`${name} could not be inspected`);continue}
   const text=r.text;
   const foundOld=old.filter(x=>text.includes(x));
   const hasAirplanes=text.includes("api.airplanes.live") || ["radar.js","ai-finder.js","skylens.js"].includes(name);
   details.push(`${name}: ${foundOld.length?`OLD PROVIDERS: ${foundOld.join(", ")}`:"no old provider URL found"}`);
   if(foundOld.length)problems.push(`${name} still contains ${foundOld.join(", ")}`);
   if((name==="core.js"||name==="nearby.js")&&!hasAirplanes)problems.push(`${name} does not contain Airplanes.live`);
 }
 if(problems.length)setResult("providerWiring","fail","The deployed aircraft-provider wiring is inconsistent.",problems.join("\n")+"\n\n"+details.join("\n"));
 else setResult("providerWiring","pass","The deployed aircraft feature files are consistent with the Airplanes.live-only build.",details.join("\n"));
}

async function testAircraftPoint(){
 const url="https://api.airplanes.live/v2/point/51.4700/-0.4543/100";
 const r=await timedFetch(url,{headers:{Accept:"application/json"}},12000);
 window.__diagPoint=r;
 const meaning=providerMeaning(r);
 if(meaning){setResult("airPoint","fail","Airplanes.live point search failed.",`${meaning}\nURL: ${url}${r.text?`\nBody: ${r.text.slice(0,500)}`:""}`,r.ms);return}
 const rows=r.json?.ac||r.json?.aircraft||[];
 if(!Array.isArray(rows)){setResult("airPoint","fail","Airplanes.live returned JSON but not an aircraft array.",`HTTP ${r.status}\nBody: ${r.text.slice(0,500)}`,r.ms);return}
 if(!rows.length){setResult("airPoint","warn","Airplanes.live is reachable but returned zero aircraft.","This is not a browser/CORS failure. The API successfully responded, but its live dataset contained no aircraft for the Heathrow 100 NM test area.",r.ms);return}
 discoveredHex=String(rows.find(a=>a?.hex)?.hex||"").trim();
 setResult("airPoint","pass",`Airplanes.live returned ${rows.length} aircraft around Heathrow.`,`HTTP ${r.status} Â· JSON OK${discoveredHex?` Â· test hex ${discoveredHex}`:""}`,r.ms);
}
async function testAircraftShape(){
 const r=window.__diagPoint;
 if(!r){setResult("airShape","warn","Point-search test did not produce a response to inspect.");return}
 if(r.networkError||!r.json){setResult("airShape","fail","No valid Airplanes.live JSON was available to validate.",r.explanation||`HTTP ${r.status}`);return}
 const rows=r.json?.ac||r.json?.aircraft||[];
 if(!rows.length){setResult("airShape","warn","API format is valid enough to expose an aircraft array, but the array is empty.","Cannot validate individual aircraft fields until the provider returns at least one aircraft.");return}
 const a=rows[0],required=["hex","lat","lon"],missing=required.filter(k=>a?.[k]===undefined||a?.[k]===null);
 if(missing.length)setResult("airShape","fail","Aircraft objects are missing fields SKYHUNT requires.",`Missing: ${missing.join(", ")}\nSample keys: ${Object.keys(a).slice(0,40).join(", ")}`);
 else setResult("airShape","pass","Aircraft response shape is compatible with SKYHUNT.",`Sample: hex=${a.hex} Â· callsign=${String(a.flight||"").trim()||"n/a"} Â· lat=${a.lat} Â· lon=${a.lon} Â· altitude=${a.alt_baro??"n/a"} Â· speed=${a.gs??"n/a"}`);
}
async function testAircraftRepeat(){
 await sleep(1200);
 const r=await timedFetch("https://api.airplanes.live/v2/point/51.4700/-0.4543/25",{headers:{Accept:"application/json"}},12000);
 const meaning=providerMeaning(r);
 if(meaning){setResult("airRepeat","fail","A correctly spaced second Airplanes.live request failed.",`${meaning}${r.text?`\nBody: ${r.text.slice(0,400)}`:""}`,r.ms);return}
 const rows=r.json?.ac||r.json?.aircraft||[];
 setResult("airRepeat","pass",`Second request succeeded after a 1.2 second pause.`,`HTTP ${r.status} Â· ${Array.isArray(rows)?rows.length:"?"} aircraft returned. This suggests normal scanning cadence is not immediately rate-limited.`,r.ms);
}
async function testAircraftHex(){
 if(!discoveredHex){setResult("airHex","warn","Hex lookup could not be tested because point search returned no aircraft.","The diagnostic will not invent an ICAO address.");return}
 await sleep(1200);
 const url=`https://api.airplanes.live/v2/hex/${encodeURIComponent(discoveredHex)}`;
 const r=await timedFetch(url,{headers:{Accept:"application/json"}},12000);
 const meaning=providerMeaning(r);
 if(meaning){setResult("airHex","fail","Airplanes.live hex lookup failed.",`${meaning}\nURL: ${url}${r.text?`\nBody: ${r.text.slice(0,400)}`:""}`,r.ms);return}
 const rows=r.json?.ac||r.json?.aircraft||[];
 if(Array.isArray(rows)&&rows.length)setResult("airHex","pass",`Hex lookup returned ${rows.length} aircraft record${rows.length===1?"":"s"}.`,`Hex ${discoveredHex} Â· HTTP ${r.status}`,r.ms);
 else setResult("airHex","warn","Hex endpoint responded but did not return the aircraft found in the point search.",`Hex ${discoveredHex} Â· HTTP ${r.status} Â· this would affect Live Follow.`,r.ms);
}

async function testGeoSupport(){
 if("geolocation" in navigator)setResult("geoSupport","pass","Browser exposes the Geolocation API.");
 else setResult("geoSupport","fail","Geolocation API is unavailable.","Nearby and Sky Lens cannot determine the user's location.");
}
async function testGeoLive(){
 if(!navigator.geolocation){setResult("geoLive","fail","Cannot test location because Geolocation is unsupported.");return}
 const started=performance.now();
 try{
   const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}));
   userLocation={lat:pos.coords.latitude,lon:pos.coords.longitude};
   setResult("geoLive","pass","Live location was returned successfully.",`Accuracy: approximately ${Math.round(pos.coords.accuracy)} m. Coordinates intentionally omitted from copied report for privacy.`,Math.round(performance.now()-started));
 }catch(e){
   const reason=e.code===1?"Permission denied":e.code===2?"Position unavailable":e.code===3?"Location timeout":e.message;
   setResult("geoLive","fail","Live location request failed.",`${reason}. Nearby and Sky Lens will not work until this is resolved.`,Math.round(performance.now()-started));
 }
}
async function testCamera(){
 if(!navigator.mediaDevices?.getUserMedia){setResult("camera","fail","getUserMedia/camera API is unavailable.","Sky Lens cannot start on this browser.");return}
 const started=performance.now();
 let stream=null;
 try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
   const tracks=stream.getVideoTracks();
   setResult("camera","pass","Camera permission and video stream both work.",tracks[0]?`Camera: ${tracks[0].label||"video device"}`:"Video track obtained.",Math.round(performance.now()-started));
 }catch(e){
   setResult("camera","fail","Camera request failed.",`${e.name}: ${e.message}. Sky Lens cannot use the camera until permission/device access succeeds.`,Math.round(performance.now()-started));
 }finally{if(stream)stream.getTracks().forEach(t=>t.stop())}
}
async function testOrientation(){
 if(typeof DeviceOrientationEvent==="undefined"){setResult("orientation","fail","DeviceOrientationEvent is unavailable.","Sky Lens compass/heading overlay cannot work.");return}
 try{
   if(typeof DeviceOrientationEvent.requestPermission==="function"){
     const r=await DeviceOrientationEvent.requestPermission();
     if(r!=="granted"){setResult("orientation","fail","Motion & Orientation permission was not granted.",`Result: ${r}`);return}
   }
   setResult("orientation","pass","Motion & Orientation capability is available.","The browser accepted the orientation permission check.");
 }catch(e){setResult("orientation","fail","Motion & Orientation permission test failed.",`${e.name}: ${e.message}`)}
}

async function testLeaflet(){
 if(typeof window.L==="object"&&typeof L.map==="function")setResult("leaflet","pass","Leaflet loaded and its map constructor is available.",`Leaflet version: ${L.version||"unknown"}`);
 else setResult("leaflet","fail","Leaflet did not load.","Global Radar, Nearby maps and Live Follow maps cannot render.");
}
async function testOSM(){
 const url="https://tile.openstreetmap.org/0/0/0.png";
 const started=performance.now();
 try{
   const ok=await new Promise(resolve=>{
     const img=new Image();const timer=setTimeout(()=>resolve(false),10000);
     img.onload=()=>{clearTimeout(timer);resolve(true)};img.onerror=()=>{clearTimeout(timer);resolve(false)};
     img.src=url+"?diag="+Date.now();
   });
   if(ok)setResult("osm","pass","OpenStreetMap tile image loaded successfully.","Map imagery is reachable from this browser.",Math.round(performance.now()-started));
   else setResult("osm","fail","OpenStreetMap tile failed to load.","Leaflet may initialise but maps can appear blank if tile delivery is blocked.",Math.round(performance.now()-started));
 }catch(e){setResult("osm","fail","OpenStreetMap tile test threw an error.",String(e),Math.round(performance.now()-started))}
}
async function testStorage(){
 const key="__skyhunt_diag_"+Date.now(),value="ok-"+Math.random();
 try{
   localStorage.setItem(key,value);
   const got=localStorage.getItem(key);
   localStorage.removeItem(key);
   if(got===value)setResult("storage","pass","localStorage read/write/delete works.","Collection persistence is available in this browser.");
   else setResult("storage","fail","localStorage write did not round-trip correctly.","Collection captures may not persist.");
 }catch(e){setResult("storage","fail","localStorage is blocked or unavailable.",`${e.name}: ${e.message}. Collection persistence may fail.`)}
}

function googleFeedUrl(){
 const p=new URLSearchParams({q:"aviation OR airline OR aircraft OR airport",hl:"en-GB",gl:"GB",ceid:"GB:en"});
 return `https://news.google.com/rss/search?${p.toString()}`;
}
async function testRss2Json(){
 const endpoint=new URL("https://api.rss2json.com/v1/api.json");
 endpoint.searchParams.set("rss_url",googleFeedUrl());
 const r=await timedFetch(endpoint.href,{headers:{Accept:"application/json"}},12000);
 if(r.networkError){setResult("newsRss","fail","rss2json browser request failed.",r.explanation,r.ms);return}
 if(!r.ok){setResult("newsRss","fail",`rss2json returned HTTP ${r.status}.`,r.text.slice(0,400),r.ms);return}
 if(r.json?.status!=="ok"){setResult("newsRss","fail","rss2json returned JSON but reported an API error.",`Message: ${r.json?.message||"unknown"}\nBody: ${r.text.slice(0,400)}`,r.ms);return}
 const n=Array.isArray(r.json?.items)?r.json.items.length:0;
 if(n)setResult("newsRss","pass",`rss2json returned ${n} Google News items.`,`HTTP ${r.status} Â· News primary fetch path is working.`,r.ms);
 else setResult("newsRss","warn","rss2json responded successfully but returned zero news items.","News page may show empty results even though the service is reachable.",r.ms);
}
async function testAllOrigins(){
 const proxy=`https://api.allorigins.win/raw?url=${encodeURIComponent(googleFeedUrl())}`;
 const r=await timedFetch(proxy,{},14000);
 if(r.networkError){setResult("newsFallback","fail","AllOrigins RSS fallback could not be reached.",r.explanation,r.ms);return}
 if(!r.ok){setResult("newsFallback","fail",`AllOrigins returned HTTP ${r.status}.`,r.text.slice(0,300),r.ms);return}
 if(/<rss|<item/i.test(r.text))setResult("newsFallback","pass","AllOrigins returned readable Google News RSS XML.","Skywire's final RSS fallback is available.",r.ms);
 else setResult("newsFallback","warn","AllOrigins responded but the body did not look like RSS XML.",r.text.slice(0,350),r.ms);
}
async function testMicrolink(){
 const url=new URL("https://api.microlink.io/");
 url.searchParams.set("url","https://www.bbc.co.uk/news");
 url.searchParams.set("filter","image.url");
 const r=await timedFetch(url.href,{headers:{Accept:"application/json"}},10000);
 if(r.networkError){setResult("microlink","warn","Microlink image metadata request failed.",`${r.explanation}\nThis affects News images, not article headlines.`,r.ms);return}
 if(!r.ok){setResult("microlink","warn",`Microlink returned HTTP ${r.status}.`,"Skywire can still function but some article images may be missing.",r.ms);return}
 setResult("microlink","pass","Microlink metadata endpoint responded successfully.","News image enrichment is reachable.",r.ms);
}

async function runAll(){
 results.length=0;discoveredHex="";window.__diagPoint=null;
 tests.forEach(t=>{const el=$("#test-"+t.id);el.className="testCard";el.querySelector(".badge").textContent="QUEUED";el.querySelector(".testMessage").textContent="Waitingâ¦";el.querySelector(".testDetail").textContent="";el.querySelector(".testTime").textContent=""});
 $("#runAll").disabled=true;$("#runAll").textContent="DIAGNOSTICS RUNNINGâ¦";
 for(const t of tests){
   setRunning(t.id);
   try{await t.run()}catch(e){setResult(t.id,"fail","Diagnostic test itself threw an unexpected error.",`${e.name||"Error"}: ${e.message||e}`)}
   await sleep(120);
 }
 $("#runAll").disabled=false;$("#runAll").textContent="RUN FULL DIAGNOSTIC";
 updateSummary();
}

$("#runAll").addEventListener("click",runAll);
$("#clearResults").addEventListener("click",()=>location.reload());
$("#copyReport").addEventListener("click",async()=>{
 const text=$("#rawReport").textContent;
 try{
   await navigator.clipboard.writeText(text);
   $("#copyReport").textContent="COPIED â";
   setTimeout(()=>$("#copyReport").textContent="COPY FULL REPORT",1600);
 }catch(_){
   const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();
 }
});
renderReport();
})();
