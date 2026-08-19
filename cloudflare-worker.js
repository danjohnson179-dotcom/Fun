/* SKYHUNT live-aircraft bridge — Cloudflare Worker */
const SITE_ORIGIN="https://danjohnson179-dotcom.github.io";
const CACHE_SECONDS=2, UPSTREAM_TIMEOUT_MS=8500;

export default{async fetch(request,env,ctx){return handleRequest(request,ctx)}};

async function handleRequest(request,ctx){
  const origin=request.headers.get("Origin"),cors=corsHeaders(origin);
  if(request.method==="OPTIONS") return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"Origin not allowed"},403);
  if(!cors&&origin) return json({ok:false,error:"Origin not allowed"},403);
  if(request.method!=="GET") return json({ok:false,error:"Method not allowed"},405,cors);
  const url=new URL(request.url);
  if(url.pathname==="/health") return json({ok:true,service:"SKYHUNT aircraft bridge",primary:"adsb.fi",fallback:"Airplanes.live",cacheSeconds:CACHE_SECONDS,time:new Date().toISOString()},200,cors,{"Cache-Control":"no-store"});
  let query;
  try{query=parseRoute(url)}catch(error){return json({ok:false,error:error.message},400,cors)}
  if(!query) return json({ok:false,error:"Not found",routes:["/health","/point?lat=&lon=&radius=","/hex?hex="]},404,cors);

  const cache=caches.default, cacheKey=new Request(canonicalCacheUrl(url,query),{method:"GET"});
  const cached=await cache.match(cacheKey);
  if(cached) return withHeaders(cached,cors,{"X-SKYHUNT-Cache":"HIT"});
  const attempts=[];
  for(const provider of providersFor(query)){
    const started=Date.now();
    try{
      const upstream=await fetchWithTimeout(provider.url),body=await upstream.text();let payload;
      try{payload=JSON.parse(body)}catch{throw new Error(`Invalid JSON (HTTP ${upstream.status})`)}
      const ac=aircraftRows(payload);
      attempts.push({provider:provider.name,ok:upstream.ok,status:upstream.status,durationMs:Date.now()-started,aircraft:ac.length});
      if(!upstream.ok) continue;
      const response=json({...payload,ac,_skyhunt:{ok:true,provider:provider.name,fallbackUsed:provider.name!=="adsb.fi",cachedForSeconds:CACHE_SECONDS,attempts}},200,cors,{"Cache-Control":`public, max-age=${CACHE_SECONDS}`,"X-SKYHUNT-Provider":provider.name,"X-SKYHUNT-Cache":"MISS"});
      ctx.waitUntil(cache.put(cacheKey,response.clone())); return response;
    }catch(error){attempts.push({provider:provider.name,ok:false,durationMs:Date.now()-started,error:safeError(error)})}
  }
  return json({ok:false,error:"All live-aircraft providers failed",_skyhunt:{ok:false,provider:null,fallbackUsed:true,attempts}},502,cors,{"Cache-Control":"no-store"});
}

function parseRoute(url){
  if(url.pathname==="/point") return{type:"point",lat:strictNumber(url.searchParams.get("lat"),"lat",-90,90),lon:strictNumber(url.searchParams.get("lon"),"lon",-180,180),radius:Math.round(strictNumber(url.searchParams.get("radius")??"100","radius",1,250))};
  if(url.pathname==="/hex"){const hex=String(url.searchParams.get("hex")||"").trim().toLowerCase();if(!/^[0-9a-f]{6}$/.test(hex))throw new Error("hex must be exactly 6 hexadecimal characters");return{type:"hex",hex}}
  return null;
}
function strictNumber(raw,name,min,max){if(raw===null||raw.trim()==="")throw new Error(`${name} is required`);const value=Number(raw);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}`);return value}
function providersFor(q){return q.type==="hex"?[
  {name:"adsb.fi",url:`https://opendata.adsb.fi/api/v2/hex/${q.hex}`},
  {name:"Airplanes.live",url:`https://api.airplanes.live/v2/hex/${q.hex}`}
]:[
  {name:"adsb.fi",url:`https://opendata.adsb.fi/api/v3/lat/${q.lat}/lon/${q.lon}/dist/${q.radius}`},
  {name:"Airplanes.live",url:`https://api.airplanes.live/v2/point/${q.lat}/${q.lon}/${q.radius}`}
]}
async function fetchWithTimeout(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);try{return await fetch(url,{signal:controller.signal,headers:{Accept:"application/json","User-Agent":"SKYHUNT/1.0"}})}finally{clearTimeout(timer)}}
function aircraftRows(payload){const rows=payload?.ac||payload?.aircraft||[];return Array.isArray(rows)?rows:[]}
function corsHeaders(origin){
  if(!origin)return{};let allowed=origin===SITE_ORIGIN;
  try{const u=new URL(origin);allowed||=(u.hostname==="localhost"||u.hostname==="127.0.0.1")&&["http:","https:"].includes(u.protocol)}catch{}
  return allowed?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Accept, Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"}:null;
}
function canonicalCacheUrl(url,query){const key=new URL(url.origin+url.pathname);Object.entries(query).filter(([k])=>k!=="type").sort().forEach(([k,v])=>key.searchParams.set(k,String(v)));return key.href}
function withHeaders(response,...groups){const headers=new Headers(response.headers);groups.forEach(g=>Object.entries(g||{}).forEach(([k,v])=>headers.set(k,v)));return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
function json(value,status=200,...groups){const headers=new Headers({"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff"});groups.forEach(g=>Object.entries(g||{}).forEach(([k,v])=>headers.set(k,v)));return new Response(JSON.stringify(value,null,2),{status,headers})}
function safeError(error){return error?.name==="AbortError"?"Upstream timeout":String(error?.message||error||"Unknown upstream error").slice(0,240)}
