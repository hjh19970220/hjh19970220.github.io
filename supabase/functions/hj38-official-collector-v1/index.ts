import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.95.0";

const ENDPOINTS=[
  "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c&poolCode=had,hhad",
  "https://webapi.sporttery.cn/gateway/jc/football/getMatchCalculatorV1.qry?channel=c&poolCode=had,hhad",
  "https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=0005&poolCode=HAD,HHAD",
];
const headers={"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1","referer":"https://m.sporttery.cn/mjc/jsq/zqspf/","origin":"https://m.sporttery.cn","accept":"application/json, text/javascript, */*; q=0.01","x-requested-with":"XMLHttpRequest","cache-control":"no-cache"};
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{db:{schema:"ninety_core"},auth:{persistSession:false,autoRefreshToken:false}});
const bjt=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const txt=(v:any)=>v==null?"":String(v).trim(), num=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const normDate=(v:any)=>{const s=txt(v);if(/^\d{8}$/.test(s))return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;if(/^\d{6}$/.test(s))return `20${s.slice(0,2)}-${s.slice(2,4)}-${s.slice(4,6)}`;return s.replaceAll("/","-")};
const weekday=(d:string)=>["周日","周一","周二","周三","周四","周五","周六"][new Date(d+"T12:00:00+08:00").getUTCDay()];
async function sha(v:any){const x=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v)));return [...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,"0")).join("")}
async function official(){const attempts:any[]=[];for(const url of ENDPOINTS){try{const r=await fetch(url,{headers,redirect:"follow",signal:AbortSignal.timeout(12000)}),body=await r.text();attempts.push({url,status:r.status});if(!r.ok)continue;const j=JSON.parse(body);if(Array.isArray(j?.value?.matchInfoList))return {url,j,attempts}}catch(e:any){attempts.push({url,error:String(e?.message||e)})}}throw Error("official fetch failed "+JSON.stringify(attempts))}
function rows(payload:any,date:string){const out:any[]=[];for(const g of payload?.value?.matchInfoList||[]){const gd=normDate(g?.businessDate||g?.matchNumDate);for(const x of g?.subMatchList||[]){const d=normDate(x?.businessDate||g?.businessDate||g?.matchNumDate);if(d===date||gd===date)out.push(x)}}return out}
function market(x:any,key:"had"|"hhad"){const m=x?.[key]||x?.[key.toUpperCase()]||{},h=num(m.h??m.H),d=num(m.d??m.D),a=num(m.a??m.A);return h&&d&&a?{h,d,a,line:key==="hhad"?num(m.goalLineValue??m.goalLine):null,raw:m}:null}

Deno.serve(async(req)=>{const now=new Date().toISOString(),date=new URL(req.url).searchParams.get("date")||bjt();try{
  const f=await official(),items=rows(f.j,date);let offerings=0,markets=0;
  for(const x of items){const no=Number(txt(x?.matchNumStr).match(/(\d{3})$/)?.[1]);if(!no)continue;const home=txt(x?.homeTeamAbbName||x?.homeTeamAllName),away=txt(x?.awayTeamAbbName||x?.awayTeamAllName);if(!home||!away)continue;
    const rawDate=normDate(x?.matchDate)||date,time=txt(x?.matchTime)||"00:00",ko=`${rawDate} ${time.length===5?time+":00":time}`;
    const hhad=market(x,"hhad"),matchCode=date.replaceAll("-","")+"-"+String(no).padStart(3,"0");
    const oq=await db.from("jc_offerings_2026").upsert({offer_date:date,match_code:matchCode,weekday_text:weekday(date),match_no:no,league:txt(x?.leagueAbbName||x?.leagueAllName)||"未确认",home_team:home,away_team:away,kickoff_local:ko,handicap_line:hhad?.line,source_url:f.url,source_quality:"A-official-sporttery",is_world_cup:/世界杯/.test(txt(x?.leagueAbbName||x?.leagueAllName)),imported_at:now},{onConflict:"offer_date,match_code"}).select("id").single();if(oq.error)throw oq.error;offerings++;
    for(const key of ["had","hhad"] as const){const m=market(x,key);if(!m)continue;const raw={matchId:txt(x?.matchId),matchNumStr:txt(x?.matchNumStr),home,away,matchDate:x?.matchDate,matchTime:x?.matchTime,market:m.raw,lastUpdateTime:f.j?.value?.lastUpdateTime},source_hash=await sha(raw);
      const q=await db.from("hao_jc_sp_mirror_raw_v01").upsert({offering_id:oq.data.id,pool_date:date,match_no:String(no).padStart(3,"0"),source_code:"sporttery_official",source_match_id:txt(x?.matchId)||txt(x?.matchNumStr),source_match_url:f.url,market_type:key.toUpperCase(),handicap_line:m.line,home_sp:m.h,draw_sp:m.d,away_sp:m.a,snapshot_type:"current",captured_at:now,fetched_at:now,source_kind:"official_sporttery_api",source_hash,parse_status:"verified_mirror",raw_payload:raw},{onConflict:"offering_id,market_type,source_hash",ignoreDuplicates:true});if(q.error)throw q.error;markets++}
  }
  await db.from("hao_source_health_v01").upsert({source_code:"sporttery_official",source_role:"official_pool_and_sp",status:offerings?"ok":"partial",last_attempt_at:now,last_success_at:offerings?now:null,latest_pool_date:date,expected_matches:items.length,mapped_matches:offerings,captured_matches:offerings,verified_matches:offerings,consecutive_failures:offerings?0:1,last_error:offerings?null:"official pool empty",notes:"Singapore direct official Sporttery HAD/HHAD; no legacy dependency",updated_at:now},{onConflict:"source_code"});
  return Response.json({ok:offerings>0,date,official_matches:items.length,offerings,market_rows:markets,source:f.url,attempts:f.attempts});
}catch(e:any){await db.from("hao_source_health_v01").upsert({source_code:"sporttery_official",source_role:"official_pool_and_sp",status:"error",last_attempt_at:now,latest_pool_date:date,consecutive_failures:1,last_error:String(e?.message||e).slice(0,1000),updated_at:now},{onConflict:"source_code"});return Response.json({ok:false,date,error:String(e?.message||e)},{status:500})}});
