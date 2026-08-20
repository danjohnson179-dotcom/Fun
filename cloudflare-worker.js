/* SKYHUNT optional detailed-aircraft bridge — Cloudflare Worker (ES module)
   Secret required: AIRLABS_API_KEY
   The embedded adsb.lol maps do not depend on this Worker.
*/
const SITE_ORIGIN="https://danjohnson179-dotcom.github.io";
const AIRLABS_URL="https://airlabs.co/api/v9/flights";
const CACHE_SECONDS=90;
const UPSTREAM_TIMEOUT_MS=12000;
const FIELDS="hex,reg_number,lat,lng,alt,dir,speed,v_speed,squawk,airline_icao,airline_iata,aircraft_icao,flight_icao,flight_iata,flight_number,dep_icao,dep_iata,arr_icao,arr_iata,updated,status";

export default {
  async fetch(request,env,ctx){
    return handleRequest(request,env,ctx);
  }
};

async function handleRequest(request,env,ctx){
  const origin=request.headers.get("Origin");
  const cors=corsHeaders(origin);
  if(request.method==="OPTIONS"){
    return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"Origin not allowed"},403,{});
  }
  if(origin&&!cors)return json({ok:false,error:"Origin not allowed"},403,{});
  if(request.method!=="GET")return json({ok:false,error:"Method not allowed"},405,cors,{Allow:"GET, OPTIONS"});

  const url=new URL(request.url);
  if(url.pathname==="/"||url.pathname==="/health"){
    return json({
      ok:true,
      service:"SKYHUNT optional detailed-aircraft bridge",
      host:"Cloudflare",
      provider:"AirLabs",
      configured:Boolean(env.AIRLABS_API_KEY),
      cacheSeconds:CACHE_SECONDS,
      note:"The embedded adsb.lol Radar and Nearby maps work without this bridge.",
      time:new Date().toISOString()
    },200,cors,{"Cache-Control":"no-store"});
  }

  let query;
  try{query=parseRoute(url)}catch(error){return json({ok:false,error:error.message},400,cors)}
  if(!query)return json({ok:false,error:"Not found",routes:["/health","/point?lat=&lon=&radius=","/hex?hex="]},404,cors);
  if(!env.AIRLABS_API_KEY){
    return json({ok:false,error:"AIRLABS_API_KEY is not configured",_skyhunt:{ok:false,provider:"AirLabs",configured:false,mapFallback:"adsb.lol embedded radar remains available"}},503,cors);
  }

  const cacheKey=new Request(canonicalCacheUrl(url,query),{method:"GET"});
  const cached=await caches.default.match(cacheKey);
  if(cached)return withHeaders(cached,cors,{"X-SKYHUNT-Cache":"HIT"});

  const started=Date.now();
  const upstreamUrl=buildAirLabsUrl(query,env.AIRLABS_API_KEY);
  let upstream;
  try{
    upstream=await fetchWithTimeout(upstreamUrl);
  }catch(error){
    const timedOut=error?.name==="AbortError"||/abort|timeout/i.test(String(error?.message||error));
    return json({ok:false,error:timedOut?"AirLabs request timed out":"AirLabs network request failed",_skyhunt:{ok:false,provider:"AirLabs",configured:true,durationMs:Date.now()-started,diagnostic:safeError(error)}},timedOut?504:502,cors);
  }

  const body=await upstream.text();
  let payload;
  try{payload=JSON.parse(body)}catch{
    return json({ok:false,error:`AirLabs returned invalid JSON (HTTP ${upstream.status})`,_skyhunt:{ok:false,provider:"AirLabs",configured:true,upstreamStatus:upstream.status,durationMs:Date.now()-started,contentType:upstream.headers.get("content-type")||null}},502,cors);
  }

  const upstreamError=extractAirLabsError(payload);
  if(!upstream.ok||upstreamError){
    const status=upstream.status===429||/limit|quota|allowance/i.test(upstreamError)?429:502;
    return json({ok:false,error:upstreamError||`AirLabs returned HTTP ${upstream.status}`,_skyhunt:{ok:false,provider:"AirLabs",configured:true,upstreamStatus:upstream.status,durationMs:Date.now()-started}},status,cors);
  }

  let aircraft=aircraftRows(payload).map(normalizeAircraft).filter(isPositionedAircraft);
  if(query.type==="point")aircraft=aircraft.filter(item=>distanceNm(query.lat,query.lon,item.lat,item.lon)<=query.radius+0.5);
  if(query.type==="hex")aircraft=aircraft.filter(item=>item.hex===query.hex);

  const result={
    ac:aircraft,
    now:Math.floor(Date.now()/1000),
    total:aircraft.length,
    _skyhunt:{ok:true,provider:"AirLabs",configured:true,query:publicQuery(query),aircraft:aircraft.length,durationMs:Date.now()-started,cacheSeconds:CACHE_SECONDS}
  };
  const stored=json(result,200,{},cacheableHeaders(upstream.headers));
  ctx.waitUntil(caches.default.put(cacheKey,stored.clone()));
  return withHeaders(stored,cors,{"X-SKYHUNT-Cache":"MISS"});
}

function parseRoute(url){
  if(url.pathname==="/point"){
    const lat=numberParam(url,"lat",-90,90),lon=numberParam(url,"lon",-180,180),radius=numberParam(url,"radius",1,250);
    return {type:"point",lat,lon,radius:Math.round(radius)};
  }
  if(url.pathname==="/hex"){
    const hex=(url.searchParams.get("hex")||"").trim().toLowerCase();
    if(!/^[0-9a-f]{6}$/.test(hex))throw new Error("hex must be exactly six hexadecimal characters");
    return {type:"hex",hex};
  }
  return null;
}

function numberParam(url,name,min,max){
  const raw=url.searchParams.get(name);
  if(raw===null||raw.trim()==="")throw new Error(`${name} is required`);
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

function buildAirLabsUrl(query,key){
  const url=new URL(AIRLABS_URL);
  url.searchParams.set("api_key",key);
  url.searchParams.set("_fields",FIELDS);
  if(query.type==="hex")url.searchParams.set("hex",query.hex);
  if(query.type==="point"){
    const latDelta=query.radius/60;
    const cosine=Math.max(0.05,Math.abs(Math.cos(query.lat*Math.PI/180)));
    const lonDelta=Math.min(180,query.radius/(60*cosine));
    const south=Math.max(-90,query.lat-latDelta),north=Math.min(90,query.lat+latDelta);
    const west=Math.max(-180,query.lon-lonDelta),east=Math.min(180,query.lon+lonDelta);
    url.searchParams.set("bbox",[south,west,north,east].map(value=>value.toFixed(5)).join(","));
  }
  return url;
}

async function fetchWithTimeout(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),UPSTREAM_TIMEOUT_MS);
  try{return await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}})}finally{clearTimeout(timer)}
}

function aircraftRows(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.response))return payload.response;
  if(Array.isArray(payload?.response?.flights))return payload.response.flights;
  if(Array.isArray(payload?.flights))return payload.flights;
  return [];
}

function normalizeAircraft(row){
  const updated=Number(row?.updated);
  const flight=String(row?.flight_icao||row?.flight_iata||row?.flight_number||"").trim();
  const dep=row?.dep_iata||row?.dep_icao,arr=row?.arr_iata||row?.arr_icao;
  return {
    hex:String(row?.hex||"").trim().toLowerCase(),
    flight,
    r:row?.reg_number||null,
    t:row?.aircraft_icao||null,
    desc:dep&&arr?`${dep} → ${arr}`:null,
    lat:finiteOrNull(row?.lat),
    lon:finiteOrNull(row?.lng),
    alt_baro:finiteOrNull(row?.alt)===null?null:Math.round(Number(row.alt)*3.28084),
    gs:finiteOrNull(row?.speed)===null?null:Math.round(Number(row.speed)*0.539957),
    track:finiteOrNull(row?.dir),
    baro_rate:finiteOrNull(row?.v_speed)===null?null:Math.round(Number(row.v_speed)*54.6807),
    squawk:row?.squawk||null,
    seen:Number.isFinite(updated)?Math.max(0,Math.floor(Date.now()/1000)-updated):null,
    _airlabs:{flight_iata:row?.flight_iata||null,flight_icao:row?.flight_icao||null,status:row?.status||null}
  };
}

function finiteOrNull(value){const number=Number(value);return Number.isFinite(number)?number:null}
function isPositionedAircraft(item){return Number.isFinite(item.lat)&&Number.isFinite(item.lon)&&Boolean(item.hex||item.flight||item.r)}
function distanceNm(lat1,lon1,lat2,lon2){
  const R=3440.065,r=Math.PI/180,dLat=(lat2-lat1)*r,dLon=(lon2-lon1)*r;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function extractAirLabsError(payload){
  const error=payload?.error;
  if(!error)return "";
  if(typeof error==="string")return error.slice(0,240);
  return String(error?.message||error?.code||"AirLabs returned an error").slice(0,240);
}
function safeError(error){return String(error?.message||error||"Unknown upstream error").slice(0,240)}
function publicQuery(query){return query.type==="point"?{type:"point",lat:query.lat,lon:query.lon,radius:query.radius}:{type:"hex",hex:query.hex}}
function canonicalCacheUrl(url,query){
  const key=new URL(url.origin+url.pathname);
  Object.entries(publicQuery(query)).filter(([name])=>name!=="type").sort(([a],[b])=>a.localeCompare(b)).forEach(([name,value])=>key.searchParams.set(name,String(value)));
  return key.toString();
}
function cacheableHeaders(upstreamHeaders){
  const headers={"Cache-Control":`public, max-age=${CACHE_SECONDS}`};
  ["x-ratelimit-limit","x-ratelimit-remaining","x-ratelimit-reset"].forEach(name=>{
    const value=upstreamHeaders.get(name);if(value)headers[`X-Upstream-${name.slice(2)}`]=value;
  });
  return headers;
}
function isLocalOrigin(origin){
  try{const url=new URL(origin);return (url.hostname==="localhost"||url.hostname==="127.0.0.1")&&["http:","https:"].includes(url.protocol)}catch{return false}
}
function corsHeaders(origin){
  if(origin&&origin!==SITE_ORIGIN&&!isLocalOrigin(origin))return null;
  const headers={"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Accept, Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"};
  if(origin)headers["Access-Control-Allow-Origin"]=origin;
  return headers;
}
function json(data,status=200,cors={},extra={}){
  return new Response(JSON.stringify(data,null,2),{status,headers:{"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff",...cors,...extra}});
}
function withHeaders(response,...groups){
  const headers=new Headers(response.headers);
  groups.forEach(group=>Object.entries(group||{}).forEach(([name,value])=>headers.set(name,value)));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
