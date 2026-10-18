import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const K=20,HA=60,BASE=1500;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const num=(v:any)=>Number(v);
function kickoffUtc(v:any){const s=String(v||'');return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s)?s:s.replace(' ','T')+'+08:00')}
function prevSeason(s:string){if(/^\d{4}$/.test(s))return String(Number(s)-1);const m=s.match(/^(\d{4})\/(\d{4})$/);return m?(Number(m[1])-1)+'/'+m[1]:''}
async function fj(url:string){let last:any=null;for(let i=0;i<3;i++){try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}});if(r.ok)return await r.json();last=new Error('HTTP '+r.status+' '+url)}catch(e){last=e}await sleep(350*(i+1))}throw last||new Error('fetch failed '+url)}
function allTeamFixtures(j:any){return j?.fixtures?.allFixtures?.fixtures||[]}
function leagueMatches(j:any){return j?.fixtures?.allMatches||j?.fixtures?.allFixtures?.fixtures||[]}
function score(fi:any){let h=num(fi?.home?.score),a=num(fi?.away?.score);if(Number.isFinite(h)&&Number.isFinite(a))return[h,a];const s=String(fi?.status?.scoreStr||'').match(/(-?\d+)\s*-\s*(-?\d+)/);return s?[Number(s[1]),Number(s[2])]:null}
function expHome(rh:number,ra:number){return 1/(1+Math.pow(10,(ra-(rh+HA))/400))}
function actual(h:number,a:number){return h>a?1:h<a?0:.5}
Deno.serve(async(req)=>{try{
 const u=new URL(req.url),date=u.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),now=new Date();
 const {data:offs,error:oe}=await sb.from('jc_offerings_2026').select('id,offer_date,match_no,league,home_team,away_team,kickoff_local,is_world_cup').eq('offer_date',date).order('match_no');if(oe)throw oe;
 const teams=[...new Set((offs||[]).flatMap((o:any)=>[o.home_team,o.away_team]))];
 const {data:aliases,error:ae}=await sb.from('hao_team_alias_fotmob_v01').select('jc_team,fotmob_team_id,fotmob_team,confidence,updated_at').in('jc_team',teams);if(ae)throw ae;
 const amap=new Map<string,any>();for(const t of teams){const rows=(aliases||[]).filter((x:any)=>x.jc_team===t);const ids=[...new Set(rows.map((x:any)=>num(x.fotmob_team_id)).filter(Number.isFinite))];if(ids.length===1)amap.set(t,{id:ids[0],name:String(rows[0]?.fotmob_team||''),rows})}
 const teamCache=new Map<number,any>();async function teamJson(id:number){if(teamCache.has(id))return teamCache.get(id);const j=await fj('https://www.fotmob.com/api/data/teams?id='+id);teamCache.set(id,j);return j}
 const targets:any[]=[],fail:any[]=[];
 for(const o of (offs||[])){
  const kick=kickoffUtc(o.kickoff_local);
  if(!Number.isFinite(kick.getTime())||now>=kick){fail.push({offering_id:o.id,match_no:o.match_no,status:'POST_KICKOFF_FORBIDDEN'});continue}
  if(o.is_world_cup){fail.push({offering_id:o.id,match_no:o.match_no,status:'world_cup_excluded'});continue}
  const ha=amap.get(o.home_team),aa=amap.get(o.away_team);if(!ha||!aa){fail.push({offering_id:o.id,match_no:o.match_no,status:'alias_unconfirmed',home_alias:!!ha,away_alias:!!aa});continue}
  const hj=await teamJson(ha.id);const cand=allTeamFixtures(hj).filter((f:any)=>num(f?.home?.id)===ha.id&&num(f?.away?.id)===aa.id&&Math.abs(+new Date(f?.status?.utcTime)-+kick)<=6*3600e3);
  if(cand.length!==1){fail.push({offering_id:o.id,match_no:o.match_no,status:'fixture_unconfirmed',candidates:cand.map((x:any)=>x.id)});continue}
  const fi=cand[0],leagueId=num(fi?.tournament?.leagueId||hj?.details?.primaryLeagueId),season=String(hj?.details?.latestSeason||''),ccode=String(hj?.details?.country||'');if(!leagueId||!season){fail.push({offering_id:o.id,match_no:o.match_no,status:'league_context_unconfirmed'});continue}
  targets.push({...o,home_id:ha.id,away_id:aa.id,home_fotmob_name:ha.name,away_fotmob_name:aa.name,fotmob_match_id:num(fi.id),league_id:leagueId,season,ccode,kickoff_utc:kick.toISOString()});
 }
 const groups=new Map<string,any[]>();for(const t of targets){const k=[t.league_id,t.season,t.ccode].join('|');if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(t)}
 const rows:any[]=[];
 for(const [,ts] of groups){const t0=ts[0],ps=prevSeason(t0.season),urls=[ps?'https://www.fotmob.com/api/data/leagues?id='+t0.league_id+'&season='+encodeURIComponent(ps)+'&ccode3='+encodeURIComponent(t0.ccode):null,'https://www.fotmob.com/api/data/leagues?id='+t0.league_id+'&season='+encodeURIComponent(t0.season)+'&ccode3='+encodeURIComponent(t0.ccode)].filter(Boolean) as string[];const js=[];for(const url of urls){try{js.push(await fj(url))}catch{js.push(null)}}const matches:any[]=[];const seen=new Set<number>();for(const j of js)if(j)for(const fi of leagueMatches(j)){const id=num(fi?.id);if(!id||seen.has(id)||!fi?.status?.finished||fi?.status?.cancelled)continue;const sc=score(fi);if(!sc)continue;seen.add(id);matches.push({id,utc:new Date(fi.status.utcTime).toISOString(),home_id:num(fi.home.id),away_id:num(fi.away.id),hg:sc[0],ag:sc[1]})}matches.sort((a,b)=>+new Date(a.utc)-+new Date(b.utc));
  const events:any[]=[...matches.map(m=>({type:'match',utc:m.utc,data:m})),...ts.map(t=>({type:'target',utc:t.kickoff_utc,data:t}))];events.sort((a,b)=>{const d=+new Date(a.utc)-+new Date(b.utc);if(d!==0)return d;return a.type==='target'?-1:1});const rating=new Map<number,number>(),games=new Map<number,number>();
  const seedNames=new Map<number,string>();for(const t of ts){seedNames.set(t.home_id,t.home_fotmob_name);seedNames.set(t.away_id,t.away_fotmob_name)}
  for(const [id,nm] of seedNames){if(!nm)continue;
    const [{data:h},{data:a},{count:hc},{count:ac}]=await Promise.all([
      sb.from('hao_club5y_matches_v01').select('match_date,home_elo').eq('home_team',nm).order('match_date',{ascending:false}).limit(1),
      sb.from('hao_club5y_matches_v01').select('match_date,away_elo').eq('away_team',nm).order('match_date',{ascending:false}).limit(1),
      sb.from('hao_club5y_matches_v01').select('*',{count:'exact',head:true}).eq('home_team',nm),
      sb.from('hao_club5y_matches_v01').select('*',{count:'exact',head:true}).eq('away_team',nm)
    ]);
    const hr=h?.[0],ar=a?.[0];let seed:any=null;
    if(hr&&ar)seed=String(hr.match_date)>=String(ar.match_date)?hr.home_elo:ar.away_elo;else if(hr)seed=hr.home_elo;else if(ar)seed=ar.away_elo;
    if(Number.isFinite(num(seed))){rating.set(id,num(seed));games.set(id,(hc||0)+(ac||0))}
  }
  const getR=(id:number)=>rating.get(id)??BASE,getG=(id:number)=>games.get(id)??0;
  for(const ev of events){if(ev.type==='target'){const t=ev.data;if(now>=new Date(t.kickoff_utc))continue;const rh=getR(t.home_id),ra=getR(t.away_id),gh=getG(t.home_id),ga=getG(t.away_id),ex=expHome(rh,ra);rows.push({offering_id:t.id,offer_date:t.offer_date,match_no:t.match_no,league:t.league,fotmob_match_id:t.fotmob_match_id,league_id:t.league_id,season_label:t.season,home_team:t.home_team,away_team:t.away_team,home_team_id:t.home_id,away_team_id:t.away_id,elo_home:rh,elo_away:ra,elo_diff:rh-ra,expected_home:ex,home_games_seen:gh,away_games_seen:ga,cold_start_home:gh<5,cold_start_away:ga<5,k_factor:K,home_advantage:HA,source_status:(gh<5||ga<5)?'confirmed_cold_start':'confirmed',source_detail:{method:'club5y_seed_52582_plus_fotmob_prev_current_v04_strict_prematch',previous_season:ps,current_season:t.season,league_match_count:matches.length,target_kickoff_utc:t.kickoff_utc,same_time_target_before_result:true,base_rating:BASE,k_factor:K,home_advantage:HA,strict_prematch:true},reconstructed_at:now.toISOString()})}else{const m=ev.data;if(new Date(m.utc)>=now)continue;const rh=getR(m.home_id),ra=getR(m.away_id),e=expHome(rh,ra),a=actual(m.hg,m.ag),delta=K*(a-e);rating.set(m.home_id,rh+delta);rating.set(m.away_id,ra-delta);games.set(m.home_id,getG(m.home_id)+1);games.set(m.away_id,getG(m.away_id)+1)}}
 }
 if(rows.length){const {error}=await sb.from('hao_elo_live_v01').upsert(rows,{onConflict:'offering_id'});if(error)throw error}
 return Response.json({ok:true,version:'v04-club5y-seed-strict-prematch',date,total:(offs||[]).length,confirmed:rows.length,failed:fail.length,post_kickoff_forbidden:fail.filter(x=>x.status==='POST_KICKOFF_FORBIDDEN').length,rows:rows.map(r=>({offering_id:r.offering_id,match_no:r.match_no,elo_home:r.elo_home,elo_away:r.elo_away,elo_diff:r.elo_diff,status:r.source_status})),fail,at:now.toISOString()});
}catch(e){return Response.json({ok:false,error:String(e)},{status:500})}});