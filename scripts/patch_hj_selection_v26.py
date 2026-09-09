from pathlib import Path
import re, json

p = Path('index.html')
s = p.read_text(encoding='utf-8')

new_fn = r'''function hjSelectionLightLabel(r){
 const s=r?.source_status||{},v=s.hj25_value_gate||{};
 let raw=String(s.final_selection_light||'').toUpperCase();
 const eligible=(s.final_selection_eligible===true||String(s.final_selection_eligible).toLowerCase()==='true');
 const vBase=(v.base_final_selection_eligible===true||String(v.base_final_selection_eligible).toLowerCase()==='true');
 const vAction=String(v.action||'').toUpperCase(),vLight=String(v.value_light||'').toUpperCase();
 const handling=String(r?.final_handling||r?.anchor_status||'').toUpperCase();
 const keep=String(r?.keep_discard||'').toUpperCase();
 const hasTicket=!!(r?.ticket_pick_after_gate||r?.ticket_pick);

 // 首页API偶尔裁掉 final_selection_light；只在真实灯缺失时，用同一正式决策字段确定性还原展示。
 if(!raw){
   if(hasTicket||keep==='KEEP') raw='GREEN';
   else if(handling.includes('REVIEW_YELLOW')) raw='YELLOW';
   else if(keep==='DISCARD_VALUE'||handling==='VALUE_PASS'){
     if(vLight==='RED'||vAction.includes('CONFLICT')||vAction.includes('NEGATIVE')) return '🔴 V Gate淘汰·原绿腿';
     return '⚪ V Gate淘汰·原绿腿';
   }
   else if(keep==='DISCARD'||handling.includes('NO_ANCHOR_RED')||handling.includes('FORMAL_COLD_REVERSAL_TOP1_ONLY')) raw='RED';
 }

 // Value Gate对原绿腿的正式淘汰优先于基础绿灯展示。
 if(vBase&&!eligible&&vAction&&vAction!=='VALUE_ELIGIBLE'){
   if(vLight==='GREY')return '⚪ V未确认·原绿灯淘汰';
   if(vLight==='RED')return '🔴 V Gate淘汰·原绿灯';
   return '⚪ V Gate淘汰·原绿灯';
 }
 if(raw==='GREEN')return eligible||hasTicket||keep==='KEEP'?'🟢 正式可选':'🟢 基础绿灯';
 if(raw==='YELLOW')return '🟡 未达选腿质量';
 if(raw==='RED')return '🔴 最终淘汰';
 if(raw==='UNAVAILABLE')return '⚪ 无正式HAD资格';
 return '⚪ 未确认';
}'''

pat = re.compile(r"function hjSelectionLightLabel\(r\)\{.*?\n\}\nfunction hjFinalLeg", re.S)
m = pat.search(s)
if not m:
    raise SystemExit('selection helper not found')
s = s[:m.start()] + new_fn + '\nfunction hjFinalLeg' + s[m.end():]
s = re.sub(r"const APP_BUILD='[^']+';", "const APP_BUILD='2026-09-09 豪竞2.5选腿灯API兜底修复v26';", s, count=1)
p.write_text(s, encoding='utf-8')

Path('version.json').write_text(json.dumps({"build":"2026-09-09 豪竞2.5选腿灯API兜底修复v26","updated_at":"2026-09-09"}, ensure_ascii=False)+"\n", encoding='utf-8')

# basic assertions
out = p.read_text(encoding='utf-8')
assert "V Gate淘汰·原绿腿" in out
assert "if(!raw)" in out
assert "豪竞2.5选腿灯API兜底修复v26" in out
print('patched v26')
