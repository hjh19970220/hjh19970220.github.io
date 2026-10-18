import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "access-control-allow-origin":"https://hjh19970220.github.io",
  "access-control-allow-headers":"authorization,apikey,content-type,x-client-info",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "cache-control":"no-store",
};
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  return Response.json({ok:true,service:"soren-client-diag-v1",region:"ap-southeast-1",
    legacyRuntimeDependency:false,now:new Date().toISOString()},{headers:cors});
});
