from pathlib import Path
import re, json

p=Path('index.html')
s=p.read_text(encoding='utf-8')
build='2026-09-10 豪竞2.5单双选前端v30'

s=re.sub(r"const APP_BUILD='[^']+';", f"const APP_BUILD='{build}';", s, count=1)

helper=r'''function hjSingleDoubleData(r){return r?.source_status?.single_double_v01||{}}
function hjSingleDoubleBadge(r){
 const x=hjSingleDoubleData(r),c=String(x.class_code||'').toUpperCase();
 if(c==='SINGLE')return '🟢 单选';
 if(c==='STRONG_DOUBLE')return '🟣 强双';
 if(c==='CANDIDATE_DOUBLE')return '🟠 候选双';
 if(c==='PASS')return '⚪ PASS';
 return '⚪ 待新运行';
}
function hjSingleDoublePicks(r){
 const x=hjSingleDoubleData(r),ps=Array.isArray(x.picks)?x.picks.filter(Boolean):[];
 if(ps.length)return ps.join(' + ');
 return String(x.class_code||'').toUpperCase()==='PASS'?'PASS':'未确认';
}
function hjSingleDoubleDetailSection(r){
 const x=hjSingleDoubleData(r),c=String(x.class_code||'').toUpperCase();
 if(!c)return '';
 const top1Changed=x.top1_unchanged===true?'否':'未确认';
 const probChanged=x.probability_unchanged===true?'否':'未确认';
 return '<section class="section"><div class="shead"><h2>🔀 豪竞2.5 单双选</h2><span>有把握单选 · 有可信第二方向双选 · 不可靠则PASS</span></div><div class="cards"><div class="card feature"><div class="kv"><div>单双类型</div><div><b>'+esc(hjSingleDoubleBadge(r))+'</b></div><div>执行方向</div><div><b>'+esc(hjSingleDoublePicks(r))+'</b></div><div>动作</div><div>'+esc(x.action||'—')+'</div><div>判定理由</div><div>'+esc(x.reason||'—')+'</div></div></div><div class="card"><div class="kv"><div>正式Top1</div><div>'+esc(r.top1||'未确认')+'</div><div>第二方向</div><div>'+esc(r.second_pick||'—')+'</div><div>是否改Top1</div><div>'+esc(top1Changed)+'</div><div>是否改概率</div><div>'+esc(probChanged)+'</div><div>候选双是否强制下注</div><div>'+esc(x.candidate_double_not_forced===true?'否':'未确认')+'</div></div></div></div></section>';
}
'''
marker='function hjFinalLeg(r){'
if 'function hjSingleDoubleData(r)' not in s:
    if marker not in s: raise SystemExit('single/double helper marker missing')
    s=s.replace(marker,helper+marker,1)

old="'<div class=\"hjqchips\"><span class=\"hjqchip\">🎯 '+esc(hjDualDirectionBadge(r))+'</span><span class=\"hjqchip\">💰 '+esc(hjDualValueBadge(r))+'</span><span class=\"hjqchip\">🎫 '+esc(hjDualActionBadge(r))+'</span></div>'+"
new="'<div class=\"hjqchips\"><span class=\"hjqchip\">'+esc(hjSingleDoubleBadge(r))+' · '+esc(hjSingleDoublePicks(r))+'</span><span class=\"hjqchip\">🎯 '+esc(hjDualDirectionBadge(r))+'</span><span class=\"hjqchip\">💰 '+esc(hjDualValueBadge(r))+'</span><span class=\"hjqchip\">🎫 '+esc(hjDualActionBadge(r))+'</span></div>'+"
if old not in s: raise SystemExit('quick chips target missing')
s=s.replace(old,new,1)

old='5秒只看：🎯方向灯 · 💰价值灯 · 🎫出手档位；其他风险点进比赛看'
new='5秒只看：🔀单双选 · 🎯方向灯 · 💰价值灯 · 🎫出手档位；其他风险点进比赛看'
if old not in s: raise SystemExit('quick subtitle target missing')
s=s.replace(old,new,1)

old='<th>场</th><th>对阵</th><th>胜平负</th><th>🎯方向</th><th>💰价值灯</th><th>🎫出手</th><th>赛果</th>'
new='<th>场</th><th>对阵</th><th>胜平负</th><th>🔀单双</th><th>🎯方向</th><th>💰价值灯</th><th>🎫出手</th><th>赛果</th>'
if old not in s: raise SystemExit('hj table header target missing')
s=s.replace(old,new,1)

old="<td>'+esc(hjFtCompact(r))+'</td><td><b>'+esc(hjDualDirectionBadge(r))+'</b></td>"
new="<td>'+esc(hjFtCompact(r))+'</td><td><b>'+esc(hjSingleDoubleBadge(r))+'</b><div class=\"tiny\">'+esc(hjSingleDoublePicks(r))+'</div></td><td><b>'+esc(hjDualDirectionBadge(r))+'</b></td>"
if old not in s: raise SystemExit('hj table row target missing')
s=s.replace(old,new,1)

old="+metric('🎯 方向灯',hjDualDirectionBadge(r),s.final_selection_reason||'只回答Top1方向强弱')"
new="+metric('🔀 单双选',hjSingleDoubleBadge(r),hjSingleDoublePicks(r))+metric('🎯 方向灯',hjDualDirectionBadge(r),s.final_selection_reason||'只回答Top1方向强弱')"
if old not in s: raise SystemExit('detail hero metric target missing')
s=s.replace(old,new,1)

old="+'</div></div>'+scoreSec+hjValueDetailSection(r)+hjIntelDetailSection(r)+hjIndependentDetailSection(r)+"
new="+'</div></div>'+hjSingleDoubleDetailSection(r)+scoreSec+hjValueDetailSection(r)+hjIntelDetailSection(r)+hjIndependentDetailSection(r)+"
if old not in s: raise SystemExit('detail section insertion target missing')
s=s.replace(old,new,1)

old="<div>🎯方向灯</div><div>'+esc(hjDualDirectionBadge(r))+'</div><div>💰价值灯</div>"
new="<div>🔀单双选</div><div>'+esc(hjSingleDoubleBadge(r)+' · '+hjSingleDoublePicks(r))+'</div><div>🎯方向灯</div><div>'+esc(hjDualDirectionBadge(r))+'</div><div>💰价值灯</div>"
if old not in s: raise SystemExit('risk detail single/double target missing')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
Path('version.json').write_text(json.dumps({'build':build,'updated_at':'2026-09-10'},ensure_ascii=False)+'\n',encoding='utf-8')

out=p.read_text(encoding='utf-8')
assert build in out
assert 'function hjSingleDoubleData(r)' in out
assert '🟢 单选' in out and '🟣 强双' in out and '🟠 候选双' in out
assert '5秒只看：🔀单双选' in out
assert '<th>🔀单双</th>' in out
assert "metric('🔀 单双选'" in out
assert 'hjSingleDoubleDetailSection(r)' in out
print('patched v30 single/double frontend')
