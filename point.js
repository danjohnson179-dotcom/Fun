import { corsHeaders, json, pointResponse } from "../lib/opensky.js";

export function OPTIONS(request){
  const cors=corsHeaders(request.headers.get("Origin"));
  return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"Origin not allowed"},403);
}

export async function GET(request){
  const origin=request.headers.get("Origin"),cors=corsHeaders(origin);
  if(!cors&&origin)return json({ok:false,error:"Origin not allowed"},403);
  const url=new URL(request.url);
  try{
    const lat=strictNumber(url.searchParams.get("lat"),"lat",-90,90);
    const lon=strictNumber(url.searchParams.get("lon"),"lon",-180,180);
    const radius=Math.round(strictNumber(url.searchParams.get("radius")??"100","radius",1,250));
    return await pointResponse({lat,lon,radius},cors);
  }catch(error){return json({ok:false,error:String(error?.message||error)},400,cors,{"Cache-Control":"no-store"})}
}

function strictNumber(raw,name,min,max){
  if(raw===null||raw.trim()==="")throw new Error(`${name} is required`);
  const value=Number(raw);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}
