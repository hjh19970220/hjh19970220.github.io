import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const root=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const db=root.schema("ninety_core"), origin="https://hjh19970220.github.io";
const cors={"access-control-allow-origin":origin,"access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"GET,POST,OPTIONS","vary":"Origin"};
const reply=(x:any,s=200)=>Response.json(x,{status:s,headers:{...cors,"cache-control":"no-store"}});
const categories=new Set(["功能建议","网站问题","会员咨询","其他反馈"]),statuses=new Set(["replied","resolved"]);
Deno.serve(async(req)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});if(!["GET","POST"].includes(req.method))return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];if(!token)return reply({ok:false,error:"LOGIN_REQUIRED"},401);
  const auth=await root.auth.getUser(token);if(auth.error||!auth.data.user)return reply({ok:false,error:"LOGIN_REQUIRED"},401);const uid=auth.data.user.id,u=new URL(req.url),action=u.searchParams.get("action"),scope=u.searchParams.get("scope")||"mine";
  const aq=await db.from("soren_admin_members_v1").select("user_id").eq("user_id",uid).maybeSingle(),admin=!!aq.data;
  if(req.method==="GET"){if(scope==="admin"&&!admin)return reply({ok:false,error:"FORBIDDEN"},403);let q=db.from("soren_customer_feedback_v1").select("id,user_id,category,content,status,admin_reply,created_at,replied_at,updated_at",{count:"exact"}).order("created_at",{ascending:false}).limit(50);if(scope!=="admin")q=q.eq("user_id",uid);const filter=u.searchParams.get("filter")||"all";if(filter!=="all")q=q.eq("status",filter);const x=await q;if(x.error)return reply({ok:false,error:"SERVICE_UNAVAILABLE"},503);return reply({ok:true,items:x.data||[],count:x.count||0})}
  let body:any;try{body=await req.json()}catch{return reply({ok:false,error:"INVALID_BODY"},400)}
  if(action==="create"){const category=String(body?.category||""),content=String(body?.content||"").normalize("NFC").trim();if(!categories.has(category)||!content||Array.from(content).length>500)return reply({ok:false,error:"INVALID_FEEDBACK"},400);const x=await db.from("soren_customer_feedback_v1").insert({user_id:uid,category,content}).select("id,category,content,status,admin_reply,created_at,replied_at,updated_at").single();if(x.error)return reply({ok:false,error:"SUBMIT_FAILED"},503);return reply({ok:true,item:x.data},201)}
  if(action==="reply"){if(!admin)return reply({ok:false,error:"FORBIDDEN"},403);const id=Number(body?.id),content=String(body?.reply||"").normalize("NFC").trim(),status=String(body?.status||"");if(!Number.isSafeInteger(id)||!content||content.length>1000||!statuses.has(status))return reply({ok:false,error:"INVALID_REPLY"},400);const now=new Date().toISOString(),x=await db.from("soren_customer_feedback_v1").update({admin_reply:content,status,replied_by:uid,replied_at:now,updated_at:now}).eq("id",id).select().maybeSingle();if(x.error)return reply({ok:false,error:"REPLY_FAILED"},503);return x.data?reply({ok:true,item:x.data}):reply({ok:false,error:"NOT_FOUND"},404)}
  return reply({ok:false,error:"INVALID_ACTION"},400);
});
