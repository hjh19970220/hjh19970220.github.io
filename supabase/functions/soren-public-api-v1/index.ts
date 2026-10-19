import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

/* Singapore-only, truthful contract adapter for the unchanged production frontend.
   Do NOT send data to either legacy Supabase project.
   Do NOT promote provisional outputs to formal pregame forecasts. */
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {auth:{persistSession:false,autoRefreshToken:false}}
);
const headers={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info, x-soren-device",
  "access-control-allow-methods":"GET, OPTIONS",
  "cache-control":"no-store",
};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const currentBjt=()=>new Intl.DateTimeFormat("en-CA",{
  timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z"));
const label=(v:unknown)=>{
  if(v==="平局"||v==="平")return "平";
  if(v==="主胜"||v==="客胜")return v;
  return null;
};
const pct=(v:unknown)=>{
  const x=Number(v);return v!==null&&v!==undefined&&Number.isFinite(x)&&x>=0&&x<=1?+(x*100).toFixed(2):null;
};
const out=(m:any,key:string)=>m?.outputs?.[key]?.payload??null;
const formal=(m:any,key:string)=>{
  const x=m?.outputs?.[key];const kickoff=Date.parse(String(m?.kickoff_at||""));
  const produced=Date.parse(String(x?.produced_at||""));
  return x&&["formal","verified","published"].includes(String(x.quality).toLowerCase())
    &&x.payload?.shadow!==true
    &&Number.isFinite(kickoff)&&Number.isFinite(produced)&&produced<kickoff;
};
function adaptRow(m:any,date:string){
  const f=out(m,"ft"), h=out(m,"handicap"), daily=out(m,"daily_selection");
  const risk=out(m,"upset_warning"), score=out(m,"score_top3");
  const goals=out(m,"total_goals"), htft=out(m,"htft_top3");
  const fRank=Array.isArray(f?.top3)?f.top3:[];
  const hRank=Array.isArray(h?.top3)?h.top3:[];
  const ftReady=Boolean(formal(m,"ft")&&f?.status==="READY"&&fRank.length>=2);
  const hadReady=Boolean(formal(m,"handicap")&&h?.status==="READY"&&hRank.length>=2);
  const hasVerifiedPrematch=["ft","handicap","daily_selection","upset_warning","score_top3","htft_top3","total_goals"].some(k=>formal(m,k));
  const vr=m?.result?.verified===true;
  const rh=vr?Number(m.result?.home??m.result?.home_score):null;
  const ra=vr?Number(m.result?.away??m.result?.away_score):null;
  const scored=vr&&Number.isInteger(rh)&&Number.isInteger(ra)&&rh>=0&&ra>=0;
  const actual=scored?(rh>ra?"主胜":rh===ra?"平":"客胜"):null;
  const warn=Boolean(formal(m,"upset_warning")&&risk?.triggered===true&&risk?.status==="TRIGGERED");
  const selected=Boolean(formal(m,"daily_selection")&&daily?.status==="SELECTED"&&!warn&&!m.upset_locked);
  const dates=Object.values(m?.outputs||{}).map((x:any)=>Date.parse(String(x?.produced_at||""))).filter(Number.isFinite);
  const frozenAt=dates.length?new Date(Math.max(...dates)).toISOString():null;
  return {
    date,no:String(m.match_no||"").padStart(3,"0"),league:m.league??"",
    home:m.home_team??"",away:m.away_team??"",kickoff:m.kickoff_at??null,
    matchStatus:String(m.status||"").toLowerCase()==="postponed"?"POSTPONED":String(m.status||"").toUpperCase(),
    resultVerified:scored,result:actual,resultHome:scored?rh:null,resultAway:scored?ra:null,
    resultScore:scored?rh+":"+ra:null,
    pregameVerified:false,
    saleFreezeStatus:"SHADOW_PREMATCH_NOT_FORMAL",
    predictionState:hasVerifiedPrematch?"SHADOW_PREMATCH":"SHADOW_NOT_FORMAL",
    frozenAt:hasVerifiedPrematch?frozenAt:null,
    analysisPending:!hasVerifiedPrematch,
    ftTop1:ftReady?label(fRank[0]?.direction):null,
    second:ftReady?label(fRank[1]?.direction):null,
    homeProbability:ftReady?pct(f?.probabilities?.home):null,
    drawProbability:ftReady?pct(f?.probabilities?.draw):null,
    awayProbability:ftReady?pct(f?.probabilities?.away):null,
    confidence:ftReady?pct(fRank[0]?.probability):null,
    officialHandicap:hadReady?(h?.handicap_line??null):null,
    handicapTop1:hadReady?hRank[0]?.direction:null,
    handicapSecond:hadReady?hRank[1]?.direction:null,
    handicapProbability:hadReady?pct(hRank[0]?.probability):null,
    handicapSecondProbability:hadReady?pct(hRank[1]?.probability):null,
    handicapSourceLabel:hadReady?"新加坡影子概率（未正式冻结）":null,
    dailySelectionTier:selected?(daily?.tier==="稳健"?"CORE":"SUPPLEMENT"):null,
    dailySelectionRiskLocked:warn||m.upset_locked===true,
    upsetWarning:warn?{
      publish:true,publicationEligible:true,riskDisplayEligible:true,riskLevel:"影子已核验",
      direction:risk?.direction??null,originalTop1:label(fRank[0]?.direction),
      riskBasis:Array.isArray(risk?.evidence)?risk.evidence:[],
      prematchAt:m?.outputs?.upset_warning?.produced_at??null
    }:null,
    // Three score candidates are not a published Top4. Do not pad or mislabel.
    scoreTop4:null,htftTop4:null,goalPrediction:null,dynamicScoreTop4:null,
    dynamicHTFT:null,dynamicGoalPrediction:null,
    shadowAnalysis:null
  };
}
function shadowSupport(m:any){
  const ft=out(m,"ft"),handicap=out(m,"handicap"),score=out(m,"score_top3");
  const htft=out(m,"htft_top3"),goals=out(m,"total_goals"),daily=out(m,"daily_selection");
  const ftRank=Array.isArray(ft?.top3)?ft.top3:[],handicapRank=Array.isArray(handicap?.top3)?handicap.top3:[];
  const produced=(key:string)=>m?.outputs?.[key]?.produced_at??null;
  const pending=(payload:any,key:string)=>payload?.status==="READY"&&Array.isArray(payload?.top3)&&payload.top3.length===3?{
    picks:payload.top3,publishedAt:produced(key),settlementStatus:"PENDING",top1Status:"PENDING"
  }:null;
  return {
    homeProbability:ft?.status==="READY"?pct(ft?.probabilities?.home):null,
    drawProbability:ft?.status==="READY"?pct(ft?.probabilities?.draw):null,
    awayProbability:ft?.status==="READY"?pct(ft?.probabilities?.away):null,
    confidence:ft?.status==="READY"?pct(ftRank[0]?.probability):null,
    shadowHandicap:handicap?.status==="READY"&&handicapRank.length>=2?{
      line:handicap?.handicap_line??null,top1:handicapRank[0]?.direction??null,second:handicapRank[1]?.direction??null,
      top1Probability:pct(handicapRank[0]?.probability),secondProbability:pct(handicapRank[1]?.probability)
    }:null,
    shadowScoreTop3:pending(score,"score_top3"),
    shadowHTFTTop3:pending(htft,"htft_top3"),
    shadowGoalsTop3:pending(goals,"total_goals"),
    shadowDailySelection:daily?.status==="SELECTED"?{
      selected:true,sourceKind:"SG_PREMATCH_SHADOW_DAILY",formalEligible:false,publishedAt:produced("daily_selection"),
      direction:daily?.direction??null,probability:daily?.probability??null,ftStatus:"PENDING",
      handicapDirection:null,handicapProbability:null,handicapLine:null
    }:null,
    dailySelectionTier:daily?.status==="SELECTED"?(daily?.tier==="稳健"?"CORE":"SUPPLEMENT"):null
  };
}
function adaptFormalPrediction(p:any,date:string){
  const scored=p.result_verified===true&&Number.isInteger(p.result_home)&&Number.isInteger(p.result_away);
  const actual=scored?(p.result_home>p.result_away?"主胜":p.result_home===p.result_away?"平":"客胜"):null;
  const warning=p?.source_status?.upset_warning;
  const warningPublished=warning?.publish===true;
  const source=p?.source_status||{};
  const drawPct=pct(source?.p_final?.draw??source?.p_raw?.draw);
  const highDrawRisk=drawPct!==null&&drawPct>=29&&Number(p.official_handicap)===-1;
  const marketDirectionAnomaly=source?.market_direction_conflict===true;
  const formalEligible=source?.final_selection_eligible===true;
  const productionRisk=warningPublished||highDrawRisk||marketDirectionAnomaly;
  const homeProbability=pct(source?.p_final?.home??source?.p_raw?.home);
  const drawProbability=pct(source?.p_final?.draw??source?.p_raw?.draw);
  const awayProbability=pct(source?.p_final?.away??source?.p_raw?.away);
  const confidence=pct(source?.top1_prob??Math.max(
    Number(source?.p_final?.home??source?.p_raw?.home??0),
    Number(source?.p_final?.draw??source?.p_raw?.draw??0),
    Number(source?.p_final?.away??source?.p_raw?.away??0),
  ));
  return {
    date,no:String(p.match_no||"").padStart(3,"0"),league:p.league??"",home:p.home_team??"",away:p.away_team??"",
    kickoff:p.kickoff_bjt??null,matchStatus:"SCHEDULED",resultVerified:scored,result:actual,
    resultHome:scored?p.result_home:null,resultAway:scored?p.result_away:null,
    resultScore:scored?`${p.result_home}:${p.result_away}`:null,
    pregameVerified:Boolean(p.frozen_at&&Date.parse(p.frozen_at)<Date.parse(p.kickoff_bjt)),
    saleFreezeStatus:p.freeze_status??"PREMATCH_VERIFIED",predictionState:"PREMATCH_VERIFIED",
    frozenAt:p.frozen_at??null,analysisPending:false,ftTop1:label(p.top1),second:label(p.second_pick),
    homeProbability,drawProbability,awayProbability,confidence,
    mode:p.ticket_pick?(String(p.ticket_pick).includes("/")?"DOUBLE":"SINGLE"):
      (p.keep_discard==="KEEP"?"SINGLE":"PASS"),
    tier:formalEligible?"A":"PASS",pass:!formalEligible,
    officialHandicap:p.official_handicap??null,handicapTop1:p.handicap_pick&&p.handicap_pick!=="PASS"?p.handicap_pick:null,
    handicapSecond:null,handicapProbability:null,handicapSecondProbability:null,
    handicapSourceLabel:p.handicap_pick&&p.handicap_pick!=="PASS"?"豪竞3.8赛前冻结":null,
    dailySelectionTier:formalEligible&&!productionRisk?"CORE":null,
    dailySelectionLabel:formalEligible&&!productionRisk?"核心优选":null,
    dailySelectionRiskLocked:productionRisk,
    dailySelectionRiskLockReason:warningPublished?"COLD_WARNING_PUBLISHED":
      highDrawRisk?"HIGH_DRAW_RISK":marketDirectionAnomaly?"MARKET_DIRECTION_ANOMALY_5PCT":null,
    sorenProduction:{ruleVersion:"SOREN-PRODUCTION-v237-COMPAT",selectorVersion:"DAILY-VALUE-v2.0-20261013",
      formalEligible,highDrawRisk,marketDirectionAnomaly,coldWarning:warningPublished,
      threeWayStatus:"PENDING_FUNDS_SOURCE"},
    upsetWarning:warningPublished?{publish:true,publicationEligible:true,riskDisplayEligible:true,
      riskLevel:warning.risk_level??null,direction:warning.warning_direction??null,originalTop1:label(p.top1),
      riskBasis:Array.isArray(warning.risk_basis)?warning.risk_basis:[],prematchAt:p.frozen_at}:null,
    scoreTop4:null,htftTop4:null,goalPrediction:null,dynamicScoreTop4:null,dynamicHTFT:null,
    dynamicGoalPrediction:null,shadowAnalysis:null
  };
}
async function applySorenProductionLocks(rows:any[],date:string){
  const candidates=rows.filter(r=>r.dailySelectionRiskLocked===true).map(r=>({
    pool_date:date,match_no:String(r.no||"").padStart(3,"0"),lock_type:"PRODUCTION_RISK",
    source:"SOREN_PUBLIC_API_V237_COMPAT",source_payload:{
      ruleVersion:"DAILY-COLD-EXCLUSION-v1.1-20260928",
      reason:r.dailySelectionRiskLockReason??"RISK_BLOCKED"
    }
  }));
  if(candidates.length){
    const q=await sb.schema("ninety_core").from("soren_daily_selection_locks_v1")
      .upsert(candidates,{onConflict:"pool_date,match_no,lock_type",ignoreDuplicates:true});
    if(q.error)throw q.error;
  }
  const locks=await sb.schema("ninety_core").from("soren_daily_selection_locks_v1")
    .select("match_no,lock_type,locked_at").eq("pool_date",date);
  if(locks.error)throw locks.error;
  const byNo=new Map((locks.data||[]).map((x:any)=>[String(x.match_no||"").padStart(3,"0"),x]));
  return rows.map(r=>{
    const lock=byNo.get(String(r.no||"").padStart(3,"0"));
    if(!lock)return r;
    return {...r,dailySelectionTier:null,dailySelectionLabel:null,dailySelectionRiskLocked:true,
      dailySelectionRiskLockReason:r.dailySelectionRiskLockReason??String(lock.lock_type),
      dailySelectionRiskLockAt:lock.locked_at??null};
  });
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="GET")return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const url=new URL(req.url),view=url.searchParams.get("view")||"today";
  if(url.pathname.endsWith("/health")||url.searchParams.get("health")==="compat"){
    return reply({ok:true,service:"soren-public-api-v1",formalPipeline:true,shadowFallback:true,
      revision:"singapore_formal_preferred_1.0",legacyRuntimeDependency:false,now:new Date().toISOString()});
  }
  const jwt=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!jwt)return reply({ok:false,error:"LOGIN_REQUIRED"},401);
  const auth=await sb.auth.getUser(jwt);
  if(auth.error||!auth.data.user)return reply({ok:false,error:"LOGIN_REQUIRED"},401);
  const user=auth.data.user;
  const admin=user.app_metadata?.role==="admin"||user.app_metadata?.is_admin===true;
  const mem=await sb.rpc("ninety_membership_status",{p_user_id:user.id});
  if(mem.error)return reply({ok:false,error:"MEMBERSHIP_STATUS_UNAVAILABLE"},503);
  const member=mem.data||{active:false,tier:"free"};
  const vip=Boolean(admin || (member.active && ["vip_monthly","vip_manual","admin"].includes(String(member.tier))));
  const membership={
    active:vip,vipActive:vip,isAdmin:admin,trialStatus:null,
    tier:admin?"admin":member.tier??"free",
    vipUntil:member.ends_at??null,memberUntil:member.ends_at??null,
    shadow:true
  };
  if(view==="membership")return reply({ok:true,membership});
  const date=url.searchParams.get("date")||currentBjt();
  if(!validDate(date))return reply({ok:false,error:"INVALID_DATE"},400);
  try{
    const predQ=await sb.schema("ninety_core").from("hao_console_predictions")
      .select("run_id,pool_date,match_no,league,home_team,away_team,kickoff_bjt,top1,second_pick,confidence_label,official_handicap,handicap_pick,ticket_pick,keep_discard,source_status,source_provenance,frozen_at,freeze_status,result_home,result_away,result_verified,model_version,model_revision_tag,updated_at")
      .eq("pool_date",date).order("updated_at",{ascending:false}).order("match_no");
    if(predQ.error)throw predQ.error;
    const seen=new Set<string>();
    const formalRows=(predQ.data||[]).filter((p:any)=>{const k=String(p.match_no).padStart(3,"0");if(seen.has(k))return false;seen.add(k);return p.frozen_at&&Date.parse(p.frozen_at)<Date.parse(p.kickoff_bjt)&&p.top1;});
    if(formalRows.length){
      const allowed=vip?formalRows:formalRows.slice(0,2);
      const supportQ=await sb.rpc("ninety_customer_payload",{p_date:date});
      const supportMatches=Array.isArray(supportQ.data?.matches)?supportQ.data.matches:[];
      const supportByNo=new Map(supportMatches.map((m:any)=>[String(m.match_no||"").padStart(3,"0"),m]));
      let rows=allowed.map((p:any)=>{
        const base=adaptFormalPrediction(p,date),match=supportByNo.get(String(p.match_no||"").padStart(3,"0"));
        if(!match)return base;
        const support=shadowSupport(match),h=support.shadowHandicap;
        return {...base,
          // A formal Hao 3.8 forecast owns FT probabilities. Shadow module odds
          // are support-only and may fill a genuinely absent legacy field, but
          // must never overwrite p_final from the v87 production executor.
          homeProbability:base.homeProbability??support.homeProbability,
          drawProbability:base.drawProbability??support.drawProbability,
          awayProbability:base.awayProbability??support.awayProbability,
          confidence:base.confidence??support.confidence,
          officialHandicap:base.officialHandicap??h?.line??null,
          handicapTop1:base.handicapTop1??h?.top1??null,handicapSecond:base.handicapSecond??h?.second??null,
          handicapProbability:base.handicapProbability??h?.top1Probability??null,
          handicapSecondProbability:base.handicapSecondProbability??h?.secondProbability??null,
          handicapSourceLabel:base.handicapSourceLabel??(h?"新加坡实时赛前参考":""),
          shadowScoreTop3:support.shadowScoreTop3,shadowHTFTTop3:support.shadowHTFTTop3,
          shadowGoalsTop3:support.shadowGoalsTop3,shadowDailySelection:null,
          // 今日优选 is owned by the Soren production gate. Provisional module
          // output must never promote a formal Hao row into the customer list.
          dailySelectionTier:base.dailySelectionTier
        };
      });
      rows=await applySorenProductionLocks(rows,date);
      if(view==="cold-feed"||view==="member-zone"){
        if(!vip)return reply({ok:false,error:"VIP_REQUIRED"},403);
        const published=rows.filter((r:any)=>r.upsetWarning?.publish===true);
        return reply({ok:true,date,shadow:false,routeRuleVersion:"HJ38-UPSET-v1.1.0",count:published.length,rows:published,partial:false,publishedOnly:true});
      }
      if(view==="history")return reply({ok:true,date,view,count:rows.filter((r:any)=>r.resultVerified).length,rows:rows.filter((r:any)=>r.resultVerified),modelVersion:formalRows[0]?.model_version??"3.8",analysisPending:false,shadow:false});
      if(["market-trend","report","member-intel","admin-overseas-intel"].includes(view))return reply({ok:false,error:"FEATURE_NOT_MIGRATED",view,shadow:false},501);
      if(!["today","archive"].includes(view))return reply({ok:false,error:"UNKNOWN_VIEW",view},400);
      return reply({ok:true,view,date,count:rows.length,rows,model:"豪竞3.8",modelVersion:formalRows[0]?.model_version??"3.8",
        revision:formalRows[0]?.model_revision_tag??null,shadow:false,analysisPending:false,publicationStatus:"PREMATCH_VERIFIED",
        batchTime:formalRows[0]?.frozen_at??null,pregameVerifiedCount:rows.filter((r:any)=>r.pregameVerified).length,
        upsetStats:{published:rows.filter((r:any)=>r.upsetWarning?.publish===true).length},
        dailySelectionStats:{core:rows.filter((r:any)=>r.dailySelectionTier==="CORE").length,supplement:0}});
    }
    const x=await sb.rpc("ninety_customer_payload",{p_date:date});
    if(x.error)throw x.error;
    const all=Array.isArray(x.data?.matches)?x.data.matches:[];
    const history=date<currentBjt();
    const matches=vip?all:history?
      all.map((m:any)=>({...m,outputs:Object.fromEntries(Object.entries(m.outputs||{}).filter(([k])=>k!=="upset_warning"))})):
      all.map((m:any)=>({...m,outputs:all.filter((x:any)=>x.outputs?.ft).slice(0,2).some((x:any)=>x.match_key===m.match_key)?{ft:m.outputs.ft}:{}}));
    const rows=matches.map((m:any)=>adaptRow(m,date));
    if(view==="cold-feed"||view==="member-zone"){
      if(!vip)return reply({ok:false,error:"VIP_REQUIRED"},403);
      const published=rows.filter((r:any)=>r.upsetWarning?.publish===true);
      return reply({ok:true,date,shadow:true,routeRuleVersion:"SG-PENDING-FORMAL",
        count:published.length,rows:published.map((r:any)=>({...r,coldRecognition:{customerVisible:true,vipPublish:true}})),
        partial:true,publishedOnly:true});
    }
    if(view==="history"){
      const settled=rows.filter((r:any)=>r.resultVerified);
      return reply({ok:true,date,view,count:settled.length,rows:settled,
        modelVersion:"SG-ADAPTER-0.5",analysisPending:true,shadow:true});
    }
    if(view==="market-trend"||view==="report"||view==="member-intel"||view==="admin-overseas-intel"){
      return reply({ok:false,error:"FEATURE_NOT_MIGRATED",view,shadow:true},501);
    }
    if(!["today","archive"].includes(view))
      return reply({ok:false,error:"UNKNOWN_VIEW",view},400);
    const latest=all.flatMap((m:any)=>Object.values(m.outputs||{}).map((o:any)=>String(o?.produced_at||""))).sort().at(-1)||null;
    const pending=rows.some((r:any)=>r.analysisPending===true);
    return reply({ok:true,view,date,count:rows.length,rows,model:"九十刻度 · 新加坡影子",
      modelVersion:"SG-ADAPTER-0.5",revision:"singapore_adapter_0.5",shadow:true,
      analysisPending:pending,publicationStatus:pending?"SHADOW_PENDING_FORMAL":"SHADOW_PREMATCH_VISIBLE",
      batchTime:latest,pregameVerifiedCount:rows.filter((r:any)=>r.pregameVerified).length,
      upsetStats:{published:rows.filter((r:any)=>r.upsetWarning?.publish===true).length},
      dailySelectionStats:{core:rows.filter((r:any)=>r.dailySelectionTier==="CORE").length,
        supplement:rows.filter((r:any)=>r.dailySelectionTier==="SUPPLEMENT").length}
    });
  }catch(e){console.error("SG_COMPAT_FAILURE",e);return reply({ok:false,error:"SG_COMPAT_UNAVAILABLE"},503)}
});
