
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const FN=SUPABASE_URL+'/functions/v1/';
let INTERNAL_KEY='';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const ageMin=(v:any)=>v?Math.max(0,(Date.now()-new Date(v).getTime())/60000):999999;
const bjtParts=(d=new Date())=>{
  const ps=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,weekday:'short'}).formatToParts(d);
  const o:any={};for(const p of ps)o[p.type]=p.value;return o;
};
const bjtIsoFor=(date:string,minutes:number)=>{
  const h=Math.floor(minutes/60),m=minutes%60;
  return new Date(date+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00+08:00');
};
async function getJson(url:string,timeout=15000){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);
  try{
    const headers:any={'user-agent':'HaoSystemSelfcheck/1.0'};if(url.startsWith(FN)&&INTERNAL_KEY)headers['x-hao-internal-key']=INTERNAL_KEY;
    const r=await fetch(url,{cache:'no-store',signal:ac.signal,headers});
    const tx=await r.text();
    let body:any=tx;try{body=JSON.parse(tx)}catch{}
    return {ok:r.ok,status:r.status,body};
  }catch(e:any){return {ok:false,status:0,error:String(e?.message||e)}}finally{clearTimeout(t)}
}
async function invoke(slug:string,timeout=45000){
  const r=await getJson(FN+slug,timeout);
  return {slug,...r};
}
function latestBy<T extends Record<string,any>>(rows:T[],key:string){
  const out:any={};
  for(const r of rows||[]){
    const k=String(r[key]??'');
    if(!out[k]||new Date(r.run_time||0)>new Date(out[k].run_time||0))out[k]=r;
  }
  return out;
}
Deno.serve(async(req)=>{
  const internalKey=req.headers.get('x-hao-internal-key')||'';
  const {data:secretRow,error:secretErr}=await sb.from('hao_internal_secrets_v01').select('secret_value').eq('secret_name','cron_internal_v01').maybeSingle();
  if(secretErr||!secretRow?.secret_value||internalKey!==secretRow.secret_value){
    return Response.json({ok:false,error:'UNAUTHORIZED_INTERNAL_CALL'},{status:401});
  }
  INTERNAL_KEY=internalKey;

  const now=new Date(),p=bjtParts(now);
  const date=p.year+'-'+p.month+'-'+p.day;
  const bjtTime=date+' '+p.hour+':'+p.minute+':'+p.second;
  const h=Number(p.hour),minute=Number(p.minute),weekend=['Sat','Sun'].includes(p.weekday);
  const currentMin=h*60+minute;
  const slots=[720,840,960,1080,1200,1260,1320,...(weekend?[1350]:[])];
  const eligible=slots.filter(x=>x<=currentMin-5);
  const expectedSlotMin=eligible.length?eligible[eligible.length-1]:null;
  const expectedSlot=expectedSlotMin==null?null:bjtIsoFor(date,expectedSlotMin);
  const sourceFreshFrom=expectedSlot?new Date(expectedSlot.getTime()-25*60000):null;

  const actions:any[]=[],unresolved:any[]=[];
  const action=(type:string,detail:any)=>actions.push({type,at:new Date().toISOString(),...detail});
  const problem=(type:string,detail:any)=>unresolved.push({type,...detail});

  // 1) Website live check, retry once.
  let [site,version]=await Promise.all([
    getJson('https://hjh19970220.github.io/?health='+Date.now(),12000),
    getJson('https://hjh19970220.github.io/version.json?t='+Date.now(),12000)
  ]);
  if(!site.ok||!version.ok){
    await sleep(1200);
    [site,version]=await Promise.all([
      getJson('https://hjh19970220.github.io/?health_retry='+Date.now(),12000),
      getJson('https://hjh19970220.github.io/version.json?t='+Date.now(),12000)
    ]);
    action('website_retry',{site_status:site.status,version_status:version.status});
  }
  const websiteStatus={root_http:site.status,version_http:version.status,build:version?.body?.build||null,ok:!!(site.ok&&version.ok)};
  if(!websiteStatus.ok)problem('website_unreachable',{root_http:site.status,version_http:version.status});

  // 2) Active model integrity. Never auto-select or rewrite model rules.
  const {data:activeRows,error:activeErr}=await sb.from('hao_model_registry')
    .select('id,model_name,model_version,revision_tag,effective_at')
    .eq('status','active')
    .in('model_name',['豪竞2.3','豪传2.3','豪篮1.0']);
  const expectedModels=['豪竞2.3','豪传2.3','豪篮1.0'];
  const activeModels:any={};
  for(const name of expectedModels){
    const xs=(activeRows||[]).filter((x:any)=>x.model_name===name);
    activeModels[name]=xs;
    if(xs.length!==1)problem('active_model_integrity',{model:name,count:xs.length});
  }
  if(activeErr)problem('active_model_query_error',{error:activeErr.message});

  // 3) Re-enable safe operational cron jobs.
  let cronStatus:any={ok:false,re_enabled:[],missing:[]};
  try{
    const {data,error}=await sb.rpc('hao_reenable_core_crons_v01');
    if(error)throw error;cronStatus=data||cronStatus;
    if((cronStatus.re_enabled||[]).length)action('cron_reenabled',{jobs:cronStatus.re_enabled});
    if((cronStatus.missing||[]).length)problem('cron_missing',{jobs:cronStatus.missing});
  }catch(e:any){problem('cron_repair_rpc_error',{error:String(e?.message||e)})}

  // 4) Determine current football/R9 pools.
  const {data:jcPoolRows,error:jcErr}=await sb.from('jc_offerings_2026').select('match_no')
    .eq('offer_date',date).eq('is_world_cup',false);
  const jcCount=new Set((jcPoolRows||[]).map((x:any)=>String(x.match_no))).size;
  if(jcErr)problem('jc_pool_query_error',{error:jcErr.message});

  const nowBjtSql=bjtTime;
  const {data:r9Rows,error:r9Err}=await sb.from('r9_issues_2026')
    .select('issue_no,seq_no,sale_start,sale_end,is_world_cup')
    .lte('sale_start',nowBjtSql).gt('sale_end',nowBjtSql).eq('is_world_cup',false);
  if(r9Err)problem('r9_pool_query_error',{error:r9Err.message});
  const issueMap=new Map<string,any[]>();
  for(const r of r9Rows||[]){const k=String(r.issue_no);if(!issueMap.has(k))issueMap.set(k,[]);issueMap.get(k)!.push(r)}
  const currentR9=[...issueMap.entries()].filter(([,rs])=>rs.length===14)
    .sort((a,b)=>String(a[1][0].sale_end).localeCompare(String(b[1][0].sale_end)))[0]||null;

  // 5) Source health and automatic collector repair after an expected run slot exists.
  const coreCodes=['jc_pool_discovery','okooo_sp_mirror','500_sp_mirror','qiulaile_sp_mirror','zucaijia_william','zucaijia_asia4','jiebao','sina_xiaopao','r9_sina_william','hb_500_jclq_live','hb_recent_form','hb_vipc_jclq_pool'];
  const {data:sloRows,error:sloErr}=await sb.from('hao_system_slo_v01').select('*').eq('enabled',true).in('source_code',coreCodes);
  if(sloErr)problem('slo_query_error',{error:sloErr.message});
  const sloMap:any=Object.fromEntries((sloRows||[]).map((x:any)=>[x.source_code,x]));
  const getHealth=async()=>{
    const {data,error}=await sb.from('hao_source_health_v01').select('*').in('source_code',coreCodes);
    if(error)throw error;return data||[];
  };
  let health:any[]=[];
  try{health=await getHealth()}catch(e:any){problem('source_health_query_error',{error:String(e?.message||e)})}
  const hm=()=>Object.fromEntries((health||[]).map((x:any)=>[x.source_code,x]));
  const needRepair=(row:any,coverageExpected:boolean)=>{
    if(!row)return true;
    const cfg=sloMap[row.source_code]||{};
    const waitingOk=cfg.waiting_pool_ok===true;
    const allowedStatus=String(row.status||'')==='ok'||(waitingOk&&String(row.status||'')==='waiting_pool');
    if(!allowedStatus)return true;
    if(!coverageExpected&&String(row.status||'')==='waiting_pool'&&waitingOk)return false;
    if(coverageExpected&&String(row.latest_pool_date||'')!==date)return true;
    const exp=Number(row.expected_matches||0),ver=Number(row.verified_matches||0),minRatio=Number(cfg.min_coverage_ratio??0.95);
    if(coverageExpected&&exp>0&&ver/exp<minRatio)return true;
    const maxAge=Number(cfg.max_age_minutes||60);
    if(coverageExpected&&(!row.last_success_at||ageMin(row.last_success_at)>maxAge))return true;
    return false;
  };
  const sourceActions:any=[
    ['jc_pool_discovery','hao-jc-pool-discovery-v01',Number(jcCount||0)>0],
    ['okooo_sp_mirror','hao-okooo-sp-live-v01?date='+date,Number(jcCount||0)>0],
    ['500_sp_mirror','hao-jc-500-sp-live-v01?date='+date,Number(jcCount||0)>0],
    ['zucaijia_william','hao-zucaijia-william-v01?date='+date,Number(jcCount||0)>0],
    ['zucaijia_asia4','hao-asia4-live-v01?date='+date,Number(jcCount||0)>0],
    ['jiebao','hao-jiebao-live-v01?date='+date,Number(jcCount||0)>0],
    ['r9_sina_william','hao-r9-sina-william-v01',!!currentR9]
  ];
  if(expectedSlot){
    const xp=hm()['sina_xiaopao'];
    if(Number(jcCount||0)>0&&(!xp||xp.status!=='ok'||String(xp.latest_pool_date||'')!==date||ageMin(xp.last_success_at)>240)){
      const rr=await invoke('hao-sina-xiaopao-live-v01',60000);
      action('source_repair',{source:'sina_xiaopao',http:rr.status,ok:rr.ok});
      try{health=await getHealth()}catch{}
    }
    for(const [code,slug,coverageExpected] of sourceActions){
      if(!coverageExpected)continue;
      const row=hm()[code];
      if(needRepair(row,true)){
        const rr=await invoke(slug,55000);
        action('source_repair',{source:code,http:rr.status,ok:rr.ok});
      }
    }
    // If both SP primaries still need help, run gap-fill fallback once.
    try{health=await getHealth()}catch{}
    const m2=hm();
    const spPrimaryBad=needRepair(m2['okooo_sp_mirror'],Number(jcCount||0)>0)&&needRepair(m2['500_sp_mirror'],Number(jcCount||0)>0);
    if(Number(jcCount||0)>0&&spPrimaryBad){
      const rr=await invoke('hao-jc-sp-mirror-live-v01?date='+date,45000);
      action('sp_gapfill_repair',{http:rr.status,ok:rr.ok});
      try{health=await getHealth()}catch{}
    }
  }

  // Basketball: waiting_pool is healthy. If source claims an expected pool but is not healthy, repair.
  const bh=hm()['hb_500_jclq_live'];
  const hbPoolExpected=Number(bh?.expected_matches||0)>0;
  if(expectedSlot&&hbPoolExpected&&needRepair(bh,true)){
    const [a,b]=await Promise.all([
      invoke('hao-basketball-500-live-v01?date='+date,45000),
      invoke('hao-basketball-form-v01?date='+date,55000)
    ]);
    action('basketball_source_repair',{market_http:a.status,form_http:b.status});
    try{health=await getHealth()}catch{}
  }

  // 6) Settlement safety retry at 09:10-ish.
  if(h===9 && minute>=5 && minute<=30){
    const [fs,bs]=await Promise.all([
      invoke('hao-result-settlement-v01?mode=auto',50000),
      invoke('hao-basketball-result-settlement-v01',50000)
    ]);
    action('settlement_safety_retry',{football_http:fs.status,basketball_http:bs.status});
  }

  // 7) Latest runs must follow active revision and latest expected scheduled slot.
  const {data:fruns}=await sb.from('hao_console_model_runs')
    .select('id,model_name,pool_date,pool_label,run_time,status,data_complete,formal_allowed,model_revision_id,model_revision_tag,total_matches')
    .in('model_name',['豪竞2.3','豪传2.3']).order('run_time',{ascending:false}).limit(30);
  const fl=latestBy(fruns||[],'model_name');
  const {data:hbruns}=await sb.from('hao_basketball_runs_v01')
    .select('id,model_name,sale_date,pool_label,run_time,status,data_complete,formal_allowed,model_revision_id,model_revision_tag')
    .eq('model_name','豪篮1.0').order('run_time',{ascending:false}).limit(5);
  let latestHB=(hbruns||[])[0]||null;

  const activeOne=(name:string)=>activeModels[name]?.length===1?activeModels[name][0]:null;
  const runNeedsHeal=(run:any,active:any,shouldExist:boolean)=>{
    if(!shouldExist||!active)return false;
    if(!run)return true;
    if(Number(run.model_revision_id)!==Number(active.id))return true;
    if(expectedSlot&&new Date(run.run_time)<expectedSlot)return true;
    return false;
  };

  if(expectedSlot&&Number(jcCount||0)>0&&runNeedsHeal(fl['豪竞2.3'],activeOne('豪竞2.3'),true)){
    const rr=await invoke('hao-model-hourly-executor-v01?date='+date,60000);
    action('model_rerun',{model:'豪竞2.3',http:rr.status,ok:rr.ok});
  }
  if(expectedSlot&&currentR9&&runNeedsHeal(fl['豪传2.3'],activeOne('豪传2.3'),true)){
    const rr=await invoke('hao-r9-hourly-executor-v01',60000);
    action('model_rerun',{model:'豪传2.3',http:rr.status,ok:rr.ok});
  }
  if(expectedSlot&&hbPoolExpected&&runNeedsHeal(latestHB,activeOne('豪篮1.0'),true)){
    const rr=await invoke('hao-basketball-hourly-executor-v01?date='+date,60000);
    action('model_rerun',{model:'豪篮1.0',http:rr.status,ok:rr.ok});
  }

  // 8) Re-read after repairs and verify.
  const {data:fruns2}=await sb.from('hao_console_model_runs')
    .select('id,model_name,pool_date,pool_label,run_time,status,data_complete,formal_allowed,model_revision_id,model_revision_tag,total_matches')
    .in('model_name',['豪竞2.3','豪传2.3']).order('run_time',{ascending:false}).limit(30);
  const fl2=latestBy(fruns2||[],'model_name');
  const {data:hbruns2}=await sb.from('hao_basketball_runs_v01')
    .select('id,model_name,sale_date,pool_label,run_time,status,data_complete,formal_allowed,model_revision_id,model_revision_tag')
    .eq('model_name','豪篮1.0').order('run_time',{ascending:false}).limit(5);
  latestHB=(hbruns2||[])[0]||latestHB;

  if(expectedSlot&&Number(jcCount||0)>0&&runNeedsHeal(fl2['豪竞2.3'],activeOne('豪竞2.3'),true))
    problem('model_run_stale',{model:'豪竞2.3',expected_slot:expectedSlot.toISOString(),latest:fl2['豪竞2.3']||null});
  if(expectedSlot&&currentR9&&runNeedsHeal(fl2['豪传2.3'],activeOne('豪传2.3'),true))
    problem('model_run_stale',{model:'豪传2.3',expected_slot:expectedSlot.toISOString(),latest:fl2['豪传2.3']||null});
  if(expectedSlot&&hbPoolExpected&&runNeedsHeal(latestHB,activeOne('豪篮1.0'),true))
    problem('model_run_stale',{model:'豪篮1.0',expected_slot:expectedSlot.toISOString(),latest:latestHB||null});

  try{health=await getHealth()}catch{}
  const finalHealth=hm();
  if(expectedSlot&&Number(jcCount||0)>0){
    for(const code of ['jc_pool_discovery','okooo_sp_mirror','500_sp_mirror','zucaijia_william','zucaijia_asia4','jiebao']){
      if(needRepair(finalHealth[code],true))problem('source_unhealthy',{source:code,status:finalHealth[code]||null});
    }
    const xp=finalHealth['sina_xiaopao'];
    if(!xp||xp.status!=='ok'||String(xp.latest_pool_date||'')!==date||ageMin(xp.last_success_at)>240)
      problem('source_unhealthy',{source:'sina_xiaopao',status:xp||null});
  }
  if(expectedSlot&&currentR9&&needRepair(finalHealth['r9_sina_william'],true))
    problem('source_unhealthy',{source:'r9_sina_william',status:finalHealth['r9_sina_william']||null});

  const runStatus={
    expected_slot_bjt:expectedSlotMin==null?null:String(Math.floor(expectedSlotMin/60)).padStart(2,'0')+':'+String(expectedSlotMin%60).padStart(2,'0'),
    jc_pool_matches:Number(jcCount||0),
    active_r9_issue:currentR9?currentR9[0]:null,
    basketball_pool_expected:hbPoolExpected,
    haojing:fl2['豪竞2.3']||null,
    haochuan:fl2['豪传2.3']||null,
    haolan:latestHB||null
  };
  const sourceStatus={rows:Object.fromEntries((health||[]).map((x:any)=>[x.source_code,{
    status:x.status,latest_pool_date:x.latest_pool_date,last_success_at:x.last_success_at,
    expected_matches:x.expected_matches,verified_matches:x.verified_matches,last_error:x.last_error,
    slo:sloMap[x.source_code]?{
      max_age_minutes:sloMap[x.source_code].max_age_minutes,
      min_coverage_ratio:sloMap[x.source_code].min_coverage_ratio,
      waiting_pool_ok:sloMap[x.source_code].waiting_pool_ok,
      severity:sloMap[x.source_code].severity
    }:null
  }]))};

  const overall=unresolved.length?'attention':actions.length?'healed':'ok';
  const activeSummary=Object.fromEntries(expectedModels.map(name=>[name,(activeModels[name]||[]).map((x:any)=>({id:x.id,revision_tag:x.revision_tag,effective_at:x.effective_at}))]));
  const row={checked_at:new Date().toISOString(),bjt_time:bjtTime,overall_status:overall,website_status:websiteStatus,active_models:activeSummary,cron_status:cronStatus,source_status:sourceStatus,run_status:runStatus,actions,unresolved};
  const {data:ins,error:ie}=await sb.from('hao_system_selfcheck_v01').insert(row).select('id').single();
  if(ie)return Response.json({ok:false,error:ie.message,...row},{status:500});
  return Response.json({ok:true,selfcheck_id:ins.id,overall_status:overall,actions,unresolved,website:websiteStatus,run_status:runStatus});
});
