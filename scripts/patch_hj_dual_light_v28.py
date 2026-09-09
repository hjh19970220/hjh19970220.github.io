from pathlib import Path
import re, json

p=Path('index.html')
s=p.read_text(encoding='utf-8')
build='2026-09-09 豪竞2.5方向价值双灯v28'

s=re.sub(r"const APP_BUILD='[^']+';", f"const APP_BUILD='{build}';", s, count=1)

# 1) Replace current dual-light helpers with the real nested backend path.
new_helpers=r'''function hjDualData(r){return r?.source_status?.selection_dual_light_v01||{}}
function hjDualDirectionBadge(r){
 const d=hjDualData(r),x=String(d.direction_light||r?.source_status?.final_selection_light||'').toUpperCase();
 if(x==='GREEN')return '🟢 方向强';
 if(x==='YELLOW')return '🟡 方向观察';
 if(x==='RED')return '🔴 方向不出手';
 if(x==='UNAVAILABLE')return '⚪ 方向未确认';
 return '⚪ 方向未确认';
}
function hjDualValueBadge(r){
 const d=hjDualData(r),v=String(d.value_light||r?.source_status?.hj25_value_gate?.value_light||'GREY').toUpperCase();
 if(v==='GREEN')return '🟢 正价值';
 if(v==='RED')return '🔴 负价值';
 return '⚪ 价值未确认';
}
function hjDualActionBadge(r){
 const a=String(hjDualData(r).action_tier||'').toUpperCase();
 const m={PRIORITY:'⭐ 优先出手',DIRECTION:'🟢 方向可打',DIRECTION_NO_HAD:'🟢 方向强·普通胜平负暂不可执行',VALUE_B:'💰 B档价值',WATCH:'🟡 观察',PASS:'🔴 PASS',PASS_UNAVAILABLE:'⚪ 不可用'};
 return m[a]||'⚪ 出手未确认';
}
function hjFinalLeg(r){const s=r?.source_status||{},x=hjDualActionBadge(r);return s.prematch_lock===true?'🔒 '+x:x}'''
pat=re.compile(r"function hjDualDirectionBadge\(r\)\{.*?function hjFinalLeg\(r\)\{[^\n]*\}",re.S)
m=pat.search(s)
if not m:
    raise SystemExit('dual helper block not found')
s=s[:m.start()]+new_helpers+s[m.end():]

# 2) Rename Value UI from V-light to plain Chinese '价值灯'.
s=s.replace("if(l==='GREEN')return '🟢 V';if(l==='RED')return '🔴 V';return '⚪ V'", "if(l==='GREEN')return '🟢 价值灯';if(l==='RED')return '🔴 价值灯';return '⚪ 价值未确认'")
s=s.replace("lab=l==='GREEN'?'🟢 V绿灯':l==='RED'?'🔴 V红灯':'⚪ V灰灯'", "lab=l==='GREEN'?'🟢 价值绿灯':l==='RED'?'🔴 价值红灯':'⚪ 价值未确认'")
s=s.replace('💎 豪竞2.5 V灯','💎 豪竞2.5 价值灯')
s=s.replace('<div>V灯</div>','<div>价值灯</div>')
s=s.replace('V灯只做价值资格/否决：绿V只能保留原本已合格腿；红/灰V可否决；禁止靠V灯翻Top1或复活PASS。','价值灯只评价当前赔率是否有价值；不翻Top1、不否决方向。最终出手由方向灯 + 价值灯 + 市场可执行性共同决定。')
s=s.replace("metric('💰 V灯',hjDualValueBadge(r),'只回答当前赔率价值，不否决方向')", "metric('💰 价值灯',hjDualValueBadge(r),'只回答当前赔率价值，不否决方向')")
s=s.replace('<div>💰V灯</div>', '<div>💰价值灯</div>')
s=s.replace('<th>💰V</th>', '<th>💰价值灯</th>')
s=s.replace('💰V', '💰价值灯')
s=s.replace('V正价值','正价值').replace('V负价值','负价值').replace('V未确认','价值未确认')
s=s.replace('V Gate','价值门槛').replace('V灯','价值灯')

# 3) Make current quick conclusion follow the new action tier, not the legacy final-selection gate.
new_conclusion=r'''function hjQuickConclusion(r){
 const d=hjDualData(r),a=String(d.action_tier||'').toUpperCase(),dir=String(d.direction_light||'').toUpperCase(),val=String(d.value_light||'GREY').toUpperCase();
 if(a==='PRIORITY')return '方向强 + 价格有价值：优先出手。';
 if(a==='DIRECTION')return val==='RED'?'方向强，可以出手；但当前赔率性价比偏差。':'方向强，可正常考虑出手。';
 if(a==='DIRECTION_NO_HAD')return '方向强，但普通胜平负当前暂不可执行；不要把“无赔率”误判成方向不行。';
 if(a==='VALUE_B')return '方向处于观察档，但赔率存在正价值：B档价值机会，不冒充稳腿。';
 if(a==='WATCH')return '方向证据一般，暂列观察；风险提示层不再一票否决。';
 if(a==='PASS'||dir==='RED')return '方向本身偏弱：PASS；即使赔率有价值也不复活。';
 return '等待方向灯 / 价值灯 / 出手档位完成确认。';
}'''
pat2=re.compile(r"function hjQuickConclusion\(r\)\{.*?\n\}",re.S)
m2=pat2.search(s)
if not m2:
    raise SystemExit('hjQuickConclusion not found')
s=s[:m2.start()]+new_conclusion+s[m2.end():]

# 4) Clarify the quick-card legend and detail semantics.
s=s.replace('5秒只看：🎯方向 · 💰价值 · 🎫出手；其他风险点进比赛看','5秒只看：🎯方向灯 · 💰价值灯 · 🎫出手档位；其他风险点进比赛看')
s=s.replace('方向/价值双灯','方向灯 / 价值灯')
s=s.replace('DTR / DLR / GPT / 情报 / 让球 = 提示层，不一票否决方向','DTR / DLR / GPT二审 / 情报 / 让球 = 提示层，不再一票否决方向')

p.write_text(s,encoding='utf-8')
Path('version.json').write_text(json.dumps({'build':build,'updated_at':'2026-09-09'},ensure_ascii=False)+'\n',encoding='utf-8')

out=p.read_text(encoding='utf-8')
assert build in out
assert 'selection_dual_light_v01' in out
assert "return '🟢 正价值'" in out
assert '💰价值灯' in out or '💰 价值灯' in out
assert '方向强 + 价格有价值：优先出手。' in out
assert 'V正价值' not in out
print('patched v28')
