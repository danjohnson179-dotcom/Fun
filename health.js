import { corsHeaders, json } from "../lib/opensky.js";

export function OPTIONS(request){
  const cors=corsHeaders(request.headers.get("Origin"));
  return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"Origin not allowed"},403);
}

export function GET(request){
  const cors=corsHeaders(request.headers.get("Origin"));
  if(!cors&&request.headers.get("Origin"))return json({ok:false,error:"Origin not allowed"},403);
  return json({
    ok:true,
    service:"SKYHUNT aircraft bridge",
    host:"Vercel",
    primary:"OpenSky Network (authenticated)",
    configured:!!(process.env.OPENSKY_CLIENT_ID&&process.env.OPENSKY_CLIENT_SECRET),
    cacheSeconds:10,
    time:new Date().toISOString()
  },200,cors,{"Cache-Control":"no-store"});
}
