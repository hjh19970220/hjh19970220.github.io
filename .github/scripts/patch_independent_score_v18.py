from pathlib import Path
import re, json

p=Path('index.html')
s=p.read_text()
s=re.sub(r"const APP_BUILD='[^']+';", "const APP_BUILD='2026-09-05 独立比分模型全中文v18';", s, count=1)
marker='function hjQuickConclusion(r){'
assert marker in s, 'hjQuickConclusion marker missing'
helper=r'''function hjIndependentScore(r){
  const s=r?.source_status||{},e=s.evidence_domains||{},x=s.independent_score_engine_shadow||e.independent_score_engine_shadow||null;
  if(!x||String(x.status||'')!=='CONFIRMED_SHADOW')return null;
  const pct=v=>{const n=Number(v);return Number.isFinite(n)?(n*100).toFixed(1)+'%':'—'};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const method=String(x.input_method||''),proxy=method.includes('GOALS_RATE_PROXY');
  const conflict=x.direction_conflict===true||String(x.direction_conflict||'').toLowerCase()==='true';
  const scores=Array.isArray(x.top_scorelines)?x.top_scorelines:[];
  return {x,top:x.top1||'未确认',ph:pct(x.p_home),pd:pct(x.p_draw),pa:pct(x.p_away),lh:num(x.lambda_home),la:num(x.lambda_away),proxy,conflict,scores};
}
function hjIndependentQuickHtml(r){
  const z=hjIndependentScore(r);if(!z)return '';
  const quality=z.proxy?'低可靠度进球率代理':'真实xG比分模型';
  const relation=z.conflict?'⚠️ 与正式方向冲突':'✅ 与正式方向同向';
  const scores=z.scores.slice(0,3).map(x=>'<div class="hjqscore"><b>'+esc(x.score||'—')+'</b><span>'+((Number(x.p||0)*100).toFixed(1))+'%</span></div>').join('');
  return '<div class="hjqscoreline"><div class="hjqscoretitle">独立比分模型 · '+esc(quality)+' · '+esc(relation)+'</div><div class="tiny">独立主胜 '+esc(z.ph)+' ｜ 平局 '+esc(z.pd)+' ｜ 客胜 '+esc(z.pa)+' ｜ 独立首选 '+esc(z.top)+'</div>'+(scores?'<div class="hjqscores" style="margin-top:7px">'+scores+'</div>':'')+'</div>';
}
function hjIndependentDetailSection(r){
  const z=hjIndependentScore(r);if(!z)return '';
  const quality=z.proxy?'低可靠度进球率代理（无真实xG时兜底）':'真实xG比分模型';
  const relation=z.conflict?'⚠️ 与正式首选方向冲突':'✅ 与正式首选方向同向';
  const scoreText=z.scores.slice(0,5).map(x=>(x.score||'—')+' '+((Number(x.p||0)*100).toFixed(1))+'%').join(' ｜ ')||'未确认';
  const lineup=String(z.x.lineup_type||'');
  const lineupZh=lineup==='confirmed'?'确认首发':lineup==='predicted'?'预测首发':lineup||'未确认';
  const lh=z.lh==null?'—':z.lh.toFixed(2),la=z.la==null?'—':z.la.toFixed(2);
  return '<section class="section"><div class="shead"><h2>⚽ 独立比分模型</h2><span>影子验证层 · 不改变正式首选方向</span></div><div class="cards"><div class="card feature"><div class="kv"><div>独立首选方向</div><div><b>'+esc(z.top)+'</b></div><div>独立主胜概率</div><div>'+esc(z.ph)+'</div><div>独立平局概率</div><div>'+esc(z.pd)+'</div><div>独立客胜概率</div><div>'+esc(z.pa)+'</div><div>与正式方向关系</div><div>'+esc(relation)+'</div><div>数据等级</div><div>'+esc(quality)+'</div></div></div><div class="card"><div class="kv"><div>主队预期进球</div><div>'+esc(lh)+'</div><div>客队预期进球</div><div>'+esc(la)+'</div><div>低比分修正</div><div>已启用（影子层）</div><div>最可能比分</div><div>'+esc(scoreText)+'</div><div>阵容状态</div><div>'+esc(lineupZh)+'</div><div>缺阵人数</div><div>主 '+esc(z.x.home_unavailable_n??'—')+' ｜ 客 '+esc(z.x.away_unavailable_n??'—')+'</div></div></div></div><div class="notice warn" style="margin:0 12px 12px">独立比分模型目前只用于发现市场热门、平局与反向胜负风险；尚未取得修改正式首选方向的权限。</div></section>';
}
'''
s=s.replace(marker,helper+marker,1)
old='    hjQuickScoreHtml(r)+\n'
assert old in s, 'quick score insertion marker missing'
s=s.replace(old,old+'    hjIndependentQuickHtml(r)+\n',1)
old2="'+scoreSec+'<section class=\"section\"><div class=\"shead\"><h2>🧠 风险与证据</h2>"
assert old2 in s, 'detail score insertion marker missing'
s=s.replace(old2,"'+scoreSec+hjIndependentDetailSection(r)+'<section class=\"section\"><div class=\"shead\"><h2>🧠 风险与证据</h2>",1)
p.write_text(s)
Path('version.json').write_text(json.dumps({'build':'2026-09-05 独立比分模型全中文v18','updated_at':'2026-09-05'},ensure_ascii=False)+'\n')
