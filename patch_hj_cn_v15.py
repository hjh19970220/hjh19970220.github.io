from pathlib import Path
p=Path('index.html')
s=p.read_text()
old_build="const APP_BUILD='2026-09-05 任9正式票面v14';"
new_build="const APP_BUILD='2026-09-05 豪竞爆冷诊断全中文v15';"
if old_build not in s:
    raise SystemExit('APP_BUILD anchor not found')
s=s.replace(old_build,new_build,1)

anchor="function hjRiskBadge(r){const xs=[r?.hur,r?.dtr,r?.dlr].filter(Boolean);if(xs.includes('红'))return '🔴 高';if(xs.includes('黄'))return '🟡 中';if(xs.length&&xs.every(x=>x==='绿'||x==='NA'))return '🟢 低';return '⚪ 未确认'}"
insert=anchor+"\n"+r'''function hjUpsetDiag(r){
 const s=r?.source_status||{},exitMap={DRAW:'平局',OPPOSITE_WIN:'对面直接赢',MIXED_TAIL:'平局或对面直接赢',DRAW_THIRD_DIRECTION:'平局（第三方向已贴近）',THIRD_DIRECTION:'第三方向反杀',CONFLICT_UNRESOLVED:'多方冲突，出口未定',DRAW_WATCH:'重点防平',OPPOSITE_WIN_WATCH:'重点防对面直接赢',UNRESOLVED:'暂未定位'};
 const primary=exitMap[s.upset_primary_exit]||'暂未定位';
 const level=String(s.third_direction_threat_level||''),pick=s.third_direction_pick||'—',prob=Number(s.third_direction_prob),gap=Number(s.third_direction_second_gap);
 const third=level==='HIGH'?'🔴 高威胁 · '+pick+(Number.isFinite(prob)?' '+(prob*100).toFixed(1)+'%':'')+(Number.isFinite(gap)?' · 距第二'+(gap*100).toFixed(1)+'个百分点':''):level==='MEDIUM'?'🟡 中威胁 · '+pick+(Number.isFinite(prob)?' '+(prob*100).toFixed(1)+'%':'')+(Number.isFinite(gap)?' · 距第二'+(gap*100).toFixed(1)+'个百分点':''):level==='LOW'?'🟢 低':'⚪ 未确认';
 const conflict=String(s.conflict_diagnostic_level||'');
 const conflictZh=conflict==='STRONG'?'🔴 强冲突':conflict==='MEDIUM'?'🟡 有冲突':conflict==='LOW'?'🟢 无明显冲突':'⚪ 未确认';
 return {primary,third,conflict:conflictZh,level};
}'''
if anchor not in s:
    raise SystemExit('hjRiskBadge anchor not found')
s=s.replace(anchor,insert,1)

s=s.replace("const riskTxt='HUR '+(r.hur||'未确认')+' / DTR '+(r.dtr||'未确认')+' / DLR '+(r.dlr||'未确认');","const riskTxt='爆冷总风险 '+(r.hur||'未确认')+' / 平局尾险 '+(r.dtr||'未确认')+' / 直接输球风险 '+(r.dlr||'未确认');")
s=s.replace("'<div>HUR / DTR / DLR</div><div>'+esc(riskTxt)+'</div>'","'<div>三类风险</div><div>'+esc(riskTxt)+'</div>'")
old="function hjQuickConclusion(r){\n  const s=r?.source_status||{},risk=hjRiskBadge(r),light=String(s.final_selection_light||'').toUpperCase(),p=Number(s.top1_prob);\n  if(risk.includes('高'))return '热门尾部风险高，优先复核平/冷，不宜只看首选方向。';"
new="function hjQuickConclusion(r){\n  const s=r?.source_status||{},risk=hjRiskBadge(r),light=String(s.final_selection_light||'').toUpperCase(),p=Number(s.top1_prob),diag=hjUpsetDiag(r);\n  if(s.upset_type_diagnostic_status==='CONFIRMED_FROZEN_INPUTS'&&diag.primary!=='暂未定位')return '爆冷类型诊断：'+diag.primary+'；正式首选方向不自动翻转。';\n  if(risk.includes('高'))return '热门尾部风险高，优先复核平局或对面直接赢，不宜只看首选方向。';"
if old not in s:
    raise SystemExit('quick conclusion anchor not found')
s=s.replace(old,new,1)
old="  const s=r?.source_status||{},p=topProb(r),d=hjPoissonScoreData(r),goal=d?d.goalBand.label+' '+(d.goalBand.p*100).toFixed(1)+'%':'';"
new="  const s=r?.source_status||{},p=topProb(r),d=hjPoissonScoreData(r),diag=hjUpsetDiag(r),goal=d?d.goalBand.label+' '+(d.goalBand.p*100).toFixed(1)+'%':'';"
if old not in s:
    raise SystemExit('quick card const anchor not found')
s=s.replace(old,new,1)
old="    '<div class=\"hjqchips\"><span class=\"hjqchip\">'+esc(hjRiskBadge(r))+'</span><span class=\"hjqchip\">'+esc(hjFinalLeg(r))+'</span>'+(goal?'<span class=\"hjqchip\">⚽ '+esc(goal)+'</span>':'')+'</div>'+"
new="    '<div class=\"hjqchips\"><span class=\"hjqchip\">爆冷总风险 '+esc(hjRiskBadge(r))+'</span><span class=\"hjqchip\">'+esc(hjFinalLeg(r))+'</span>'+(s.upset_type_diagnostic_status==='CONFIRMED_FROZEN_INPUTS'?'<span class=\"hjqchip\">爆冷出口：'+esc(diag.primary)+'</span>':'')+(diag.level==='HIGH'||diag.level==='MEDIUM'?'<span class=\"hjqchip\">第三方向：'+esc(diag.third)+'</span>':'')+(goal?'<span class=\"hjqchip\">⚽ '+esc(goal)+'</span>':'')+'</div>'+"
if old not in s:
    raise SystemExit('quick chips anchor not found')
s=s.replace(old,new,1)
s=s.replace("<span>5秒看方向 · 风险 · 最高概率3个比分 · 完整证据点比赛查看</span>","<span>5秒看方向 · 爆冷类型 · 第三方向 · 风险 · 完整证据点比赛查看</span>",1)
visible_repls={
  '<div>爆冷风险</div>':'<div>爆冷总风险</div>',
  '<div>HUR / DTR / DLR</div>':'<div>三类风险</div>',
  'HUR爆冷风险红灯':'爆冷总风险红灯','HUR爆冷风险黄灯':'爆冷总风险黄灯',
  'DTR平局尾险红灯':'平局尾险红灯','DTR平局尾险黄灯':'平局尾险黄灯',
  'DLR直接输球风险红灯':'直接输球风险红灯','DLR直接输球风险黄灯':'直接输球风险黄灯',
  'FT分离度':'全场方向分离度','FT Top1':'全场首选方向','HAD最终选腿':'胜平负最终选腿',
  '让球HHAD':'让球胜平负','HHAD让球':'让球胜平负','HAD SP':'胜平负竞彩赔率','HHAD SP':'让球胜平负竞彩赔率',
  '竞彩SP':'竞彩赔率','Asia4':'四机构亚洲盘','Poisson':'泊松进球模型','Elo实力差':'实力评分差',
  'DQ-A':'数据质量A级','DQ-B':'数据质量B级','DQ-C':'数据质量C级','DQ-D':'数据质量D级'
}
for a,b in visible_repls.items():
    s=s.replace(a,b)
old="function matchDetail(){const d=DETAIL,r=d?.row;if(!r)return '';if(d.kind==='hc')return hcMatchDetail(r);const s=r.source_status||{},e=s.evidence_domains||s.evidence_completeness||{},tl=Array.isArray(s.market_timeline)?s.market_timeline:[],sp=hjSpDisplay(r);const scoreSec=hjScoreMatrixSection(r);return "
new="function matchDetail(){const d=DETAIL,r=d?.row;if(!r)return '';if(d.kind==='hc')return hcMatchDetail(r);const s=r.source_status||{},e=s.evidence_domains||s.evidence_completeness||{},tl=Array.isArray(s.market_timeline)?s.market_timeline:[],sp=hjSpDisplay(r),diag=hjUpsetDiag(r);const scoreSec=hjScoreMatrixSection(r);return "
if old not in s:
    raise SystemExit('matchDetail anchor not found')
s=s.replace(old,new,1)
old="<div>直接输球风险</div><div>'+esc(r.dlr||'—')+'</div><div>全场方向分离度</div>"
new="<div>直接输球风险</div><div>'+esc(r.dlr||'—')+'</div><div>最可能爆冷出口</div><div>'+esc(diag.primary)+'</div><div>第三方向威胁</div><div>'+esc(diag.third)+'</div><div>市场/模型冲突</div><div>'+esc(diag.conflict)+'</div><div>全场方向分离度</div>"
if old not in s:
    raise SystemExit('risk detail anchor not found')
s=s.replace(old,new,1)
p.write_text(s)
Path('version.json').write_text('{"build":"2026-09-05 豪竞爆冷诊断全中文v15","updated_at":"2026-09-05"}\n')
print('patched')
