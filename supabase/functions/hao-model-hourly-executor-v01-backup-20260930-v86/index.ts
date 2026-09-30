import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!, SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${SERVICE_KEY}`}}});
type R=Record<string,any>; type P={home:number,draw:number,away:number};
const PROV='豪竞active动态链｜3.3冻结基础 + 3.6平局路由 + 3.7 B+强单 + 3.8 B+双选 + 冷门预警分层v1.1｜William Hill 1X2 + Asia4 + 竞彩HAD/HHAD镜像 + Elo；API-Football Shadow';
const pad=(x:any)=>String(x).padStart(3,'0'), good=(r:R|null,ks:string[])=>!!r&&ks.every(k=>Number(r[k])>1);
function devig(h:any,d:any,a:any):P|null{h=+h;d=+d;a=+a;if(!(h>1&&d>1&&a>1))return null;const x=1/h,y=1/d,z=1/a,s=x+y+z;return{home:x/s,draw:y/s,away:z/s}}
function ordered(p:P){return([['主胜',p.home],['平',p.draw],['客胜',p.away]] as [string,number][]).sort((a,b)=>b[1]-a[1])}
function risk(v:number){return v>=.5?'红':v>=.4?'黄':'绿'} function tail(a:number,s:number){return a>=.25&&s>=.6?'红':a>=.2&&s>=.5?'黄':'绿'} function conf(p:number,g:number){return p>=.65&&g>=.25?'高':p>=.58&&g>=.15?'中高':p>=.5&&g>=.08?'中':'低'}
function ts(r:R){return new Date(r.fetched_at||r.captured_at||r.created_at||r.snapshot_at||r.reconstructed_at||0).getTime()}
function latest(rows:R[],fn:(r:R)=>boolean){return rows.filter(fn).sort((a,b)=>ts(b)-ts(a))[0]||null}
function parseAh(v:any){if(v==null)return null;const s=String(v).trim().replace(/−/g,'-').replace(/\+/g,'');if(/^-?\d+(\.\d+)?$/.test(s))return +s;const n=s.match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[];if(!n.length)return null;if(n.length===1)return n[0];return(s.startsWith('-')?-1:1)*(Math.abs(n[0])+Math.abs(n[1]))/2}
function median(xs:number[]){if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function chooseSp(rows:R[],id:number,t:string){const pri:R={okooo_sp_mirror:1,'500_sp_mirror':2,qiulaile_sp_mirror:3};return rows.filter(r=>+r.offering_id===id&&String(r.market_type).toUpperCase()===t&&good(r,['home_sp','draw_sp','away_sp'])).sort((a,b)=>(pri[a.source_code]||99)-(pri[b.source_code]||99)||ts(b)-ts(a))[0]||null}
function corr(a:R,b:R){return a.league===b.league&&a.top1===b.top1&&+a.deep_abs>=1&&+b.deep_abs>=1} function combos(a:R[],n:number){const o:R[][]=[];const f=(i:number,c:R[])=>{if(c.length===n){o.push(c);return}for(let j=i;j<a.length;j++)f(j+1,[...c,a[j]])};f(0,[]);return o}
function rec(c:R[]){const ps=combos(c,2).filter(x=>!corr(x[0],x[1])),ts3=combos(c,3).filter(x=>!x.some((a,i)=>x.slice(i+1).some(b=>corr(a,b))));const card=(x:R[],obj:string)=>{const p=x.reduce((v,q)=>v*q.p,1),od=x.reduce((v,q)=>v*q.sp,1);return{status:'READY',legs:x.map(q=>({match_no:q.match_no,pick:q.top1,p_final:q.p,sp:q.sp,tier:q.tier})),joint_probability:p,combo_odds:od,ev:p*od-1,objective:obj}};const A=[...ps].sort((x,y)=>y.reduce((v,q)=>v*q.p,1)-x.reduce((v,q)=>v*q.p,1))[0],B=[...ps].sort((x,y)=>y.reduce((v,q)=>v*q.p*q.sp,1)-x.reduce((v,q)=>v*q.p*q.sp,1))[0],C=[...ts3].sort((x,y)=>y.reduce((v,q)=>v*q.p*q.sp,1)-x.reduce((v,q)=>v*q.p*q.sp,1))[0];return{A:A?card(A,'prob'):{status:'PASS',reason:'不足2条正式HAD绿腿'},B:B?card(B,'ev'):{status:'PASS',reason:'不足2条正式HAD绿腿'},C:C?card(C,'ev'):{status:'PASS',reason:'不足3条正式HAD绿腿'}}}

function buildUpsetWarning(x:R){
  const top=String(x.originalTop1||''), allowed=new Set(['主胜','平','客胜']), evidence:R[]=[], votes:R[]=[];
  let score=0;
  const add=(domain:string,kind:string,detail:string,points:number,pick:any=null)=>{
    evidence.push({domain,kind,detail,points,pick:allowed.has(String(pick))?String(pick):null});
    score+=points;
    if(allowed.has(String(pick))&&String(pick)!==top)votes.push({domain,pick:String(pick),detail});
  };
  if(!allowed.has(top))return{status:'UNAVAILABLE',publish:false,risk_level:'未确认',risk_score:0,original_top1:x.originalTop1??null,warning_direction:null,alternative_pick:null,risk_basis:['原始首选未确认'],direction_basis:[],model_version:'HJ38-UPSET-v1.1.0',source_model_version:x.sourceModelVersion??null,source_revision:x.sourceRevision??null,prematch_at:x.frozenAt,result_fields_used:false,hur_direction_used:false};
  if(x.hur==='红')add('risk_head','generic','HUR热门失手风险红灯，仅计风险，不生成方向',2);
  else if(x.hur==='黄')add('risk_head','generic','HUR热门失手风险黄灯，仅计风险，不生成方向',1);
  if(x.dtr==='红')add('risk_head','generic','DTR平局风险红灯，仅计风险强度',1);
  if(x.dlr==='红')add('risk_head','generic','DLR直接输球风险红灯，仅计风险强度',1);
  if(x.confidence==='低')add('market_strength','generic','原始首选置信度偏低',1);
  if(Number.isFinite(Number(x.top1Prob))&&Number(x.top1Prob)<.5)add('market_strength','generic','原始首选概率低于50%',1);
  if(x.marketConflict&&allowed.has(String(x.hadTop))&&String(x.hadTop)!==top)add('sporttery_market','directional',`竞彩HAD首选${x.hadTop}与William原始首选${top}冲突`,2,x.hadTop);
  const scorePick=allowed.has(String(x.score?.dc_top1))?String(x.score.dc_top1):null;
  const scoreProb=(p:any)=>Number(p==='主胜'?x.score?.dc_p_home:p==='平'?x.score?.dc_p_draw:x.score?.dc_p_away);
  const modelPicks:string[]=[];
  if(scorePick&&scorePick!==top&&Number.isFinite(scoreProb(scorePick))&&scoreProb(scorePick)>=.30&&(!Number.isFinite(scoreProb(top))||scoreProb(scorePick)-scoreProb(top)>=.03))modelPicks.push(scorePick);
  const quantPick=allowed.has(String(x.quant?.quant_top1))?String(x.quant.quant_top1):null;
  if(quantPick&&quantPick!==top)modelPicks.push(quantPick);
  const modelConsensus=modelPicks.length&&(new Set(modelPicks)).size===1?modelPicks[0]:null;
  if(modelConsensus)add('independent_model','directional',`独立比分/Quant模型共同或唯一有效反证指向${modelConsensus}`,2,modelConsensus);
  else if((new Set(modelPicks)).size>1)add('independent_model','generic','独立模型之间方向分歧，不发布方向',1);
  const elo=x.elo||{},eloDiff=Number(elo.elo_diff),hg=Number(elo.home_games_seen),ag=Number(elo.away_games_seen);
  const eloReliable=Number.isFinite(eloDiff)&&hg>=10&&ag>=10&&elo.cold_start_home!==true&&elo.cold_start_away!==true&&Math.abs(eloDiff)>=50&&Math.abs(eloDiff)<=400&&(!elo.source_status||elo.source_status==='confirmed');
  const eloPick=eloReliable?(eloDiff>0?'主胜':'客胜'):null;
  if(eloPick&&eloPick!==top)add('elo','directional',`可靠Elo差${eloDiff.toFixed(1)}支持${eloPick}`,2,eloPick);
  const pro=(Array.isArray(x.professional)?x.professional:[]).map((r:R)=>String(r.pick_1x2||'')).filter((p:string)=>allowed.has(p));
  if(pro.length>=2){const counts:R={主胜:0,平:0,客胜:0};for(const p of pro)counts[p]++;const ordered=Object.entries(counts).sort((a:any,b:any)=>b[1]-a[1]);const pick=ordered[0][1]>pro.length/2?ordered[0][0]:null;if(pick&&pick!==top)add('professional_consensus','directional',`专业预测源${ordered[0][1]}/${pro.length}多数指向${pick}`,2,pick)}
  if(String(x.challenger?.challenger_action||'').includes('FLIP'))add('challenger','generic','Top1挑战器形成翻转级反证，仅作风险确认',1);
  else if(String(x.challenger?.challenger_action||'').includes('WATCH'))add('challenger','generic','Top1挑战器进入观察级反证',1);
  const grouped=new Map<string,R[]>();for(const v of votes){const a=grouped.get(v.pick)||[];a.push(v);grouped.set(v.pick,a)}
  const ranked=[...grouped.entries()].map(([pick,rows])=>({pick,rows,domains:new Set(rows.map(r=>r.domain)).size})).sort((a,b)=>b.domains-a.domains||b.rows.length-a.rows.length);
  const winner=ranked[0]||null,runner=ranked[1]||null,consensus=!!winner&&winner.domains>=2&&(!runner||winner.domains>runner.domains);
  // HJ38-UPSET v1.1 layering. Keep the legacy risk pool as the parent gate,
  // then publish only two prematch-only focus routes:
  // (1) FT Top1/second are opposite win directions; or
  // (2) second is draw and STRICT_PREMATCH_XG gives draw >= 27%.
  const second=String(x.secondPick||'');
  const oppositeSecond=['主胜','客胜'].includes(top)&&['主胜','客胜'].includes(second)&&second!==top;
  const independentDrawProbability=Number(x.score?.dc_p_draw);
  const qualifiedDraw=second==='平'&&x.score?.input_quality==='STRICT_PREMATCH_XG'&&
    Number.isFinite(independentDrawProbability)&&independentDrawProbability>=.27;
  const marketSignals=Array.isArray(x.marketSignals)?x.marketSignals.map(String).filter(Boolean):[];
  const marketAnomaly=x.marketAnomaly===true||marketSignals.length>0;
  const legacyRiskLevel=consensus&&score>=5?'高':score>=3?'中':'低';
  const legacyEligible=legacyRiskLevel!=='低';
  const focus=legacyEligible&&(oppositeSecond||qualifiedDraw);
  // Strong tier uses only the historically tested opposite-win route plus market anomaly.
  const strong=focus&&oppositeSecond&&marketAnomaly;
  const riskLevel=strong?'高':focus?'中':'低';
  const direction=consensus?(top==='主胜'?'主队不胜':top==='客胜'?'客队不胜':'平局不稳'):
    qualifiedDraw?'平局风险':null;
  const directionBasis=consensus?winner.rows.map((r:R)=>r.detail):
    qualifiedDraw?['独立STRICT_PREMATCH_XG平局概率'+(independentDrawProbability*100).toFixed(1)+'%达到27%防平门槛']:[];
  const alternative=consensus?winner.pick:qualifiedDraw?'平':null;
  return{
    status:'ACTIVE',publish:focus,risk_level:riskLevel,risk_score:score,
    original_top1:top,warning_direction:direction,alternative_pick:alternative,
    risk_basis:evidence.map(e=>e.detail),direction_basis:directionBasis,
    evidence_domains:[...new Set(evidence.map(e=>e.domain))],
    directional_domain_count:consensus?winner.domains:qualifiedDraw?1:0,
    display_tier:strong?'强风险信号':focus?'重点风险':legacyEligible?'一般风险':'无',
    detail_only:legacyEligible&&!focus,
    focus_gate:{legacy_risk:legacyEligible,opposite_second:oppositeSecond,qualified_draw:qualifiedDraw,market_anomaly:marketAnomaly},
    market_signals:marketSignals,
    independent_draw_probability:Number.isFinite(independentDrawProbability)?independentDrawProbability:null,
    model_version:'HJ38-UPSET-v1.1.0',source_model_version:x.sourceModelVersion??null,source_revision:x.sourceRevision??null,
    prematch_at:x.frozenAt,input_frozen_at:x.frozenAt,result_fields_used:false,hur_direction_used:false,
    note:strong?'重点预警叠加赛前市场异常，进入强风险信号层':
      focus?(qualifiedDraw&&!oppositeSecond?'合格独立进球模型开启防平通道':'首选与次选形成主客胜反向分歧'):
      legacyEligible?'存在一般风险迹象，但未通过重点预警门槛':'未达到预警门槛'
  };

}

async function replayUpsetWarnings(date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'2026-09-14'||date>'2026-09-20')throw Error('UPSET_REPLAY_DATE_OUT_OF_SCOPE');
  const [pq,oq,scoreq,quantq,proq]=await Promise.all([
    sb.from('hao_console_predictions').select('id,run_id,model_name,model_version,pool_date,match_no,league,home_team,away_team,kickoff_bjt,top1,second_pick,confidence_label,hur,dtr,dlr,source_status,frozen_at,freeze_status,model_revision_id,model_revision_tag').eq('pool_date',date).order('frozen_at',{ascending:true}).limit(1000),
    sb.from('jc_offerings_2026').select('id,match_no,league,home_team,away_team,kickoff_local').eq('offer_date',date).eq('is_world_cup',false).order('match_no').limit(200),
    sb.from('hao_hj_score_engine_shadow_v01').select('offering_id,dc_top1,dc_p_home,dc_p_draw,dc_p_away,input_quality,created_at').eq('offer_date',date).eq('input_quality','STRICT_PREMATCH_XG').order('created_at',{ascending:true}).limit(1000),
    sb.from('hao_quant24_shadow_v01').select('offering_id,quant_top1,snapshot_at').eq('offer_date',date).order('snapshot_at',{ascending:true}).limit(1000),
    sb.from('hao_professional_predictions_live_v01').select('offering_id,source_code,pick_1x2,fetched_at,source_status').eq('offer_date',date).order('fetched_at',{ascending:true}).limit(1000)
  ]);
  for(const q of [pq,oq,scoreq,quantq,proq])if(q.error)throw q.error;
  const predictions=pq.data||[],offers=oq.data||[],scores=scoreq.data||[],quants=quantq.data||[],pros=proq.data||[];
  const offerByNo=new Map(offers.map((o:R)=>[pad(o.match_no),o]));
  const chosen=new Map<string,R>();
  for(const p of predictions){
    const no=pad(p.match_no),f=Date.parse(String(p.frozen_at||'')),k=Date.parse(String(p.kickoff_bjt||''));
    if(!Number.isFinite(f)||!Number.isFinite(k)||f>=k)continue;
    const prev=chosen.get(no);
    if(!prev){chosen.set(no,p);continue}
    const pf=Date.parse(String(prev.frozen_at||'')),carry=String(p.freeze_status||'').includes('CARRY_FORWARD'),pcarry=String(prev.freeze_status||'').includes('CARRY_FORWARD');
    if(f>pf||(f===pf&&pcarry&&!carry)||(f===pf&&pcarry===carry&&Number(p.run_id)>Number(prev.run_id)))chosen.set(no,p);
  }
  const latestAsOf=(rows:R[],offeringId:number,cutoff:number)=>rows.filter((x:R)=>Number(x.offering_id)===offeringId&&ts(x)<=cutoff).sort((a:R,b:R)=>ts(b)-ts(a))[0]||null;
  const output:R[]=[];
  for(const p of [...chosen.values()].sort((a:R,b:R)=>String(a.match_no).localeCompare(String(b.match_no),'zh-CN',{numeric:true}))){
    const no=pad(p.match_no),offer=offerByNo.get(no),cutoff=Date.parse(String(p.frozen_at)),ss=p.source_status||{},offeringId=Number(offer?.id||0);
    const score=offeringId?latestAsOf(scores,offeringId,cutoff):null,quant=offeringId?latestAsOf(quants,offeringId,cutoff):null;
    const proBySource=new Map<string,R>();
    for(const pr of pros.filter((x:R)=>Number(x.offering_id)===offeringId&&ts(x)<=cutoff)){const key=String(pr.source_code||pr.id||''),prev=proBySource.get(key);if(!prev||ts(pr)>ts(prev))proBySource.set(key,pr)}
    const topProb=Number(ss.top1_prob??ss.p_raw?.[p.top1==='主胜'?'home':p.top1==='平'?'draw':'away']);
    const warning=buildUpsetWarning({originalTop1:p.top1,secondPick:p.second_pick,top1Prob:Number.isFinite(topProb)?topProb:null,confidence:p.confidence_label,hur:p.hur,dtr:p.dtr,dlr:p.dlr,hadTop:ss.sp_top1,marketConflict:ss.market_direction_conflict===true,score,quant,elo:ss.elo||null,professional:[...proBySource.values()],challenger:ss.top1_challenger_v02||null,frozenAt:p.frozen_at,sourceModelVersion:p.model_version,sourceRevision:p.model_revision_tag});
    Object.assign(warning,{replay_mode:'STRICT_PREMATCH_FROZEN_SNAPSHOT',replayed_at:new Date().toISOString(),evidence_cutoff_at:p.frozen_at,source_prediction_id:p.id,source_run_id:p.run_id,source_model_revision_id:p.model_revision_id,history_rewrite:false,result_query:false});
    output.push({date:p.pool_date,no,league:p.league,home:p.home_team,away:p.away_team,kickoff:p.kickoff_bjt,ftTop1:p.top1,second:p.second_pick,frozenAt:p.frozen_at,pregameVerified:true,version:p.model_version,revision:p.model_revision_tag,upsetWarning:warning});
  }
  const published=output.filter(r=>r.upsetWarning?.publish===true);
  return{ok:true,replay:true,read_only:true,date,count:output.length,published:published.length,high:published.filter(r=>r.upsetWarning?.risk_level==='高').length,medium:published.filter(r=>r.upsetWarning?.risk_level==='中').length,directionPublished:published.filter(r=>!!r.upsetWarning?.warning_direction).length,warningModelVersion:'HJ38-UPSET-v1.1.0',resultFieldsUsed:false,hurDirectionUsed:false,historyRewrite:false,rows:output};
}

Deno.serve(async(req)=>{const freeze=new Date();try{const u=new globalThis.URL(req.url),dry=u.searchParams.get('dry_run')==='1',replay=u.searchParams.get('upset_replay')==='1';let date=u.searchParams.get('date');if(!date){const h=await sb.from('hao_source_health_v01').select('latest_pool_date').eq('source_code','jc_pool_discovery').maybeSingle();date=h.data?.latest_pool_date||null}if(!date)throw Error('CURRENT_SALE_DATE_UNCONFIRMED');if(replay)return Response.json(await replayUpsetWarnings(date));
const asiaQs=['1','11','18','31'].map(code=>sb.from('hao_market_raw_asia4_v01').select('*').eq('pool_date',date).eq('institution_code',code).lte('fetched_at',freeze.toISOString()).order('fetched_at',{ascending:false}).limit(1000));
const [mq,oq,wq,sq,eq,pq,cq,scoreq,quantq,prevq,...aqs]=await Promise.all([
sb.from('hao_model_registry').select('id,model_name,model_version,revision_tag,model_json').eq('status','active').like('model_name','豪竞%').order('effective_at',{ascending:false}).limit(1).single(),
sb.from('jc_offerings_2026').select('id,match_no,league,home_team,away_team,kickoff_local,handicap_line').eq('offer_date',date).eq('is_world_cup',false).order('match_no'),
sb.from('hao_market_raw_william_v01').select('*').eq('pool_date',date).lte('fetched_at',freeze.toISOString()),
sb.from('hao_jc_sp_mirror_raw_v01').select('*').eq('pool_date',date).lte('fetched_at',freeze.toISOString()),
sb.from('hao_elo_live_v01').select('*').eq('offer_date',date),
sb.from('hao_professional_predictions_live_v01').select('*').eq('offer_date',date).lte('fetched_at',freeze.toISOString()),
sb.from('hao_api_football_odds_cache_v01').select('*').eq('offer_date',date).eq('parse_status','verified').gt('expires_at',freeze.toISOString()),
sb.from('hao_hj_score_engine_shadow_v01').select('*').eq('offer_date',date).eq('input_quality','STRICT_PREMATCH_XG').lte('created_at',freeze.toISOString()),
sb.from('hao_quant24_shadow_v01').select('*').eq('offer_date',date).lte('snapshot_at',freeze.toISOString()),
sb.from('hao_console_predictions').select('*').eq('pool_date',date).order('run_id',{ascending:false}),...asiaQs]);
for(const q of [mq,oq,wq,sq,eq,pq,cq,scoreq,quantq,prevq,...aqs])if(q.error)throw q.error;
const model=mq.data,offers=oq.data||[],W=wq.data||[],A=aqs.flatMap((q:any)=>q.data||[]),S=sq.data||[],E=eq.data||[],PRO=pq.data||[],API=cq.data||[],SCORE=scoreq.data||[],QUANT=quantq.data||[],PREV=prevq.data||[];
if(!offers.length)throw Error('EMPTY_JC_SALE_POOL');
const cfg=model.model_json?.top1_challenger_gate_v02||null, ep=cfg?.execution_params||{}, chEnabled=String(cfg?.status||'').startsWith('ACTIVE_SHADOW');
const eligibleConf:string[]=Array.isArray(ep.eligible_confidence)?ep.eligible_confidence:['低','中'], dqAllowed:string[]=Array.isArray(ep.dq_allowed)?ep.dq_allowed:['DQ-A','DQ-B'];
const drawScoreMin=Number(ep.draw_score_prob_min??0.25), drawLowMin=Number(ep.draw_low_score_mass_min??0.25), drawEloMax=Number(ep.draw_elo_abs_diff_max??25), drawEloGames=Number(ep.draw_elo_games_each_min??10), drawWatchMin=Number(ep.draw_watch_nonmodel_min??2), winScoreGap=Number(ep.win_score_advantage_min??0.05), winEloMin=Number(ep.win_elo_abs_diff_min??50), winEloGames=Number(ep.win_elo_games_each_min??10);
const ds:R[]=[],cs:R[]=[];
for(const o of offers){const mn=pad(o.match_no),ko=new Date(String(o.kickoff_local)+'+08:00');if(freeze>=ko){const old=PREV.find((r:R)=>r.match_no===mn&&r.frozen_at&&new Date(r.frozen_at)<ko&&!String(r.freeze_status||'').includes('POST_KICKOFF_NO_PREMATCH_FREEZE'));if(old){const ss={...(old.source_status||{}),prematch_lock:true,prematch_lock_status:'LOCKED_PREMATCH',bettable_now:false,abc_candidate:false,final_selection_eligible:false,had_selection_eligible:false,carried_forward_at:freeze.toISOString(),api_football_odds_shadow:{status:'SHADOW_ONLY',fresh_rows:API.filter((x:R)=>+x.offering_id===+o.id).length,formal_weight_change:false}};ds.push({offering_id:o.id,match_no:old.match_no,league:old.league,home_team:old.home_team,away_team:old.away_team,kickoff_bjt:old.kickoff_bjt,top1:old.top1,second_pick:old.second_pick,confidence_label:old.confidence_label,anchor_status:old.anchor_status,hur:old.hur,dtr:old.dtr,dlr:old.dlr,dq:old.dq,hps:old.hps,official_handicap:old.official_handicap,handicap_pick:old.handicap_pick,source_status:ss,frozen_at:old.frozen_at,freeze_status:'PREMATCH_LOCKED_CARRY_FORWARD',model_revision_id:old.model_revision_id,model_revision_tag:old.model_revision_tag,final_handling:'PREMATCH_LOCKED_CARRY_FORWARD'});continue}ds.push({offering_id:o.id,match_no:mn,league:o.league,home_team:o.home_team,away_team:o.away_team,kickoff_bjt:ko.toISOString(),top1:null,second_pick:null,confidence_label:'未确认',anchor_status:'NO_FORMAL_ANCHOR',hur:'未确认',dtr:'未确认',dlr:'未确认',dq:'DQ-C',hps:'已开球且无赛前冻结，禁止事后补算',official_handicap:o.handicap_line,handicap_pick:'PASS',source_status:{engine:'v82-hj38-upset-v1.1-active-runtime',prematch_lock:true,final_selection_eligible:false,upset_warning:{status:'UNAVAILABLE',publish:false,risk_level:'未确认',risk_score:0,original_top1:null,warning_direction:null,alternative_pick:null,risk_basis:['已开球且无合法赛前冻结，禁止补算'],direction_basis:[],model_version:'HJ38-UPSET-v1.1.0',source_model_version:model.model_version,source_revision:model.revision_tag,prematch_at:null,result_fields_used:false,hur_direction_used:false},top1_challenger_v02:{status:'POST_KICKOFF_NO_PREMATCH_FREEZE',formal_top1_unchanged:true}},frozen_at:freeze.toISOString(),freeze_status:'POST_KICKOFF_NO_PREMATCH_FREEZE',model_revision_id:model.id,model_revision_tag:model.revision_tag,final_handling:'POST_KICKOFF_NO_PREMATCH_FREEZE'});continue}
const wr=W.filter((x:R)=>+x.offering_id===+o.id&&good(x,['odds_home','odds_draw','odds_away'])),wc=latest(wr,x=>String(x.snapshot_type||'').toLowerCase()==='current')||latest(wr,()=>true),p=wc?devig(wc.odds_home,wc.odds_draw,wc.odds_away):null,asia:R[]=[];
for(const code of ['1','11','18','31']){const r=latest(A,x=>+x.offering_id===+o.id&&String(x.institution_code)===code&&(!x.parse_status||x.parse_status==='verified')&&String(x.snapshot_type||'').toLowerCase()==='current')||latest(A,x=>+x.offering_id===+o.id&&String(x.institution_code)===code&&(!x.parse_status||x.parse_status==='verified'));if(r)asia.push(r)}
const deep=median(asia.map(x=>parseAh(x.handicap_line)).filter((x:any)=>x!=null).map((x:number)=>Math.abs(x))),had=chooseSp(S,+o.id,'HAD'),hhad=chooseSp(S,+o.id,'HHAD'),hadP=had?devig(had.home_sp,had.draw_sp,had.away_sp):null;
let top:string|null=null,second:string|null=null,tp:number|null=null,gap:number|null=null,H='未确认',D='未确认',L='未确认',cl='未确认';if(p){const x=ordered(p);top=x[0][0];tp=x[0][1];second=x[1][0];gap=x[0][1]-x[1][1];const t=1-tp;H=risk(t);if(top==='平'){D='NA';L='NA'}else{const op=top==='主胜'?p.away:p.home;D=tail(p.draw,p.draw/t);L=tail(op,op/t)}cl=conf(tp,gap)}
const hadTop=hadP?ordered(hadP)[0][0]:null,aligned=!!top&&hadTop===top,dq=p&&asia.length>=4&&had&&hhad?'DQ-A':p&&asia.length>=3&&had?'DQ-B':'DQ-C',elo=latest(E,x=>+x.offering_id===+o.id),pro=PRO.filter((x:R)=>+x.offering_id===+o.id&&['主胜','平','客胜'].includes(x.pick_1x2)),eloRev=!!elo&&((top==='主胜'&&+elo.elo_diff<0)||(top==='客胜'&&+elo.elo_diff>0)),proRev=pro.length>0&&pro.filter((x:R)=>x.pick_1x2!==top).length>pro.length/2,marketConflict=!!top&&!!hadTop&&!aligned,baseRed=[H,D,L].includes('红'),Aok=!!p&&['DQ-A','DQ-B'].includes(dq)&&top!=='平'&&H==='绿'&&D!=='红'&&L!=='红'&&Number(tp)>=.58&&Number(gap)>=.15&&asia.length>=3&&deep!=null&&deep>=1&&!!had&&aligned,Bok=!!p&&['DQ-A','DQ-B'].includes(dq)&&top!=='平'&&Number(tp)>=.55&&Number(gap)>=.20&&H==='绿'&&L==='绿'&&D!=='红'&&asia.length>=3&&!!had&&aligned&&!marketConflict&&!eloRev&&!proRev;
let light='YELLOW',tier:string|null=null,eligible=false,reason='未达A/B绿条件';if(baseRed){light='RED';reason='HUR/DTR/DLR存在红灯'}else if(Aok){light='GREEN';tier='A';eligible=true;reason='A绿质量Gate通过'}else if(Bok){light='GREEN';tier='B';eligible=true;reason='严格B绿救援通过'}
const wi=latest(wr,x=>String(x.snapshot_type||'').toLowerCase()==='initial');
const williamInitialTop=top&&wi?Number(top==='主胜'?wi.odds_home:top==='客胜'?wi.odds_away:NaN):NaN;
const williamCurrentTop=top&&wc?Number(top==='主胜'?wc.odds_home:top==='客胜'?wc.odds_away:NaN):NaN;
const williamRise=Number.isFinite(williamInitialTop)&&Number.isFinite(williamCurrentTop)&&
  (williamCurrentTop-williamInitialTop>=.08||williamCurrentTop/williamInitialTop>=1.05);
const a365=A.filter((x:R)=>+x.offering_id===+o.id&&String(x.institution_code)==='1'&&(!x.parse_status||x.parse_status==='verified'));
const a365i=latest(a365,x=>String(x.snapshot_type||'').toLowerCase()==='initial');
const a365c=latest(a365,x=>String(x.snapshot_type||'').toLowerCase()==='current')||latest(a365,()=>true);
const a365InitLine=parseAh(a365i?.handicap_line),a365CurrentLine=parseAh(a365c?.handicap_line);
const asiaRetreat=a365InitLine!=null&&a365CurrentLine!=null&&Math.abs(a365CurrentLine)+.24<=Math.abs(a365InitLine);
const marketSignals:string[]=[];
if(williamRise)marketSignals.push('William原首选方向相对初赔明显升赔');
if(asiaRetreat)marketSignals.push('Bet365亚洲盘较初盘退约0.25档或以上');
if(marketConflict)marketSignals.push('竞彩HAD首选与William原始首选方向冲突');
const marketAnomaly=marketSignals.length>0;
const score=latest(SCORE,x=>+x.offering_id===+o.id&&x.created_at&&new Date(x.created_at)<ko),quant=latest(QUANT,x=>+x.offering_id===+o.id&&x.snapshot_at&&new Date(x.snapshot_at)<ko),eloPre=latest(E,x=>+x.offering_id===+o.id&&x.reconstructed_at&&new Date(x.reconstructed_at)<ko);
let ch:R={status:chEnabled?'ACTIVE_SHADOW':'DISABLED',market_top1:top,challenger_action:'KEEP',challenger_pick:null,shadow_final_top1:top,formal_top1_unchanged:true,formal_abc_unchanged:true,selection_isolation:true};
if(chEnabled&&top&&second&&eligibleConf.includes(cl)&&dqAllowed.includes(dq)&&['主胜','客胜'].includes(top)){
 const marketDraw=second==='平',riskDraw=['黄','红'].includes(D),scoreDraw=!!score&&(Number(score.dc_p_draw)>=drawScoreMin||Number(score.low_score_draw_mass)>=drawLowMin),quantDraw=!!quant&&(quant.quant_top1==='平'||quant.quant_second==='平'),modelDraw=scoreDraw||quantDraw,eloDraw=!!eloPre&&Number(eloPre.home_games_seen)>=drawEloGames&&Number(eloPre.away_games_seen)>=drawEloGames&&eloPre.cold_start_home!==true&&eloPre.cold_start_away!==true&&Math.abs(Number(eloPre.elo_diff))<=drawEloMax,nonModel=[marketDraw,riskDraw,eloDraw].filter(Boolean).length;
 const drawWatch=modelDraw&&nonModel>=drawWatchMin,drawFlip=modelDraw&&marketDraw&&riskDraw&&eloDraw;
 const sp2=second==='主胜'?Number(score?.dc_p_home):second==='客胜'?Number(score?.dc_p_away):NaN,spo=top==='主胜'?Number(score?.dc_p_home):top==='客胜'?Number(score?.dc_p_away):NaN;
 const scoreWin=!!score&&['主胜','客胜'].includes(second)&&score.dc_top1===second&&Number.isFinite(sp2)&&Number.isFinite(spo)&&(sp2-spo)>=winScoreGap;
 const eloWin=!!eloPre&&['主胜','客胜'].includes(second)&&Number(eloPre.home_games_seen)>=winEloGames&&Number(eloPre.away_games_seen)>=winEloGames&&eloPre.cold_start_home!==true&&eloPre.cold_start_away!==true&&Math.abs(Number(eloPre.elo_diff))>=winEloMin&&((second==='主胜'&&Number(eloPre.elo_diff)>0)||(second==='客胜'&&Number(eloPre.elo_diff)<0));
 const winFlip=scoreWin&&eloWin;
 if(drawFlip){ch.challenger_action='SHADOW_FLIP_DRAW';ch.challenger_pick='平';ch.shadow_final_top1='平'}else if(winFlip){ch.challenger_action='SHADOW_FLIP_WIN';ch.challenger_pick=second;ch.shadow_final_top1=second}else if(drawWatch){ch.challenger_action='CHALLENGE_DRAW_WATCH';ch.challenger_pick='平'}
 ch.challenger_domains={market_draw:marketDraw,dtr_draw:riskDraw,score_draw:scoreDraw,quant_draw:quantDraw,model_family_draw:modelDraw,elo_parity:eloDraw,nonmodel_supports:nonModel,score_win:scoreWin,elo_win:eloWin};
 ch.inputs={score_created_at:score?.created_at||null,score_dc_p_draw:score?.dc_p_draw??null,score_low_draw_mass:score?.low_score_draw_mass??null,quant_snapshot_at:quant?.snapshot_at||null,quant_top1:quant?.quant_top1||null,quant_second:quant?.quant_second||null,elo_reconstructed_at:eloPre?.reconstructed_at||null,elo_diff:eloPre?.elo_diff??null};
}
const topSp=had&&top?Number(top==='主胜'?had.home_sp:top==='平'?had.draw_sp:had.away_sp):null;
const nativeCandidate=!!p&&!eligible&&!!top&&!!second&&['DQ-A','DQ-B'].includes(dq)&&asia.length>=4&&!!had&&aligned;
let formalRule:string|null=null,bplusTicket:string|null=null;
if(nativeCandidate&&dq==='DQ-C'&&H==='绿'&&D==='绿'&&L==='绿'&&cl==='高'&&Number(tp)>=.70){formalRule='BPLUS_STRONG_SINGLE_V01';bplusTicket=top;eligible=true;light='GREEN';tier='B+';reason='豪竞3.8 B+强单';}
else if(nativeCandidate&&topSp!=null&&topSp>=2&&topSp<2.5&&H!=='红'&&D!=='红'&&L!=='红' || nativeCandidate&&topSp!=null&&topSp>=2&&topSp<2.5&&H==='红'&&D!=='红'&&L!=='红'&&deep!=null&&deep>=0.25){formalRule='BPLUS_DOUBLE_SP200_249_V01';bplusTicket=top+'+'+second;eligible=true;light='GREEN';tier='B+双选';reason=H==='红'?'豪竞3.8 B+双选（HUR红但DTR/DLR无红且Deep≥0.25）':'豪竞3.8 B+双选';}
const apiRows=API.filter((x:R)=>+x.offering_id===+o.id),upset=buildUpsetWarning({originalTop1:top,secondPick:second,top1Prob:tp,confidence:cl,hur:H,dtr:D,dlr:L,hadTop,marketConflict,score,quant,elo:eloPre,professional:pro,challenger:ch,marketAnomaly,marketSignals,frozenAt:freeze.toISOString(),sourceModelVersion:model.model_version,sourceRevision:model.revision_tag}),ss={engine:'v82-hj38-upset-v1.1-active-runtime',upset_warning:upset,formal_rule_applied:formalRule,bplus_ticket:bplusTicket,p_raw:p,p_final:p,top1_prob:tp,gap,base_risk_light:baseRed?'RED':[H,D,L].includes('黄')?'YELLOW':'GREEN',final_selection_light:light,final_selection_reason:reason,final_selection_eligible:eligible,had_selection_eligible:eligible,selection_tier:tier,abc_candidate:eligible,asia4_institutions:asia.length,asia4_codes:asia.map(x=>String(x.institution_code)),deep_gate_median_abs:deep,had_source_code:had?.source_code||null,hhad_source_code:hhad?.source_code||null,sp_top1:hadTop,top1_sp:topSp,market_direction_conflict:marketConflict,elo:elo||null,intelligence_center_status:'ACTIVE_SHARED_R9_HJ_V02',bettable_now:true,prematch_lock:false,top1_challenger_v02:ch,api_football_odds_shadow:{status:'SHADOW_ONLY',fresh_rows:apiRows.length,william_rows:apiRows.filter((x:R)=>+x.bookmaker_id===7).length,bet365_rows:apiRows.filter((x:R)=>+x.bookmaker_id===8).length,formal_weight_change:false,may_change_top1:false,may_change_abc_or_ticket:false}},handling=!p?'PASS_DATA_INCOMPLETE':eligible?`${tier}_GREEN_HAD_ELIGIBLE`:baseRed?'NO_ANCHOR_RED':'REVIEW_YELLOW',hps=p?`FT ${top} ${(Number(tp)*100).toFixed(1)}%；HUR ${H}/DTR ${D}/DLR ${L}；Asia4 ${asia.length}/4；Deep ${deep??'未确认'}；Challenger ${ch.challenger_action}；${tier?tier+'绿':'未入绿'}`:'William P_raw未确认，PASS',d={offering_id:o.id,match_no:mn,league:o.league,home_team:o.home_team,away_team:o.away_team,kickoff_bjt:ko.toISOString(),top1:top,second_pick:second,confidence_label:cl,anchor_status:eligible?'HAD_ANCHOR_ELIGIBLE':baseRed?'NO_ANCHOR_RED':'REVIEW_YELLOW',hur:H,dtr:D,dlr:L,dq,hps,official_handicap:o.handicap_line,handicap_pick:'PASS',source_status:ss,frozen_at:freeze.toISOString(),freeze_status:'formal_runtime_v82_hj38_upset_v1_active',model_revision_id:model.id,model_revision_tag:model.revision_tag,final_handling:handling};ds.push(d);if(eligible&&topSp&&tp)cs.push({match_no:mn,league:o.league,top1:top,p:Number(tp),sp:topSp,deep_abs:deep,tier})}
const recs=rec(cs),apiSummary={status:'SHADOW_ONLY',fresh_cache_rows:API.length,fresh_offerings:new Set(API.map((x:R)=>x.offering_id)).size,william_rows:API.filter((x:R)=>+x.bookmaker_id===7).length,bet365_rows:API.filter((x:R)=>+x.bookmaker_id===8).length,formal_weight_change:false,quota_policy:'exact fixture+bookmaker; max4/run; cap36/day; quota floor25'},challengerSummary={status:chEnabled?'ACTIVE_SHADOW':'DISABLED',draw_watch:ds.filter(d=>d.source_status?.top1_challenger_v02?.challenger_action==='CHALLENGE_DRAW_WATCH').length,draw_flip:ds.filter(d=>d.source_status?.top1_challenger_v02?.challenger_action==='SHADOW_FLIP_DRAW').length,win_flip:ds.filter(d=>d.source_status?.top1_challenger_v02?.challenger_action==='SHADOW_FLIP_WIN').length,formal_top1_unchanged:true,formal_abc_unchanged:true},dataComplete=!ds.some(d=>d.freeze_status==='POST_KICKOFF_NO_PREMATCH_FREEZE'),raw={executor:'hao-model-hourly-executor-v01-v82-hj38-upset-v1-active',total_matches:ds.length,formal_had_legs:cs.length,budget_cap_rmb:64,recommendations:recs,challenger_v02:challengerSummary,upset_warning_v01:{model_version:'HJ38-UPSET-v1.1.0',high:ds.filter(d=>d.source_status?.upset_warning?.risk_level==='高').length,medium:ds.filter(d=>d.source_status?.upset_warning?.risk_level==='中').length,published:ds.filter(d=>d.source_status?.upset_warning?.publish===true).length,direction_published:ds.filter(d=>!!d.source_status?.upset_warning?.warning_direction).length,result_fields_used:false,hur_direction_used:false},api_football_odds_shadow:apiSummary,detail_rows:ds};
if(dry)return Response.json({ok:true,dry_run:true,sale_date:date,total_matches:ds.length,model_revision_id:model.id,model_revision_tag:model.revision_tag,data_complete:dataComplete,formal_allowed:dataComplete,formal_had_legs:cs.length,recommendations:recs,challenger_v02:challengerSummary,upset_warning_v01:raw.upset_warning_v01,api_football_odds_shadow:apiSummary,asia4_loaded_rows:A.length,executor:'v82-hj38-upset-v1-active'});
const run={model_name:model.model_name,model_version:model.model_version,pool_date:date,pool_kind:'HJ',pool_label:'当前竞彩销售池',official_range:`${ds[0].match_no}-${ds[ds.length-1].match_no}`,total_matches:ds.length,run_time:freeze.toISOString(),status:'formal_runtime_complete_v82_hj38_upset_v1_active',data_complete:dataComplete,formal_allowed:dataComplete,source_provenance:PROV,notes:'豪竞3.8 active同步执行链：继承冻结基础链，接入正式B+强单/B+双选及实时冷门预警v1.0；预警不改Top1/让球/单双选；HUR仅作风险强度，不生成方向；禁止世界杯、赛果倒灌和历史回写。',raw_summary:raw,model_revision_id:model.id,model_revision_tag:model.revision_tag};const ri=await sb.from('hao_console_model_runs').insert(run).select('id').single();if(ri.error)throw ri.error;
const rows=ds.map(d=>({run_id:ri.data.id,model_name:model.model_name,model_version:model.model_version,pool_date:date,match_no:d.match_no,league:d.league,home_team:d.home_team,away_team:d.away_team,kickoff_bjt:d.kickoff_bjt,top1:d.top1,second_pick:d.second_pick,confidence_label:d.confidence_label,anchor_status:d.anchor_status,hur:d.hur,dtr:d.dtr,dlr:d.dlr,strong_conflict:d.source_status?.market_direction_conflict?'MARKET_DIRECTION_CONFLICT':null,top1_rejection:d.source_status?.final_selection_eligible?null:d.source_status?.final_selection_reason||d.final_handling,final_handling:d.final_handling,ticket_pick:d.source_status?.final_selection_eligible?(d.source_status?.bplus_ticket||d.top1):null,keep_discard:d.source_status?.final_selection_eligible?'KEEP':'DISCARD',dq:d.dq,hps:d.hps,official_handicap:d.official_handicap,handicap_pick:d.handicap_pick,source_status:d.source_status,source_provenance:PROV,frozen_at:d.frozen_at,freeze_status:d.freeze_status,result_verified:false,model_revision_id:d.model_revision_id,model_revision_tag:d.model_revision_tag,semantic_direction:d.top1,ticket_pick_before_gate:d.top1,ticket_pick_after_gate:d.source_status?.final_selection_eligible?(d.source_status?.bplus_ticket||d.top1):null,direction_consistency_status:d.source_status?.had_source_code?(d.source_status.sp_top1===d.top1?'ALIGNED':'CONFLICT'):'UNCONFIRMED',direction_consistency_reason:d.source_status?.had_source_code?`William Top1=${d.top1}; HAD SP Top1=${d.source_status.sp_top1}`:'HAD或William未确认'}));const pi=await sb.from('hao_console_predictions').insert(rows);if(pi.error)throw pi.error;return Response.json({ok:true,run_id:ri.data.id,sale_date:date,total_matches:ds.length,model_revision_id:model.id,model_revision_tag:model.revision_tag,data_complete:dataComplete,formal_allowed:dataComplete,formal_had_legs:cs.length,recommendations:recs,challenger_v02:challengerSummary,upset_warning_v01:raw.upset_warning_v01,api_football_odds_shadow:apiSummary,asia4_loaded_rows:A.length,executor:'v82-hj38-upset-v1-active'})}catch(e:any){console.error(e);return Response.json({ok:false,error:String(e?.message||e),executor:'v82-hj38-upset-v1-active'},{status:500})}});