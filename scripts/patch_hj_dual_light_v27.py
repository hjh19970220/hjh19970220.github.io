from pathlib import Path
import re, json

p=Path('index.html')
s=p.read_text(encoding='utf-8')
build='2026-09-09 豪竞2.5双灯重构v27'

# Build/version
s=re.sub(r"const APP_BUILD='[^']+';", f"const APP_BUILD='{build}';", s, count=1)

# Dual-light helpers. Historical rows keep old selection-light fallback.
old="function hjFinalLeg(r){const s=r?.source_status||{},x=hjSelectionLightLabel(r);return s.prematch_lock===true?'🔒 '+x:x}"
new=r'''function hjDualDirectionBadge(r){
 const s=r?.source_status||{},x=String(s.direction_light||s.final_selection_light||'').toUpperCase();
 if(x==='GREEN')return '🟢 方向强';
 if(x==='YELLOW')return '🟡 方向观察';
 if(x==='RED')return '🔴 方向不出手';
 if(x==='UNAVAILABLE')return '⚪ 方向未确认';
 return hjSelectionLightLabel(r);
}
function hjDualValueBadge(r){
 const s=r?.source_status||{},v=String(s.value_light||s.hj25_value_gate?.value_light||'GREY').toUpperCase();
 if(v==='GREEN')return '🟢 V正价值';
 if(v==='RED')return '🔴 V负价值';
 return '⚪ V未确认';
}
function hjDualActionBadge(r){
 const s=r?.source_status||{},a=String(s.action_tier||'').toUpperCase();
 const m={PRIORITY:'⭐ 优先出手',DIRECTION:'🟢 方向可打',DIRECTION_NO_HAD:'🟢 方向强·HAD不可执行',VALUE_B:'💰 B档价值',WATCH:'🟡 观察',PASS:'🔴 PASS',PASS_UNAVAILABLE:'⚪ 不可用'};
 return m[a]||hjSelectionLightLabel(r);
}
function hjFinalLeg(r){const s=r?.source_status||{},x=hjDualActionBadge(r);return s.prematch_lock===true?'🔒 '+x:x}'''
if old not in s:
    raise SystemExit('hjFinalLeg target not found')
s=s.replace(old,new,1)

# Quick-card chips: only the three decision concepts. Other diagnostics remain in match detail.
lines=s.splitlines()
changed=0
for i,line in enumerate(lines):
    if "'<div class=\"hjqchips\">" in line and '爆冷总风险' in line:
        lines[i]="    '<div class=\"hjqchips\"><span class=\"hjqchip\">🎯 '+esc(hjDualDirectionBadge(r))+'</span><span class=\"hjqchip\">💰 '+esc(hjDualValueBadge(r))+'</span><span class=\"hjqchip\">🎫 '+esc(hjDualActionBadge(r))+'</span></div>'+"
        changed+=1
s='\n'.join(lines)
if changed!=1:
    raise SystemExit(f'quick chip line changed={changed}')

# Simplify Haojing full-pool table.
s=s.replace('5秒看方向 · 爆冷类型 · 第三方向 · 风险 · 完整证据点比赛查看','5秒只看：🎯方向 · 💰价值 · 🎫出手；其他风险点进比赛看',1)
s=s.replace('展开完整全池表格（原全部字段保留）','展开双灯全池表格（全部证据点比赛查看）',1)
old_head='<th>场</th><th>对阵</th><th>胜平负</th><th>风险</th><th>让球</th><th>让球灯</th><th>最终选腿</th><th>赛果</th>'
new_head='<th>场</th><th>对阵</th><th>胜平负</th><th>🎯方向</th><th>💰V</th><th>🎫出手</th><th>赛果</th>'
if old_head not in s: raise SystemExit('Haojing table header not found')
s=s.replace(old_head,new_head,1)
old_cells="<td>'+esc(hjRiskBadge(r))+'</td><td><b>'+esc(hjHandicapCompact(r))+'</b></td><td><b>'+esc(hjHandicapLight(r))+'</b></td><td>'+esc(hjFinalLeg(r))+'</td>"
new_cells="<td><b>'+esc(hjDualDirectionBadge(r))+'</b></td><td>'+esc(hjDualValueBadge(r))+'</td><td><b>'+esc(hjDualActionBadge(r))+'</b></td>"
if old_cells not in s: raise SystemExit('Haojing table cells not found')
s=s.replace(old_cells,new_cells,1)

# Match hero: replace old single final-light card with direction/value/action cards.
old_metric="metric('最终胜平负选腿灯',hjSelectionLightLabel(r),s.final_selection_reason||'胜平负HAD正式选腿状态')"
new_metric="metric('🎯 方向灯',hjDualDirectionBadge(r),s.final_selection_reason||'只回答Top1方向强弱')+metric('💰 V灯',hjDualValueBadge(r),'只回答当前赔率价值，不否决方向')+metric('🎫 出手档位',hjDualActionBadge(r),'方向/价值/市场可执行性分开')"
if old_metric not in s: raise SystemExit('match hero final-light metric not found')
s=s.replace(old_metric,new_metric,1)

# Detail risk card: dual-light wording and explicit advisory semantics.
old_detail="<div>最终胜平负选腿灯</div><div>'+esc(hjSelectionLightLabel(r))+'</div><div>胜平负正式资格</div><div>'+esc((s.primary_selection_eligible===true||s.had_selection_eligible===true)?'可进入推荐档位':'不可进入推荐档位')+'</div>"
new_detail="<div>🎯方向灯</div><div>'+esc(hjDualDirectionBadge(r))+'</div><div>💰V灯</div><div>'+esc(hjDualValueBadge(r))+'</div><div>🎫出手档位</div><div>'+esc(hjDualActionBadge(r))+'</div><div>普通HAD可执行</div><div>'+esc((s.had_execution_available===true||String(s.had_execution_available).toLowerCase()==='true')?'可执行':'暂不可执行/未确认')+'</div><div>风险层权限</div><div>DTR / DLR / GPT / 情报 / 让球 = 提示层，不一票否决方向</div>"
if old_detail not in s: raise SystemExit('match detail selection block not found')
s=s.replace(old_detail,new_detail,1)

# Clean old headline wording elsewhere for current rows; historical fallback still works.
s=s.replace('最终胜平负选腿灯','方向/价值双灯')

p.write_text(s,encoding='utf-8')
Path('version.json').write_text(json.dumps({'build':build,'updated_at':'2026-09-09'},ensure_ascii=False)+'\n',encoding='utf-8')

out=p.read_text(encoding='utf-8')
assert build in out
assert 'function hjDualDirectionBadge' in out
assert 'function hjDualValueBadge' in out
assert 'function hjDualActionBadge' in out
assert '🎯方向</th><th>💰V</th><th>🎫出手' in out
assert 'DTR / DLR / GPT / 情报 / 让球 = 提示层' in out
print('patched v27 dual-light UI')
