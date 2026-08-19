const SITE_ORIGIN="https://danjohnson179-dotcom.github.io";
const TOKEN_URL="https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const STATES_URL="https://opensky-network.org/api/states/all";
const CACHE_SECONDS=10;
let tokenState={value:"",expiresAt:0};
let tokenPromise=null;

export async function pointResponse(query,cors){
  return aircraftResponse(query,cors);
}

export async function hexResponse(hex,cors){
  return aircraftResponse({type:"hex",hex},cors);
}

async function aircraftResponse(query,cors){
  const started=Date.now();
  if(!process.env.OPENSKY_CLIENT_ID||!process.env.OPENSKY_CLIENT_SECRET){
    return json({ok:false,error:"OpenSky credentials are not configured"},503,cors,{"Cache-Control":"no-store"});
  }
  try{
    let token=await getAccessToken(),upstream=await fetchStates(query,token);
    if(upstream.status===401){tokenState={value:"",expiresAt:0};token=await getAccessToken();upstream=await fetchStates(query,token)}
    const text=await upstream.text();
    if(!upstream.ok){
      const retry=upstream.headers.get("X-Rate-Limit-Retry-After-Seconds")||upstream.headers.get("Retry-After");
      throw new Error(`OpenSky aircraft service returned HTTP ${upstream.status}${retry?` (retry after ${retry} seconds)`:""}`);
    }
    let payload;
    try{payload=JSON.parse(text)}catch{throw new Error("OpenSky aircraft service returned invalid JSON")}
    let ac=normalizeStates(payload.states,payload.time);
    if(query.type!=="hex")ac=ac.filter(a=>distanceNm(query.lat,query.lon,a.lat,a.lon)<=query.radius);
    return json({
      ac,total:ac.length,now:Number(payload.time||0)*1000,
      _skyhunt:{ok:true,provider:"OpenSky Network",authenticated:true,host:"Vercel",fallbackUsed:false,cachedForSeconds:CACHE_SECONDS,durationMs:Date.now()-started}
    },200,cors,{"Cache-Control":"public, max-age=0","Vercel-CDN-Cache-Control":`max-age=${CACHE_SECONDS}`,"X-SKYHUNT-Provider":"OpenSky Network"});
  }catch(error){
    return json({ok:false,error:String(error?.message||error),_skyhunt:{ok:false,provider:"OpenSky Network",authenticated:false,host:"Vercel",durationMs:Date.now()-started}},502,cors,{"Cache-Control":"no-store"});
  }
}

async function getAccessToken(){
  if(tokenState.value&&Date.now()<tokenState.expiresAt)return tokenState.value;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const body=new URLSearchParams({
        grant_type:"client_credentials",
        client_id:process.env.OPENSKY_CLIENT_ID,
        client_secret:process.env.OPENSKY_CLIENT_SECRET
      });
      const response=await fetch(TOKEN_URL,{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body});
      const text=await response.text();
      if(!response.ok)throw new Error(`OpenSky authentication service returned HTTP ${response.status}`);
      let data;
      try{data=JSON.parse(text)}catch{throw new Error("OpenSky authentication service returned invalid JSON")}
      if(!data.access_token)throw new Error("OpenSky authentication returned no access token");
      tokenState={value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||1800)-60)*1000};
      return tokenState.value;
    }catch(error){
      if(error?.name==="AbortError")throw new Error("OpenSky authentication request timed out after 20 seconds");
      throw error;
    }finally{clearTimeout(timer)}
  })();
  try{return await tokenPromise}finally{tokenPromise=null}
}

async function fetchStates(query,token){
  const url=new URL(STATES_URL);
  if(query.type==="hex")url.searchParams.append("icao24",query.hex);
  else{
    const latDelta=query.radius/60;
    const lonDelta=Math.min(180,query.radius/(60*Math.max(.05,Math.cos(query.lat*Math.PI/180))));
    url.searchParams.set("lamin",String(Math.max(-90,query.lat-latDelta)));
    url.searchParams.set("lomin",String(Math.max(-180,query.lon-lonDelta)));
    url.searchParams.set("lamax",String(Math.min(90,query.lat+latDelta)));
    url.searchParams.set("lomax",String(Math.min(180,query.lon+lonDelta)));
    url.searchParams.set("extended","1");
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{return await fetch(url,{signal:controller.signal,headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}})}
  catch(error){if(error?.name==="AbortError")throw new Error("OpenSky aircraft-data request timed out after 30 seconds");throw error}
  finally{clearTimeout(timer)}
}

function normalizeStates(states,time){
  if(!Array.isArray(states))return[];
  const now=Number(time||Date.now()/1000);
  return states.map(s=>({
    hex:String(s?.[0]||"").toLowerCase(),flight:String(s?.[1]||"").trim(),r:"",t:"",desc:String(s?.[2]||""),
    lat:numberOrNull(s?.[6]),lon:numberOrNull(s?.[5]),alt_baro:s?.[8]?"ground":metresToFeet(s?.[7]),alt_geom:metresToFeet(s?.[13]),
    gs:metresPerSecondToKnots(s?.[9]),track:numberOrNull(s?.[10]),baro_rate:metresPerSecondToFeetPerMinute(s?.[11]),
    squawk:s?.[14]||null,category:s?.[17]??null,seen:Number.isFinite(Number(s?.[4]))?Math.max(0,now-Number(s[4])):null,
    _opensky:{originCountry:s?.[2]||null,onGround:!!s?.[8],positionSource:s?.[16]??null}
  })).filter(a=>a.hex&&Number.isFinite(a.lat)&&Number.isFinite(a.lon));
}

function numberOrNull(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function metresToFeet(v){const n=numberOrNull(v);return n===null?null:Math.round(n*3.28084)}
function metresPerSecondToKnots(v){const n=numberOrNull(v);return n===null?null:Math.round(n*1.943844)}
function metresPerSecondToFeetPerMinute(v){const n=numberOrNull(v);return n===null?null:Math.round(n*196.8504)}
function distanceNm(a,b,c,d){const r=3440.065,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p;const h=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 2*r*Math.asin(Math.sqrt(h))}

export function corsHeaders(origin){
  if(!origin)return{};
  let allowed=origin===SITE_ORIGIN;
  try{const u=new URL(origin);allowed||=(u.hostname==="localhost"||u.hostname==="127.0.0.1")&&["http:","https:"].includes(u.protocol)}catch{}
  return allowed?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Accept, Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"}:null;
}

export function json(value,status=200,...groups){
  const headers=new Headers({"Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff"});
  groups.forEach(g=>Object.entries(g||{}).forEach(([k,v])=>headers.set(k,v)));
  return new Response(JSON.stringify(value,null,2),{status,headers});
}
