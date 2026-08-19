import { corsHeaders, hexResponse, json } from "../lib/opensky.js";

export function OPTIONS(request){
  const cors=corsHeaders(request.headers.get("Origin"));
  return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"Origin not allowed"},403);
}

export async function GET(request){
  const origin=request.headers.get("Origin"),cors=corsHeaders(origin);
  if(!cors&&origin)return json({ok:false,error:"Origin not allowed"},403);
  const hex=String(new URL(request.url).searchParams.get("hex")||"").trim().toLowerCase();
  if(!/^[0-9a-f]{6}$/.test(hex))return json({ok:false,error:"hex must be exactly 6 hexadecimal characters"},400,cors,{"Cache-Control":"no-store"});
  return hexResponse(hex,cors);
}
