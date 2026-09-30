import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const USER="hao",PASS_SHA256="bb49a8816232f7ac5e58ac0d42862ef9f404aea88ae2bfd43d48b11e973604ce",APP_ORIGIN="https://hjh19970220.github.io";
function adminClient(){const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";if(!url||!key)throw new Error("Supabase admin credentials unavailable");return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
function cors(){return {"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"Content-Type, Authorization, Cache-Control","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"}}
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function b64urlText(s:string){return b64url(new TextEncoder().encode(s))}
function fromB64url(s:string){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const raw=atob(s);return new Uint8Array([...raw].map(c=>c.charCodeAt(0)))}
async function sha256Hex(s:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));return [...d].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hmac(data:string){const keyRaw=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(keyRaw),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(data))))}
async function issueToken(user:string){const p=b64urlText(JSON.stringify({u:user,exp:Date.now()+30*24*60*60*1000,n:crypto.randomUUID()}));return p+"."+await hmac(p)}
async function authorized(req:Request){const h=req.headers.get("authorization")||"";if(!h.startsWith("Bearer "))return false;const parts=h.slice(7).trim().split(".");if(parts.length!==2)return false;const [p,sig]=parts;if(await hmac(p)!==sig)return false;try{const payload=JSON.parse(new TextDecoder().decode(fromB64url(p)));return payload?.u===USER&&Number(payload?.exp)>Date.now()}catch{return false}}
async function internalAuthorized(req:Request){const k=req.headers.get("x-hao-internal-key")||"";if(!k)return false;try{const s=adminClient();const {data,error}=await s.from("hao_internal_secrets_v01").select("secret_value").eq("secret_name","cron_internal_v01").maybeSingle();return !error&&!!data?.secret_value&&k===data.secret_value}catch{return false}}
function pickCode(v:string|null){return v==="主胜"?"3":v==="平"?"1":v==="客胜"?"0":""}
function hitTop1(r:any){return !!(r?.top1&&r?.result_verified&&pickCode(r.top1)===r.result_1x2)}
function hitTicket(r:any){return !!(r?.ticket_pick&&r?.result_verified&&String(r.ticket_pick).includes(String(r.result_1x2)))}
function isHjModelName(v:string){return v.includes("豪竞")||v.includes("豪竟")}
function isHcModelName(v:string){return v.includes("豪传")}
function isHbModelName(v:string){return v.includes("豪篮")}
function hjStats(rows:any[]){const scored=rows.filter(r=>r.top1&&r.result_verified),hits=scored.filter(hitTop1),wrong=scored.filter(r=>!hitTop1(r)),anchors=scored.filter(r=>/Anchor|A档核心/.test(r.anchor_status||"")),high=scored.filter(r=>/高/.test(r.confidence_label||""));return {scored:scored.length,hits:hits.length,wrong:wrong.length,anchors:anchors.length,ahits:anchors.filter(hitTop1).length,high:high.length,hhits:high.filter(hitTop1).length,isolated:wrong.filter(r=>/PASS/.test(r.final_handling||"")).length}}
function hcStats(rows:any[]){const scored=rows.filter(r=>r.result_verified&&/^[310]+$/.test(String(r.ticket_pick||"")));return {scored:scored.length,hits:scored.filter(hitTicket).length}}
function semanticCount(model:string,rows:any[]){return isHcModelName(model)?rows.filter(r=>r.ticket_pick||r.top1||r.semantic_direction).length:rows.filter(r=>r.top1).length}
async function loadLatest(s:any,model:string){const {data:runs,error}=await s.from("hao_console_model_runs").select("*").eq("model_name",model).order("pool_date",{ascending:false}).order("run_time",{ascending:false}).limit(8);if(error)throw error;if(!runs?.length)return {latest_attempt:null,latest_rows:[],display_run:null,display_rows:[]};const ids=runs.map((r:any)=>r.id);const {data:probe,error:pe}=await s.from("hao_console_predictions").select("run_id,match_no,top1,ticket_pick,semantic_direction").in("run_id",ids);if(pe)throw pe;const probeBy=new Map<number,any[]>();for(const row of probe||[]){const id=Number(row.run_id);if(!probeBy.has(id))probeBy.set(id,[]);probeBy.get(id)!.push(row)}const latest=runs[0],display=runs.find((r:any)=>semanticCount(model,probeBy.get(Number(r.id))||[])>0)||latest;const need=[...new Set([Number(latest.id),Number(display.id)])];const {data:allRows,error:e2}=await s.from("hao_console_predictions").select("*").in("run_id",need).order("match_no",{ascending:true});if(e2)throw e2;const byRun=new Map<number,any[]>();for(const row of allRows||[]){const id=Number(row.run_id);if(!byRun.has(id))byRun.set(id,[]);byRun.get(id)!.push(row)}return {latest_attempt:latest,latest_rows:byRun.get(Number(latest.id))||[],display_run:display,display_rows:byRun.get(Number(display.id))||[]}}
async function loadPreviousHcSettlement(s:any,model:string,currentRun:any){
  if(!currentRun)return null;
  const currentIssue=String(currentRun.pool_label||"");
  const {data:runs,error}=await s.from("hao_console_model_runs")
    .select("*").eq("model_name",model)
    .order("pool_date",{ascending:false}).order("run_time",{ascending:false}).limit(40);
  if(error)throw error;
  const prev=(runs||[]).find((r:any)=>String(r.pool_label||"")&&String(r.pool_label||"")!==currentIssue);
  if(!prev)return null;
  const {data:rows,error:pe}=await s.from("hao_console_predictions").select("*")
    .eq("run_id",prev.id).order("match_no",{ascending:true});
  if(pe)throw pe;
  const rr=rows||[];
  const verified=rr.filter((r:any)=>r.result_verified).length;
  return {
    run:compactRun(prev,"hc"),
    rows:rr.map(compactPrediction),
    verified,
    total:rr.length,
    pending:Math.max(0,rr.length-verified),
    complete:rr.length>0&&verified===rr.length,
    last_result_update:latestIso(rr,"updated_at")
  };
}
async function loadBasketballLatest(s:any,model:string){const {data:runs,error}=await s.from("hao_basketball_runs_v01").select("*").eq("model_name",model).order("sale_date",{ascending:false}).order("run_time",{ascending:false}).limit(5);if(error)throw error;if(!runs?.length)return {latest_attempt:null,rows:[]};const latest=runs[0];const {data:rows,error:e2}=await s.from("hao_basketball_predictions_v01").select("*").eq("run_id",latest.id).order("match_no",{ascending:true});if(e2)throw e2;return {latest_attempt:latest,rows:rows||[]}}
async function loadCumulative(s:any){const {data,error}=await s.from("hao_console_daily_scores").select("model_name,pool_date,pool_label,is_formal,scored_matches,hits,anchor_scored,anchor_hits,pass_wrong_isolated,wrong_total,high_scored,high_hits,r9_full_hit,summary").eq("is_formal",true).order("pool_date",{ascending:true});if(error)throw error;const rows=data||[],sum=(a:any[],k:string)=>a.reduce((x,r)=>x+Number(r?.[k]||0),0),ss=(a:any[],k:string)=>a.reduce((x,r)=>x+Number(r?.summary?.[k]||0),0),hj=rows.filter((r:any)=>isHjModelName(String(r.model_name||""))),hc=rows.filter((r:any)=>isHcModelName(String(r.model_name||"")));return {hj:{days:hj.length,scored:sum(hj,"scored_matches"),hits:sum(hj,"hits"),anchorScored:sum(hj,"anchor_scored"),anchorHits:sum(hj,"anchor_hits"),highScored:sum(hj,"high_scored"),highHits:sum(hj,"high_hits"),wrong:sum(hj,"wrong_total"),passIsolated:sum(hj,"pass_wrong_isolated"),passFalseKills:ss(hj,"pass_false_kills"),aScored:ss(hj,"a_scored"),aHits:ss(hj,"a_hits"),bScored:ss(hj,"b_scored"),bHits:ss(hj,"b_hits"),cScored:ss(hj,"c_scored"),cHits:ss(hj,"c_hits"),brier:null,logLoss:null,probabilityScored:ss(hj,"probability_scored"),handicapGreenScored:ss(hj,"handicap_green_scored"),handicapGreenHits:ss(hj,"handicap_green_hits"),handicapYellowScored:ss(hj,"handicap_yellow_scored"),handicapYellowHits:ss(hj,"handicap_yellow_hits"),handicapRedPass:ss(hj,"handicap_red_pass_n"),handicapOutScored:ss(hj,"handicap_out_scored"),handicapOutHits:ss(hj,"handicap_out_hits"),handicapPassAvoided:ss(hj,"handicap_pass_avoided_wrong"),handicapPassFalseKills:ss(hj,"handicap_pass_false_kills")},hc:{issues:hc.length,scored:sum(hc,"scored_matches"),hits:sum(hc,"hits"),full9:hc.filter((r:any)=>r.r9_full_hit===true).length,discardScored:ss(hc,"discard_scored"),discardWouldHit:ss(hc,"discard_would_hit")}}}
function latestIso(rows:any[],key="captured_at"){const xs=rows.map(x=>x?.[key]).filter(Boolean).sort();return xs.length?xs[xs.length-1]:null}
function sourceSnapshot(run:any,rows:any[],health:any[],spRows:any[],asiaRows:any[],williamRows:any[]){const rs=run?.raw_summary||{},total=Number(run?.total_matches||0),n=rows.length,formalRunComplete=!!(run&&run.data_complete===true&&run.formal_allowed===true&&total>0&&n===total),confirmed=rows.filter(r=>{const legacy=String(r?.source_status?.core_chain||r?.source_status?.core_chain_status||"");if(/确认|完整|ok/i.test(legacy)&&!/未确认|不完整/i.test(legacy))return true;return formalRunComplete&&['DQ-A','DQ-B'].includes(String(r?.dq||''))}).length;const h=(keys:string[])=>health.find((x:any)=>keys.includes(x.source_code));const wh=h(["zucaijia_william"])||h(["500_william"]);const wr=williamRows||[],wm=new Set(wr.map((x:any)=>String(x.match_no))).size,wLast=latestIso(wr),wSource=(wr.find((x:any)=>x.source_code)?.source_code||wh?.source_code||null);const labelHealth=(x:any)=>x?`${x.status} · ${Number(x.verified_matches||0)}/${Number(x.expected_matches||0)} verified`:"未记录";const spOne=(code:string)=>{const all=spRows.filter(x=>x.source_code===code),hh=h([code]);const had=all.filter(x=>x.market_type==="HAD"&&x.parse_status==="verified_mirror"),hhad=all.filter(x=>x.market_type==="HHAD"&&x.parse_status==="verified_mirror"),hadNo=all.filter(x=>x.market_type==="HAD"&&x.parse_status==="not_offered"),hhadNo=all.filter(x=>x.market_type==="HHAD"&&x.parse_status==="not_offered");return {status:hh?.status||(all.length?"ok":"未记录"),matched:Number(hh?.verified_matches??new Set(all.map(x=>String(x.match_no))).size),expected:Number(hh?.expected_matches??total),had_matches:new Set(had.map(x=>String(x.match_no))).size,hhad_matches:new Set(hhad.map(x=>String(x.match_no))).size,had_not_offered:new Set(hadNo.map(x=>String(x.match_no))).size,hhad_not_offered:new Set(hhadNo.map(x=>String(x.match_no))).size,last_capture:latestIso(all)||hh?.last_success_at||null,rows:all.length}};const aliases:any={bet365:["Bet365","BET365"],crown:["皇冠","Crown","CROWN"],william_ah:["William Hill亚洲盘","威廉希尔","William Hill"],bet12:["12Bet","12bet","12BET"]};const asia:any={};for(const [k,names] of Object.entries(aliases)){const ar=asiaRows.filter(x=>(names as string[]).includes(String(x.institution_name)));asia[k]={status:ar.length?"ok":"未记录",matches:new Set(ar.map(x=>String(x.match_no))).size,rows:ar.length,last_capture:latestIso(ar)}}return {total_matches:total,row_coverage:n,core_chain_rows_confirmed:confirmed,core_chain_complete:(rs.core_chain_complete??formalRunComplete),full_pool_complete:(rs.full_pool_complete??formalRunComplete),formal_run_complete:formalRunComplete,run_status:run?.status||null,data_complete:run?.data_complete===true,formal_allowed:run?.formal_allowed===true,william:{status:total>0&&wm>=total?"ok":(wm>0?"partial":(wh?.status==="ok"?"ok":(Number(wh?.verified_matches||0)>0?"partial":"missing"))),matches:wm>0?wm:Number(wh?.verified_matches||0),expected:total>0?total:Number(wh?.expected_matches||0),last_capture:wLast||wh?.last_success_at||null,source_code:wSource},william_confirmed:labelHealth(wh),william_last_success:wh?.last_success_at||null,sp_combined:(()=>{const x=h(["jc_sp_combined"]);return x?{status:x.status,matched:Number(x.verified_matches||0),expected:Number(x.expected_matches||total),last_capture:x.last_success_at||null,notes:x.notes||null}:{status:"missing",matched:0,expected:total,last_capture:null}})(),sp_mirrors:{okooo:spOne("okooo_sp_mirror"),fivehundred:spOne("500_sp_mirror"),qiulaile:spOne("qiulaile_sp_mirror")},asia4:asia,source_subject:rs.source_subject??null}}
function modelMatch(run:any,active:any){return !!(run&&active&&Number(run.model_revision_id)===Number(active.id))}
function recommendationState(run:any,active:any){const saved=run?.raw_summary?.recommended_plays||run?.raw_summary?.recommendations||null,current=modelMatch(run,active),eligible=!!(run?.data_complete&&run?.formal_allowed&&saved&&current);let reason="";if(!run)reason="暂无运行";else if(!run.data_complete)reason="最新运行主链/全池不完整";else if(!run.formal_allowed)reason="最新运行未通过正式执行闸门";else if(!current&&Number(run?.total_matches||0)>0)reason=String(run?.pool_date||"")+"冻结盘使用当时修订；当前active从下一销售日生效，不回写历史票面";else if(!current)reason="最新运行未绑定当前active修订";else if(!saved)reason="最新运行未冻结A/B/C正式输出";return {eligible,saved:saved||null,reason,current_revision:current,display_only:!!(saved&&!eligible&&Number(run?.total_matches||0)>0)}}
function compactSourceStatus(s:any={}){return {
  top1_prob:s.top1_prob??null,gap:s.gap??null,
  handicap_raw_pick:s.handicap_raw_pick??null,
  handicap_final_pick:s.handicap_final_pick??null,
  handicap_light:s.handicap_light??null,handicap_light_label:s.handicap_light_label??null,
  handicap_light_reason:s.handicap_light_reason??null,handicap_pass_trigger:s.handicap_pass_trigger??null,
  handicap_support_count:s.handicap_support_count??null,
  handicap_support_domains:Array.isArray(s.handicap_support_domains)?s.handicap_support_domains:[],
  had_market_status:s.had_market_status??null,hhad_market_status:s.hhad_market_status??null,
  had_source_code:s.had_source_code??null,hhad_source_code:s.hhad_source_code??null,
  hhad_lambda_home:s.hhad_lambda_home??null,hhad_lambda_away:s.hhad_lambda_away??null,
  hhad_shadow_status:s.hhad_shadow_status??null,
  final_selection_light_label:s.final_selection_light_label??null,final_selection_reason:s.final_selection_reason??null,
  had_selection_light:s.had_selection_light??s.final_selection_light??null,
  had_selection_light_label:s.had_selection_light_label??s.final_selection_light_label??null,
  had_selection_eligible:s.had_selection_eligible??s.final_selection_eligible??false,
  primary_play:s.primary_play??'HAD',
  primary_selection_light:s.primary_selection_light??s.had_selection_light??s.final_selection_light??null,
  primary_selection_label:s.primary_selection_label??s.had_selection_light_label??s.final_selection_light_label??null,
  primary_selection_eligible:s.primary_selection_eligible??s.had_selection_eligible??s.final_selection_eligible??false,
  handicap_selection_eligible:s.handicap_selection_eligible??false,
  handicap_aux_label:s.handicap_aux_label??null,
  overall_play_light:s.overall_play_light??null,
  overall_play_label:s.overall_play_label??null,
  overall_play_reason:s.overall_play_reason??null,
  best_executable_play:s.best_executable_play??null,
  teacher_post_gate_action:s.teacher_post_gate_action??null,teacher_adjustment:s.teacher_adjustment??null,
  independent_support_domains:s.independent_support_domains??null,
  teacher_b_had:s.teacher_b_had??null,teacher_b_hhad:s.teacher_b_hhad??null,teacher_b_agreement:s.teacher_b_agreement??null,teacher_b_had_agreement:s.teacher_b_agreement??null,teacher_b_source_status:s.teacher_b_source_status??null,
  teacher_c_had:s.teacher_c_had??null,teacher_c_hhad:s.teacher_c_hhad??null,teacher_c_agreement:s.teacher_c_agreement??null,teacher_c_had_agreement:s.teacher_c_agreement??null,teacher_c_source_status:s.teacher_c_source_status??null,
  teacher_g_had:s.teacher_g_had??null,teacher_g_hhad:s.teacher_g_hhad??null,teacher_g_second_pick:s.teacher_g_second_pick??null,teacher_g_confidence:s.teacher_g_confidence??null,teacher_g_draw_risk:s.teacher_g_draw_risk??null,teacher_g_upset_risk:s.teacher_g_upset_risk??null,teacher_g_favorite_trap:s.teacher_g_favorite_trap??null,teacher_g_agreement:s.teacher_g_agreement??null,teacher_g_had_agreement:s.teacher_g_agreement??null,teacher_g_source_status:s.teacher_g_source_status??null,
  teacher_g_review_status:s.teacher_g_review_status??null,teacher_g_reviewed_at:s.teacher_g_reviewed_at??null,
  teacher_g_final_conclusion:s.teacher_g_final_conclusion??null,teacher_g_yellow_reason:s.teacher_g_yellow_reason??null,
  teacher_g_yellow_arbitration:s.teacher_g_yellow_arbitration??null,
  teacher_g_support_evidence:s.teacher_g_support_evidence??null,
  teacher_g_opposition_evidence:s.teacher_g_opposition_evidence??null,
  teacher_g_lineup_injury_audit:s.teacher_g_lineup_injury_audit??null,
  teacher_g_rotation_audit:s.teacher_g_rotation_audit??null,
  teacher_g_fatigue_rest_audit:s.teacher_g_fatigue_rest_audit??null,
  teacher_g_motivation_schedule_audit:s.teacher_g_motivation_schedule_audit??null,
  teacher_g_tactical_matchup_audit:s.teacher_g_tactical_matchup_audit??null,
  teacher_g_gk_setpiece_audit:s.teacher_g_gk_setpiece_audit??null,
  teacher_g_travel_weather_pitch_audit:s.teacher_g_travel_weather_pitch_audit??null,
  teacher_g_strongest_support:s.teacher_g_strongest_support??null,
  teacher_g_strongest_opposition:s.teacher_g_strongest_opposition??null,
  teacher_strong_conflict_gate:s.teacher_strong_conflict_gate??null,
  teacher_independent_opposition_domains:s.teacher_independent_opposition_domains??null,
  market_direction_conflict:s.market_direction_conflict??null,
  prematch_lock:s.prematch_lock??false,prematch_lock_status:s.prematch_lock_status??null,
  prematch_lock_source_run_id:s.prematch_lock_source_run_id??null,prematch_lock_frozen_at:s.prematch_lock_frozen_at??null,
  prematch_lock_original_revision_id:s.prematch_lock_original_revision_id??null,prematch_lock_original_revision_tag:s.prematch_lock_original_revision_tag??null,
  post_kickoff_no_freeze:s.post_kickoff_no_freeze??false,bettable_now:s.bettable_now??null,
  market_timeline:Array.isArray(s.market_timeline)?s.market_timeline:[],
  single_eligibility:s.single_eligibility??s.singleEligibility??null,
  single_opportunity_cost:s.single_opportunity_cost??s.opportunity_cost??null,
  hps_class:s.hps_class??s.hpsClass??null,
  ticket_role:s.ticket_role??s.final_role??null,
  fotmob_repair_status:s.fotmob_repair_status??null,
  evidence_domains:s.evidence_domains??s.evidence_completeness??null
}}
function compactRun(r:any,role:string){if(!r)return null;const out:any={
  id:r.id,model_name:r.model_name,model_version:r.model_version,pool_date:r.pool_date,pool_label:r.pool_label,
  pool_kind:r.pool_kind,run_time:r.run_time,status:r.status,data_complete:r.data_complete,formal_allowed:r.formal_allowed,
  total_matches:r.total_matches,model_revision_id:r.model_revision_id,model_revision_tag:r.model_revision_tag
};if(role==="hc"){const s=r.raw_summary||{};out.raw_summary={
  issue_no:s.issue_no??null,cutoff_bjt:s.cutoff_bjt??null,retained_9:s.retained_9||[],
  discarded_5:s.discarded_5||[],singles_4:s.singles_4||{},doubles_5:s.doubles_5||{},
  ticket_310:s.ticket_310||null,ticket_status:s.ticket_status||null,
  combination_count:s.combination_count??null,cost_rmb:s.cost_rmb??null
}}return out}
function compactHealth(x:any){return {
  source_code:x.source_code,status:x.status,last_success_at:x.last_success_at,last_attempt_at:x.last_attempt_at,
  expected_matches:x.expected_matches,verified_matches:x.verified_matches
}}
function compactPrediction(r:any){return {
  id:r.id,run_id:r.run_id,model_name:r.model_name,model_version:r.model_version,pool_date:r.pool_date,
  match_no:r.match_no,league:r.league,home_team:r.home_team,away_team:r.away_team,kickoff_bjt:r.kickoff_bjt,
  top1:r.top1,second_pick:r.second_pick,confidence_label:r.confidence_label,anchor_status:r.anchor_status,
  hur:r.hur,dtr:r.dtr,dlr:r.dlr,strong_conflict:r.strong_conflict,final_handling:r.final_handling,
  ticket_pick:r.ticket_pick,keep_discard:r.keep_discard,dq:r.dq,hps:r.hps,official_handicap:r.official_handicap,
  handicap_pick:r.handicap_pick,frozen_at:r.frozen_at,freeze_status:r.freeze_status,
  result_home:r.result_home,result_away:r.result_away,result_1x2:r.result_1x2,result_verified:r.result_verified,
  model_revision_id:r.model_revision_id,model_revision_tag:r.model_revision_tag,semantic_direction:r.semantic_direction,
  ticket_pick_before_gate:r.ticket_pick_before_gate,ticket_pick_after_gate:r.ticket_pick_after_gate,
  direction_consistency_status:r.direction_consistency_status,source_status:compactSourceStatus(r.source_status||{})
}}

function compactOptimalRoute(r:any){if(!r)return null;return {
  prediction_id:r.prediction_id,run_id:r.run_id,pool_date:r.pool_date,match_no:r.match_no,
  selected_market:r.selected_market,selected_pick:r.selected_pick,selected_line:r.selected_line,
  selected_price:r.selected_price,selected_model_probability:r.selected_model_probability,
  selected_ev:r.selected_ev,route_status:r.route_status,route_reason:r.route_reason,
  candidates:Array.isArray(r.candidates)?r.candidates:[],daily_tier:r.daily_tier??null,
  recommendation_rank:r.recommendation_rank??null,absolute_budget_cap_cny:r.absolute_budget_cap_cny??64,
  frozen_at:r.frozen_at,model_revision_id:r.model_revision_id,model_revision_tag:r.model_revision_tag,
  result_used:r.result_used===true,probability_core_unchanged:r.probability_core_unchanged!==false,
  prospective_only:r.prospective_only!==false
}}
function routeDisplay(r:any){if(!r)return "";if(r.route_status!=="RECOMMEND"){const why=r.route_status==="PASS_NO_POSITIVE_EV"?"无正EV":"数据或闸门未通过";return "最优玩法：PASS（"+why+"）"}const names:any={FT_HAD:"胜平负",OFFICIAL_HHAD:"竞彩让球",ASIAN_HANDICAP:"亚洲盘"};const tier=r.daily_tier==="MAIN"?"主推":r.daily_tier==="BACKUP"?"备选":r.daily_tier==="OUTSIDE_DAILY_CAP"?"超出日上限":"候选";const line=r.selected_line===null||r.selected_line===undefined?"":(" "+(Number(r.selected_line)>0?"+":"")+Number(r.selected_line));const price=r.selected_price?(" @"+Number(r.selected_price).toFixed(2)):"";const ev=r.selected_ev===null||r.selected_ev===undefined?"":(" EV "+(Number(r.selected_ev)>=0?"+":"")+(Number(r.selected_ev)*100).toFixed(1)+"%");return "最优玩法："+tier+" · "+(names[r.selected_market]||r.selected_market)+" · "+String(r.selected_pick||"")+line+price+ev}
function compactPredictionWithRoute(row:any,route:any){const out:any=compactPrediction(row);out.optimal_market_route=compactOptimalRoute(route);const label=routeDisplay(route);if(label)out.final_handling=[out.final_handling,label].filter(Boolean).join(" ｜ ");return out}

const PUBLIC_HJ38_REV="3.8-bplus-single-double-v0.1-20260919";
const publicHj38Cors={"Access-Control-Allow-Origin":"https://suolunpro.github.io","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET, OPTIONS","Cache-Control":"public, max-age=45, stale-while-revalidate=30","Content-Type":"application/json; charset=utf-8","Vary":"Origin"};
function publicHj38Reply(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:publicHj38Cors})}
function publicHj38Iso(value:any){const n=Date.parse(String(value??""));return Number.isFinite(n)?new Date(n).toISOString():null}
function publicHj38PickCode(value:any){return value==="主胜"?"H":value==="平"?"D":value==="客胜"?"A":null}
function publicHj38ResultCode(value:any){return value==="3"?"H":value==="1"?"D":value==="0"?"A":null}
function publicHj38TicketCodes(value:any,top1:any){const names=String(value??"").split("+").map(x=>x.trim()).filter(Boolean),codes=names.map(publicHj38PickCode).filter(Boolean) as string[];if(codes.length)return [...new Set(codes)];const top=publicHj38PickCode(top1);return top?[top]:[]}
function publicHj38Direction(mode:string,codes:string[],top1:any){if(mode==="PASS")return "PASS";if(mode==="SINGLE")return String(top1??"未确认");const set=new Set(codes);if(set.has("H")&&set.has("D"))return "主队不败";if(set.has("D")&&set.has("A"))return "客队不败";if(set.has("H")&&set.has("A"))return "分胜负";return "未确认"}
function publicHj38HandicapOptions(source:any,preferred:any){const margin=source?.hhad_margin_probs&&typeof source.hhad_margin_probs==="object"?source.hhad_margin_probs:null,market=source?.hhad_market_probs&&typeof source.hhad_market_probs==="object"?source.hhad_market_probs:null,raw=margin?{让胜:margin.let_win,让平:margin.let_draw,让负:margin.let_loss}:market?{让胜:market.home,让平:market.draw,让负:market.away}:null,probabilitySource=margin?"模型净胜球概率":market?"官方让球市场概率":null;if(!raw)return{options:[],source:null};const options=Object.entries(raw).map(([pick,value])=>({pick,probability:Number(value)})).filter((x:any)=>Number.isFinite(x.probability)&&x.probability>=0),total=options.reduce((sum:number,x:any)=>sum+x.probability,0);if(total<=0)return{options:[],source:probabilitySource};for(const x of options)x.probability=Math.round(x.probability/total*1000)/10;options.sort((a:any,b:any)=>b.probability-a.probability);const preferredPick=["让胜","让平","让负"].includes(String(preferred??""))?String(preferred):null;if(preferredPick){const i=options.findIndex((x:any)=>x.pick===preferredPick);if(i>0)options.unshift(options.splice(i,1)[0])}return{options,source:probabilitySource}}
function publicHj38FtPercent(v:any){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1?Math.round(n*1000)/10:null}
function publicHj38WilliamTop1Odds(source:any,top1:any){
  const timeline=Array.isArray(source?.market_timeline)?source.market_timeline:[];
  const william=timeline.find((x:any)=>String(x?.source??"").toLowerCase().includes("william")&&x?.current);
  if(!william)return null;
  const parts=String(william.current).split("/").map(Number);
  if(parts.length!==3||parts.some((x:number)=>!Number.isFinite(x)||x<=1))return null;
  const code=publicHj38PickCode(top1),value=code==="H"?parts[0]:code==="D"?parts[1]:code==="A"?parts[2]:null;
  return value===null||!Number.isFinite(value)?null:Math.round(Number(value)*1000)/1000;
}
function publicHj38Map(row:any,run:any,includeResult:boolean){const source=row.source_status&&typeof row.source_status==="object"?row.source_status:{},warningRaw=source.upset_warning&&typeof source.upset_warning==="object"?source.upset_warning:null,ticket=source.bplus_ticket??row.ticket_pick_after_gate??row.ticket_pick??null,eligible=source.final_selection_eligible===true||row.keep_discard==="KEEP",codes=publicHj38TicketCodes(ticket,row.top1),tier=source.selection_tier??source.single_double_v01?.class_label??null,isDouble=eligible&&(codes.length>=2||String(tier??"").includes("双选")),mode=eligible?(isDouble?"DOUBLE":"SINGLE"):"PASS",handicapEligible=source.handicap_selection_eligible===true,handicapDirection=(row.handicap_pick&&row.handicap_pick!=="PASS"?row.handicap_pick:(source.handicap_final_pick&&source.handicap_final_pick!=="PASS"?source.handicap_final_pick:(source.handicap_raw_pick??"PASS"))),handicapRank=publicHj38HandicapOptions(source,handicapDirection),handicapPrimary=handicapRank.options[0]??null,handicapSecondary=handicapRank.options[1]??null,top1Probability=Number(source.top1_prob),pregameVerified=Boolean(publicHj38Iso(row.frozen_at)&&publicHj38Iso(row.kickoff_bjt)&&Date.parse(row.frozen_at)<Date.parse(row.kickoff_bjt)),settled=includeResult&&row.result_verified===true,result=settled?publicHj38ResultCode(row.result_1x2):null,resultHome=settled&&Number.isFinite(Number(row.result_home))?Number(row.result_home):null,resultAway=settled&&Number.isFinite(Number(row.result_away))?Number(row.result_away):null,handicapResult=resultHome===null||resultAway===null||!Number.isFinite(Number(row.official_handicap))?null:((resultHome+Number(row.official_handicap)-resultAway)>0?"让胜":(resultHome+Number(row.official_handicap)-resultAway)<0?"让负":"让平"),williamTop1Odds=publicHj38WilliamTop1Odds(source,row.top1);return{date:row.pool_date,no:row.match_no,league:row.league,home:row.home_team,away:row.away_team,kickoff:publicHj38Iso(row.kickoff_bjt),ftTop1:row.top1??null,second:row.second_pick??null,direction:publicHj38Direction(mode,codes,row.top1),mode,selectionCodes:codes,tier:mode==="PASS"?"PASS":(tier??"未确认"),pass:mode==="PASS",confidence:Number.isFinite(top1Probability)&&top1Probability>=0&&top1Probability<=1?Math.round(top1Probability*1000)/10:null,williamTop1Odds,homeProbability:publicHj38FtPercent(source.p_final?.home),drawProbability:publicHj38FtPercent(source.p_final?.draw),awayProbability:publicHj38FtPercent(source.p_final?.away),ftProbabilitySource:'赛前冻结p_final',officialHandicap:row.official_handicap??null,handicap:handicapPrimary?.pick??handicapDirection,handicapTop1:handicapPrimary?.pick??handicapDirection,handicapProbability:handicapPrimary?.probability??null,handicapSecond:handicapSecondary?.pick??null,handicapSecondProbability:handicapSecondary?.probability??null,handicapProbabilitySource:handicapRank.source,handicapEligible:true,handicapQualityEligible:handicapEligible,risk:{hur:row.hur??"未确认",dtr:row.dtr??"未确认",dlr:row.dlr??"未确认",dq:row.dq??"未确认"},upsetWarning:warningRaw?{status:warningRaw.status??"ACTIVE",publish:warningRaw.publish===true,riskLevel:warningRaw.risk_level??"未确认",riskScore:Number.isFinite(Number(warningRaw.risk_score))?Number(warningRaw.risk_score):null,displayTier:warningRaw.display_tier??(warningRaw.risk_level==="高"?"强风险信号":warningRaw.risk_level==="中"?"重点风险":warningRaw.detail_only===true?"一般风险":null),detailOnly:warningRaw.detail_only===true,focusGate:warningRaw.focus_gate&&typeof warningRaw.focus_gate==="object"?warningRaw.focus_gate:null,marketSignals:Array.isArray(warningRaw.market_signals)?warningRaw.market_signals:[],independentDrawProbability:Number.isFinite(Number(warningRaw.independent_draw_probability))?Number(warningRaw.independent_draw_probability):null,originalTop1:warningRaw.original_top1??row.top1??null,warningDirection:warningRaw.warning_direction??null,alternativePick:warningRaw.alternative_pick??null,riskBasis:Array.isArray(warningRaw.risk_basis)?warningRaw.risk_basis:[],directionBasis:Array.isArray(warningRaw.direction_basis)?warningRaw.direction_basis:[],evidenceDomains:Array.isArray(warningRaw.evidence_domains)?warningRaw.evidence_domains:[],directionalDomainCount:Number(warningRaw.directional_domain_count??0),modelVersion:warningRaw.model_version??null,sourceModelVersion:warningRaw.source_model_version??run.model_version??null,sourceRevision:warningRaw.source_revision??run.model_revision_tag??null,prematchAt:publicHj38Iso(warningRaw.prematch_at??row.frozen_at),resultFieldsUsed:warningRaw.result_fields_used===true,hurDirectionUsed:warningRaw.hur_direction_used===true,note:warningRaw.note??null}:null,riskAnalysis:mode!=="PASS"?"已通过正式赛前质量核验":([row.hur,row.dtr,row.dlr].includes("红")?"风险信号偏高，FT选择已PASS":([row.hur,row.dtr,row.dlr].includes("黄")?"存在风险分歧，FT选择已PASS":"正式单双选条件未满足")),handicapAnalysis:handicapEligible?"让球方向已通过多源赛前一致性核验":"让球方向已发布；原质量门槛未达标，风险等级较高",frozenAt:pregameVerified?publicHj38Iso(row.frozen_at):null,pregameVerified,version:run.model_version,model:"索伦引擎",resultVerified:settled,result,resultHome,resultAway,handicapResult,handicapHit:settled&&handicapResult?[handicapPrimary?.pick??handicapDirection,handicapSecondary?.pick].includes(handicapResult):null,top1Hit:settled&&result?publicHj38PickCode(row.top1)===result:null,coverageHit:settled&&result&&mode!=="PASS"?codes.includes(result):null}}
function publicHj38ApplyTop5(base:any,row:any,output:any,rollout:any){if(rollout?.active_mode!=='TOP5'||!output||output.status!=='TOP5_FORMAL'||!['HWIN','HDRAW','HLOSS'].includes(String(output.new_top1))||!['HWIN','HDRAW','HLOSS'].includes(String(output.new_second))||output.new_top1===output.new_second||Date.parse(String(output.original_frozen_at))!==Date.parse(String(row.frozen_at))||Date.parse(String(row.frozen_at))<Date.parse(String(rollout.effective_at))||Date.parse(String(row.frozen_at))>=Date.parse(String(row.kickoff_bjt)))return base;
const names:any={HWIN:'让胜',HDRAW:'让平',HLOSS:'让负'},prob=output.new_probabilities||{},n1=Number(prob[output.new_top1]),n2=Number(prob[output.new_second]);if(!Number.isFinite(n1)||!Number.isFinite(n2)||n1<=0||n2<=0)return base;
return {...base,handicap:names[output.new_top1],handicapTop1:names[output.new_top1],handicapSecond:names[output.new_second],handicapProbability:Math.round(n1*1000)/10,handicapSecondProbability:Math.round(n2*1000)/10,handicapProbabilitySource:'比分Top5＋胜平负＋赛前让球市场（综合权重，非实测胜率）',handicapEligible:true,handicapQualityEligible:base.risk?.dq!=='DQ-D',handicapSourceKind:'ORIGINAL_PREMATCH',handicapSourceLabel:'Top5新方案赛前冻结',handicapSourceVersion:String(rollout.revision),handicapSourceRevision:String(rollout.revision),handicapFrozenAt:row.frozen_at,handicapReconstructed:false,handicapModelVersion:String(rollout.revision),handicapTop1Hit:base.resultVerified===true&&base.handicapResult?names[output.new_top1]===base.handicapResult:null,handicapCoverageHit:base.resultVerified===true&&base.handicapResult?[names[output.new_top1],names[output.new_second]].includes(base.handicapResult):null,handicapHit:base.resultVerified===true&&base.handicapResult?[names[output.new_top1],names[output.new_second]].includes(base.handicapResult):null,handicapAnalysis:'赛前泊松比分Top5＋原胜平负概率＋同期官方让球市场，三源等权；原让球方向保留为影子备份。'};
}
function publicHj38CustomerColdRoute(row:any){
  const w=row?.upsetWarning&&typeof row.upsetWarning==="object"?row.upsetWarning:null;
  if(!w)return {...row,coldRoute:null};
  const gate=w.focusGate&&typeof w.focusGate==="object"?w.focusGate:{};
  const score=Number(w.riskScore);
  const rawConfidence=Number(row.confidence);
  const confidencePct=Number.isFinite(rawConfidence)?(rawConfidence<=1?rawConfidence*100:rawConfidence):null;
  const dq=String(row?.risk?.dq??"").toUpperCase();
  const oppositeSecond=gate.opposite_second===true||gate.oppositeSecond===true;
  const top1=String(row.ftTop1??"");
  const riskPoolEligible=w.publish===true&&Number.isFinite(score)&&score>=4&&oppositeSecond&&["主胜","客胜"].includes(top1);
  const strictAvoidEligible=riskPoolEligible&&["DQ-A","DQ-B"].includes(dq)&&confidencePct!==null&&confidencePct<=43;
  const hpicks=[...new Set([row.handicapTop1,row.handicapSecond]
    .filter((x:any)=>["让胜","让平","让负"].includes(String(x??"")))
    .map((x:any)=>String(x)))];
  const type=strictAvoidEligible
    ?"FOCUS_AVOID"
    :riskPoolEligible&&hpicks.length>=2
      ?"HANDICAP_PROTECT"
      :riskPoolEligible
        ?"RISK_OBSERVE"
        :null;
  if(!type)return {...row,coldRoute:null};
  const avoidDirection=top1==="主胜"?"主队不胜":"主队不败";
  const ftPicks=top1==="主胜"?["平","客胜"]:["主胜","平"];
  const label=type==="FOCUS_AVOID"?"重点避开":type==="HANDICAP_PROTECT"?"让球保护":"风险观察";
  const direction=type==="FOCUS_AVOID"?avoidDirection:type==="HANDICAP_PROTECT"?hpicks.join(" / "):null;
  let settlement:any=null;
  if(row.resultVerified===true){
    if(type==="FOCUS_AVOID"){
      const actual=String(row.result??"")==="H"?"主胜":String(row.result??"")==="D"?"平":String(row.result??"")==="A"?"客胜":null;
      settlement=actual?{evaluable:true,hit:actual!==top1,label:actual!==top1?"避开成功":"避开失败",actual,basis:"胜平负双选避开"}:{evaluable:false,hit:null,label:"赛果未确认",actual:null,basis:"胜平负双选避开"};
    }else if(type==="HANDICAP_PROTECT"){
      const actual=["让胜","让平","让负"].includes(String(row.handicapResult??""))?String(row.handicapResult):null;
      settlement=actual?{evaluable:true,hit:hpicks.includes(actual),label:hpicks.includes(actual)?"让球保护命中":"让球保护未中",actual,basis:"让球Top1+第二方向双选"}:{evaluable:false,hit:null,label:"让球赛果未确认",actual:null,basis:"让球Top1+第二方向双选"};
    }else settlement={evaluable:false,hit:null,label:"风险观察不计成绩",actual:null,basis:"风险观察"};
  }
  return {...row,coldRoute:{
    ruleVersion:"HJ38-COLD-ROUTE-v0.1-20260930",
    visible:true,type,label,riskPoolEligible,strictAvoidEligible,
    originalTop1:top1,top1ConfidencePct:confidencePct,dq,riskScore:score,oppositeSecond,
    market:type==="HANDICAP_PROTECT"?"OFFICIAL_HHAD":type==="FOCUS_AVOID"?"FT_1X2":"OBSERVE",
    direction,
    picks:type==="FOCUS_AVOID"?ftPicks:type==="HANDICAP_PROTECT"?hpicks:[],
    primary:type==="HANDICAP_PROTECT"?(hpicks[0]??null):null,
    protection:type==="HANDICAP_PROTECT"?(hpicks[1]??null):null,
    officialHandicap:type==="HANDICAP_PROTECT"?row.officialHandicap:null,
    displayReason:type==="FOCUS_AVOID"
      ?"原Top1进入严格风险阀门，建议用胜平负双选防范"
      :type==="HANDICAP_PROTECT"
        ?"风险存在但未进入严格避开层，改用让球Top1+第二方向保护"
        :"存在风险信号，但赛前未形成完整让球双选",
    settlement
  }};
}
function publicHj38Choose(rows:any[],runById:Map<number,any>){const chosen=new Map<string,any>();for(const row of rows){const run=runById.get(Number(row.run_id));if(!run||Number(row.model_revision_id)!==Number(run.model_revision_id))continue;const frozen=Date.parse(String(row.frozen_at??"")),kickoff=Date.parse(String(row.kickoff_bjt??""));if(!Number.isFinite(frozen)||!Number.isFinite(kickoff)||frozen>=kickoff)continue;const key=String(row.match_no),prev=chosen.get(key);if(!prev){chosen.set(key,row);continue}const pf=Date.parse(String(prev.frozen_at)),cc=String(row.freeze_status??"").includes("CARRY_FORWARD"),pc=String(prev.freeze_status??"").includes("CARRY_FORWARD");if(frozen>pf||(frozen===pf&&pc&&!cc)||(frozen===pf&&pc===cc&&Number(row.run_id)>Number(prev.run_id)))chosen.set(key,row)}return[...chosen.values()].sort((a,b)=>String(a.match_no).localeCompare(String(b.match_no),"zh-CN",{numeric:true}))}
async function publicHj38Route(req:Request,u:URL){
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:publicHj38Cors});
  if(req.method!=="GET")return publicHj38Reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const view=u.searchParams.get("view")??"today",dateRaw=u.searchParams.get("date");
    if(!["today","history","archive"].includes(view))return publicHj38Reply({ok:false,error:"INVALID_VIEW"},400);
    if(dateRaw&&!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw))return publicHj38Reply({ok:false,error:"INVALID_DATE"},400);
    const s=adminClient();
    let runQ=s.from("hao_console_model_runs").select("id,model_name,model_version,pool_date,run_time,status,data_complete,formal_allowed,total_matches,model_revision_id,model_revision_tag").like("model_name","豪竞%").in("model_version",["3.3","3.6","3.8"]).gte("pool_date","2026-09-16").eq("data_complete",true).eq("formal_allowed",true).order("pool_date",{ascending:false}).order("run_time",{ascending:false}).limit(80);
    if(dateRaw)runQ=runQ.eq("pool_date",dateRaw);
    const{data:runs,error:runsError}=await runQ;if(runsError)throw runsError;
    const targetRun=(runs||[])[0];
    if(!targetRun)return publicHj38Reply({ok:true,view,date:dateRaw,count:0,sourceCount:0,model:"索伦引擎",modelVersion:null,revision:null,batchTime:null,dataTime:null,pregameVerifiedCount:0,rows:[]});
    const poolDate=String(targetRun.pool_date);
    const selectedRuns=(runs||[]).filter((r:any)=>String(r.pool_date)===poolDate&&String(r.model_version)===String(targetRun.model_version));
    const runIds=selectedRuns.map((r:any)=>Number(r.id));
    const{data:predictions,error:predError}=await s.from("hao_console_predictions").select("id,run_id,model_revision_id,pool_date,match_no,league,home_team,away_team,kickoff_bjt,top1,second_pick,confidence_label,anchor_status,hur,dtr,dlr,dq,top1_rejection,ticket_pick,keep_discard,official_handicap,handicap_pick,source_status,frozen_at,freeze_status,result_1x2,result_home,result_away,result_verified,ticket_pick_after_gate,updated_at").in("run_id",runIds).order("match_no",{ascending:true});
    if(predError)throw predError;
    const runById=new Map(selectedRuns.map((r:any)=>[Number(r.id),r]));
    let snapshots=publicHj38Choose(predictions||[],runById);
    const chosenIds=snapshots.map((r:any)=>Number(r.id));
    const[{data:top5Cfg,error:cfgError},{data:top5Rows,error:top5Error}]=await Promise.all([
      s.from("hao_hhad_top5_rollout_config_v01").select("active_mode,effective_at,revision").eq("singleton",true).maybeSingle(),
      chosenIds.length?s.from("hao_hhad_top5_output_v01").select("prediction_id,status,new_top1,new_second,new_probabilities,original_frozen_at").in("prediction_id",chosenIds):Promise.resolve({data:[],error:null})
    ]);
    if(cfgError)throw cfgError;if(top5Error)throw top5Error;
    const top5ByPrediction=new Map((top5Rows||[]).map((v:any)=>[Number(v.prediction_id),v]));
    const includeResult=view!=="today";
    if(includeResult){
      const verifiedByNo=new Map<string,any>();
      for(const row of predictions||[]){
        if(row.result_verified!==true)continue;
        const key=String(row.match_no),prev=verifiedByNo.get(key);
        if(!prev||Date.parse(String(row.updated_at||0))>Date.parse(String(prev.updated_at||0)))verifiedByNo.set(key,row);
      }
      snapshots=snapshots.map((row:any)=>{const v=verifiedByNo.get(String(row.match_no));return v?{...row,result_verified:true,result_1x2:v.result_1x2}:row});
    }
    const{data:scoreRows,error:scoreError}=await s.from("hao_score_top4_v38").select("pool_date,match_no,home_team,away_team,kickoff_at,source_frozen_at,engine_version,lambda_home,lambda_away,dc_rho,direction_beta,score_picks,odds_status,settlement_status,result_home,result_away,hit_score,hit_odds,result_source,settled_at").eq("pool_date",poolDate).eq("engine_version","HJ38-SCORE-TOP4-v1.0.0");
    if(scoreError)throw scoreError;
    const scoreByNo=new Map((scoreRows||[]).map((x:any)=>[String(x.match_no).padStart(3,"0"),x]));
    let rows=snapshots.map((row:any)=>{
      const mapped=publicHj38CustomerColdRoute(publicHj38ApplyTop5(publicHj38Map(row,runById.get(Number(row.run_id))??targetRun,includeResult),row,top5ByPrediction.get(Number(row.id)),top5Cfg));
      const score=scoreByNo.get(String(row.match_no).padStart(3,"0"));
      if(!score||String(score.home_team)!==String(row.home_team)||String(score.away_team)!==String(row.away_team))return mapped;
      const frozenAt=publicHj38Iso(score.source_frozen_at),kickoffAt=publicHj38Iso(score.kickoff_at);
      if(!frozenAt||!kickoffAt||Date.parse(frozenAt)>=Date.parse(kickoffAt))return mapped;
      const settled=includeResult&&["SUCCESS","FAILURE"].includes(String(score.settlement_status));
      return {...mapped,scoreTop4:{
        pregameVerified:true,
        engineVersion:score.engine_version,
        frozenAt,
        lambdaHome:Number(score.lambda_home),
        lambdaAway:Number(score.lambda_away),
        dcRho:Number(score.dc_rho),
        directionBeta:Number(score.direction_beta),
        picks:Array.isArray(score.score_picks)?score.score_picks:[],
        oddsStatus:score.odds_status,
        settlementStatus:settled?score.settlement_status:"PENDING",
        resultHome:settled?score.result_home:null,
        resultAway:settled?score.result_away:null,
        hitScore:settled?score.hit_score:null,
        hitOdds:settled&&score.hit_odds!==null?Number(score.hit_odds):null,
        resultSource:settled?score.result_source:null,
        settledAt:settled?publicHj38Iso(score.settled_at):null,
        note:score.odds_status==="MISSING"?"赔率未记录":"倍数仅采用赛前冻结的真实正确比分赔率"
      }};
    });
    if(view==="history")rows=rows.filter((r:any)=>r.pregameVerified&&r.resultVerified).slice(0,120);
    else rows=rows.filter((r:any)=>r.pregameVerified);
    const dataTime=rows.map((r:any)=>r.frozenAt).filter(Boolean).sort().at(-1)??null;
    const publishedWarnings=rows.filter((r:any)=>r.upsetWarning?.publish===true),upsetStats={modelVersion:publishedWarnings.map((r:any)=>r.upsetWarning?.modelVersion).find(Boolean)??'HJ38-UPSET-v1.1.0',published:publishedWarnings.length,high:publishedWarnings.filter((r:any)=>r.upsetWarning?.displayTier==='强风险信号'||r.upsetWarning?.riskLevel==='高').length,medium:publishedWarnings.filter((r:any)=>r.upsetWarning?.displayTier==='重点风险'||r.upsetWarning?.riskLevel==='中').length,directionPublished:publishedWarnings.filter((r:any)=>!!r.upsetWarning?.warningDirection).length,resultFieldsUsed:publishedWarnings.some((r:any)=>r.upsetWarning?.resultFieldsUsed===true),hurDirectionUsed:publishedWarnings.some((r:any)=>r.upsetWarning?.hurDirectionUsed===true)};
    const coldRows=rows.filter((r:any)=>r?.coldRoute?.visible===true);
    const coldFocus=coldRows.filter((r:any)=>r?.coldRoute?.type==="FOCUS_AVOID");
    const coldProtect=coldRows.filter((r:any)=>r?.coldRoute?.type==="HANDICAP_PROTECT");
    const coldObserve=coldRows.filter((r:any)=>r?.coldRoute?.type==="RISK_OBSERVE");
    const coldSettle=(items:any[])=>{const done=items.filter((r:any)=>r?.coldRoute?.settlement?.evaluable===true),hits=done.filter((r:any)=>r?.coldRoute?.settlement?.hit===true).length;return{published:items.length,settled:done.length,hits,misses:done.length-hits,hitRate:done.length?Math.round(hits/done.length*1000)/10:null}};
    const coldRouteStats={ruleVersion:"HJ38-COLD-ROUTE-v0.1-20260930",visible:coldRows.length,focusAvoid:coldSettle(coldFocus),handicapProtect:coldSettle(coldProtect),riskObserve:{published:coldObserve.length}};
    return publicHj38Reply({
      ok:true,view,date:poolDate,count:rows.length,sourceCount:Number(targetRun.total_matches||0),model:"索伦引擎",
      modelVersion:targetRun.model_version,revision:targetRun.model_revision_tag,
      batchTime:publicHj38Iso(targetRun.run_time),dataTime,
      pregameVerifiedCount:rows.filter((r:any)=>r.pregameVerified).length,upsetStats,coldRouteStats,rows
    });
  }catch(e){console.error(e);return publicHj38Reply({ok:false,error:"SOREN_PUBLIC_EXPORT_ERROR"},500)}
}


async function loadOkoooShadowDetail(s:any, run:any, row:any){
  try{
    const poolDate=String(run?.pool_date||"");
    const matchNo=Number(row?.match_no);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(poolDate)||!Number.isFinite(matchNo))return null;
    const {data:offering,error:oe}=await s.from("jc_offerings_2026")
      .select("id,offer_date,match_no,home_team,away_team,kickoff_local")
      .eq("offer_date",poolDate).eq("match_no",matchNo).maybeSingle();
    if(oe||!offering)return null;
    const {data:a,error:ae}=await s.from("hao_okooo_analysis_shadow_v01")
      .select("source_match_id,captured_at,timing_quality,market_status,intel_status,analysis")
      .eq("offering_id",offering.id).order("captured_at",{ascending:false}).limit(1).maybeSingle();
    if(ae||!a)return null;
    return {
      source:"澳客影子层",
      shadow_only:true,
      source_match_id:a.source_match_id,
      captured_at:a.captured_at,
      timing_quality:a.timing_quality,
      market_status:a.market_status,
      intel_status:a.intel_status,
      analysis:a.analysis||null
    };
  }catch{return null}
}

Deno.serve(async(req:Request)=>{const C=cors(),u=new URL(req.url);if(u.searchParams.get("public_hj38")==="1")return await publicHj38Route(req,u);if(req.method==="OPTIONS")return new Response(null,{status:204,headers:C});if(u.searchParams.get("login")==="1"&&req.method==="POST"){const body=await req.json().catch(()=>({})),username=String(body?.username||"").trim(),password=String(body?.password||"");if(username===USER&&await sha256Hex(password)===PASS_SHA256)return new Response(JSON.stringify({ok:true,token:await issueToken(USER)}),{headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});return new Response(JSON.stringify({ok:false,error:"账号或密码不正确"}),{status:401,headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}if(u.searchParams.get("health")==="1"){try{const s=adminClient();const {count,error}=await s.from("hao_console_model_runs").select("*",{head:true,count:"exact"});if(error)throw error;return new Response(JSON.stringify({status:"ok",runs:count||0,server_time:new Date().toISOString()}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}catch(e){return new Response(JSON.stringify({status:"error",message:e?.message||String(e)}),{status:500,headers:{"Content-Type":"application/json"}})}}if(u.searchParams.get("api")==="1"){if(!(await authorized(req))&&!(await internalAuthorized(req)))return new Response(JSON.stringify({ok:false,auth:false}),{status:401,headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});try{const __t0=performance.now();let __tModels=0,__tCore=0,__tAux=0;const s=adminClient(),runIdRaw=u.searchParams.get("run_id");if(u.searchParams.get("history")==="1"){const {data,error}=await s.from("hao_console_model_runs").select("id,model_name,model_version,model_revision_id,model_revision_tag,pool_date,pool_label,pool_kind,status,data_complete,formal_allowed,run_time,total_matches").order("pool_date",{ascending:false}).order("run_time",{ascending:false}).limit(80);if(error)throw error;return new Response(JSON.stringify({ok:true,history:data||[]}),{headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}if(runIdRaw){const id=Number(runIdRaw),matchNoRaw=u.searchParams.get("match_no"),{data:run,error:re}=await s.from("hao_console_model_runs").select("*").eq("id",id).maybeSingle();if(re)throw re;if(!run)return new Response(JSON.stringify({ok:false,error:"历史运行不存在"}),{status:404,headers:{...C,"Content-Type":"application/json"}});if(matchNoRaw){const {data:row,error:pe}=await s.from("hao_console_predictions").select("*").eq("run_id",id).eq("match_no",matchNoRaw).maybeSingle();if(pe)throw pe;if(!row)return new Response(JSON.stringify({ok:false,error:"逐场记录不存在"}),{status:404,headers:{...C,"Content-Type":"application/json"}});const okoooShadow=await loadOkoooShadowDetail(s,run,row);return new Response(JSON.stringify({ok:true,detail:{run,row:{...row,okooo_shadow:okoooShadow}}}),{headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}const {data:rows,error:pe}=await s.from("hao_console_predictions").select("*").eq("run_id",id).order("match_no",{ascending:true});if(pe)throw pe;const {data:score}=await s.from("hao_console_daily_scores").select("*").eq("source_run_id",id).maybeSingle();return new Response(JSON.stringify({ok:true,detail:{run,rows:rows||[],score:score||null}}),{headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}const {data:models,error:me}=await s.from("hao_model_registry").select("id,model_name,model_version,revision_tag,status,effective_at,source_file,change_type,notes").eq("status","active").order("effective_at",{ascending:false});if(me)throw me;__tModels=performance.now()-__t0;const active:any={};for(const m of models||[])if(!active[m.model_name])active[m.model_name]=m;const hjName=(models||[]).find((m:any)=>isHjModelName(String(m.model_name||"")))?.model_name||"豪竞2.3",hcName=(models||[]).find((m:any)=>isHcModelName(String(m.model_name||"")))?.model_name||"豪传2.3",hbName=(models||[]).find((m:any)=>isHbModelName(String(m.model_name||"")))?.model_name||"豪篮1.0";const [hj,hc,hb,cumulative]=await Promise.all([loadLatest(s,hjName),loadLatest(s,hcName),loadBasketballLatest(s,hbName),loadCumulative(s)]);__tCore=performance.now()-__t0-__tModels;
const hjDisplayRun=hj.display_run||hj.latest_attempt,hjDisplayRows=(hj.display_rows&&hj.display_rows.length?hj.display_rows:hj.latest_rows);
const hcDisplayRun=hc.display_run||hc.latest_attempt,hcDisplayRows=(hc.display_rows&&hc.display_rows.length?hc.display_rows:hc.latest_rows),hcLatestRun=hc.latest_attempt||hcDisplayRun;
const hcPreviousSettlement=await loadPreviousHcSettlement(s,hcName,hcLatestRun);
const hjDate=String(hjDisplayRun?.pool_date||""),hcDate=String(hcLatestRun?.pool_date||""),hcIssue=String(hcLatestRun?.pool_label||"");
const poolDate=hjDisplayRun?.pool_date||new Date().toISOString().slice(0,10);

const {data:optimalRouteData,error:optimalRouteError}=await s.from("hao_hj27_optimal_market_daily_v01")
  .select("prediction_id,run_id,pool_date,match_no,selected_market,selected_pick,selected_line,selected_price,selected_model_probability,selected_ev,route_status,route_reason,candidates,daily_tier,recommendation_rank,absolute_budget_cap_cny,frozen_at,model_revision_id,model_revision_tag,result_used,probability_core_unchanged,prospective_only")
  .eq("pool_date",poolDate);
if(optimalRouteError)throw optimalRouteError;
const optimalRouteByPrediction=new Map<number,any>();
for(const route of optimalRouteData||[])optimalRouteByPrediction.set(Number(route.prediction_id),route);
const hjRowsWithRoutes=hjDisplayRows.map((row:any)=>compactPredictionWithRoute(row,optimalRouteByPrediction.get(Number(row.id))));

const [
  healthRes,
  spRes,asiaRes,willRes,fotRes,selfRes,sloRes,snapRes,r9AutoRes
]=await Promise.all([
  s.from("hao_source_health_v01").select("source_code,source_role,status,last_attempt_at,last_success_at,latest_pool_date,expected_matches,mapped_matches,captured_matches,verified_matches,consecutive_failures,last_error,notes,updated_at").order("source_code",{ascending:true}),
  s.from("hao_jc_sp_mirror_raw_v01").select("source_code,match_no,market_type,captured_at,parse_status").eq("pool_date",poolDate),
  s.from("hao_market_raw_asia4_v01").select("institution_name,match_no,snapshot_type,captured_at,parse_status").eq("pool_date",poolDate),
  s.from("hao_market_raw_william_v01").select("source_code,match_no,captured_at,parse_status").eq("pool_date",poolDate),
  s.from("hao_fotmob_mid_poisson_base_v01").select("offering_id,home_hist_n,away_hist_n,lg_avg,fotmob_match_id,created_at").eq("offer_date",poolDate),
  s.from("hao_system_selfcheck_v01").select("id,checked_at,bjt_time,overall_status,run_status,actions,unresolved").order("checked_at",{ascending:false}).limit(1),
  s.from("hao_system_slo_v01").select("source_code,enabled,max_age_minutes,min_coverage_ratio,waiting_pool_ok,severity,notes,updated_at").eq("enabled",true).order("source_code",{ascending:true}),
  s.from("hao_system_daily_snapshot_v01").select("snapshot_date,created_at,notes").order("snapshot_date",{ascending:false}).limit(1),
  s.from("hao_r9_auto_status_v01").select("id,checked_at,stage,issue_no,status,error,details").order("checked_at",{ascending:false}).limit(1)
]);
for(const rr of [healthRes,spRes,asiaRes,willRes,fotRes,selfRes,sloRes,snapRes,r9AutoRes])if(rr.error)throw rr.error;
__tAux=performance.now()-__t0-__tModels-__tCore;const sh=(healthRes.data||[]).filter((x:any)=>!["jiebao","sina_xiaopao"].includes(String(x.source_code||"")));
const spr=spRes.data||[],asr=asiaRes.data||[],wrr=willRes.data||[],fbr=fotRes.data||[];
const selfRows=selfRes.data||[],sloRows=sloRes.data||[],snapRows=snapRes.data||[],r9AutoRows=r9AutoRes.data||[];
const systemHealth={latest:selfRows?.[0]||null,slo:sloRows||[],last_snapshot:snapRows?.[0]||null};
return new Response(JSON.stringify({ok:true,auth:true,server_time:new Date().toISOString(),api_profile:"v57-optimal-market-router-ui",api_timing:{models_ms:Math.round(__tModels),core_ms:Math.round(__tCore),aux_ms:Math.round(__tAux),before_json_ms:Math.round(performance.now()-__t0)},system_health:systemHealth,active_models:active,role_models:{hj:hjName,hc:hcName,hb:hbName},hj:{run:compactRun(hjDisplayRun,"hj"),latest_attempt:compactRun(hj.latest_attempt,"hj"),rows:hjRowsWithRoutes,optimal_market_daily:(optimalRouteData||[]).map(compactOptimalRoute),stats:hjStats(hjDisplayRows),source_snapshot:sourceSnapshot(hjDisplayRun,hjDisplayRows,sh,spr,asr,wrr),recommendations:recommendationState(hjDisplayRun,active[hjName])},hc:{run:compactRun(hcDisplayRun,"hc"),latest_attempt:compactRun(hc.latest_attempt,"hc"),rows:hcDisplayRows.map(compactPrediction),stats:hcStats(hcDisplayRows),source_snapshot:sourceSnapshot(hcDisplayRun,hcDisplayRows,sh,spr,asr,wrr),current_revision:modelMatch(hcDisplayRun,active[hcName]),runtime_status:r9AutoRows?.[0]||null,previous_settlement:hcPreviousSettlement},hb:{run:hb.latest_attempt,latest_attempt:hb.latest_attempt,rows:hb.rows,current_revision:modelMatch(hb.latest_attempt,active[hbName])},history:null,cumulative,sources:{health:sh.map(compactHealth),fotmob_hj:{matched:new Set(fbr.map((x:any)=>Number(x.offering_id))).size,rows:fbr.length,last_capture:latestIso(fbr,"created_at"),source_kind:"FotMob xG/近期状态/Poisson结构化数据"}}}),{headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}catch(e){return new Response(JSON.stringify({ok:false,error:e?.message||String(e)}),{status:500,headers:{...C,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}}return new Response(null,{status:302,headers:{Location:APP_ORIGIN+"/"}})});