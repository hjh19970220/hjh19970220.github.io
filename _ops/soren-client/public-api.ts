import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'public, max-age=60','Content-Type':'application/json; charset=utf-8'};
const map=(r:any)=>({date:r.pool_date,no:r.match_no,league:r.league,home:r.home_team,away:r.away_team,kickoff:r.kickoff_at,mode:r.selection_mode,direction:r.public_direction,handicap:r.handicap_direction,confidence:r.confidence==null?null:Math.round(Number(r.confidence)*100),verified:r.result_verified===true,result:r.ft_result,top1Hit:r.ft_top1_hit,coverageHit:r.coverage_hit,handicapHit:r.handicap_hit,version:r.model_version});
const fields='pool_date,match_no,league,home_team,away_team,kickoff_at,selection_mode,public_direction,handicap_direction,confidence,result_verified,ft_result,ft_top1_hit,coverage_hit,handicap_hit,model_version';
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
 if(req.method!=='GET')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 try{
  const u=new URL(req.url),view=u.searchParams.get('view')||'today',client=u.searchParams.get('client')==='1';
  if(!['today','history'].includes(view))return reply({ok:false,error:'INVALID_VIEW'},400);
  let q=sb.from('soren_publish_cards_v1').select(fields+(client?',frozen_at,run_key':''));
  if(view==='history')q=q.eq('result_verified',true).order('pool_date',{ascending:false}).order('match_no',{ascending:true}).limit(client?1000:120);
  else{
   let date=u.searchParams.get('date');
   if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return reply({ok:false,error:'INVALID_DATE'},400);
   if(!date){const {data:d,error:e}=await sb.from('soren_publish_cards_v1').select('pool_date').order('pool_date',{ascending:false}).limit(1).maybeSingle();if(e)throw e;date=d?.pool_date;}
   if(!date)return reply({ok:true,view,updatedAt:new Date().toISOString(),rows:[]});
   q=q.eq('pool_date',date).order('match_no',{ascending:true});
  }
  const {data,error}=await q;if(error)throw error;
  let records:any[]=data||[];
  if(!client)return reply({ok:true,view,updatedAt:new Date().toISOString(),rows:records.map(map)});
  const keys=[...new Set(records.map(r=>r.run_key))];
  const runs=new Map();
  if(keys.length){const {data:rs,error:re}=await sb.from('soren_latest_formal_runs_v1').select('run_key,freeze_at,no_result_leakage').in('run_key',keys);if(re)throw re;for(const r of rs||[])runs.set(r.run_key,r);}
  const counts=new Map();const identity=(r:any)=>[r.pool_date,r.home_team,r.away_team,r.kickoff_at].join('|');
  for(const r of records)counts.set(identity(r),(counts.get(identity(r))||0)+1);
  const audited=(r:any)=>{const run=runs.get(r.run_key);return run?.no_result_leakage===true&&Date.parse(r.frozen_at)<Date.parse(r.kickoff_at)&&Date.parse(run.freeze_at)<Date.parse(r.kickoff_at);};
  // Reject ambiguous duplicates. Never choose the record that happens to win.
  records=records.filter(r=>counts.get(identity(r))===1);
  if(view==='history')records=records.filter(r=>audited(r)&&r.result_verified===true&&Date.parse(r.kickoff_at)<Date.now()&&['H','D','A'].includes(r.ft_result)&&['SINGLE','DOUBLE'].includes(r.selection_mode)&&r.public_direction!=='PASS').slice(0,120);
  const rows=records.map(r=>({...map(r),frozenAt:audited(r)?r.frozen_at:null,pregameVerified:audited(r)}));
  return reply({ok:true,view,updatedAt:new Date().toISOString(),rows});
 }catch{return reply({ok:false,error:'PUBLIC_API_ERROR'},500);}
});
