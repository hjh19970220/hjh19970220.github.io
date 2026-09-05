from pathlib import Path
p=Path('index.html')
s=p.read_text()
old="const APP_BUILD='2026-09-05 豪竞爆冷诊断全中文v15';"
new="const APP_BUILD='2026-09-05 豪竞风险诊断全中文v16';"
if old not in s:
    raise SystemExit('build anchor missing')
s=s.replace(old,new,1)

# Refine third-direction display to v0.2: compare third direction with the formal first choice.
s=s.replace("CONFLICT_UNRESOLVED:'多方冲突，出口未定',DRAW_WATCH:'重点防平',OPPOSITE_WIN_WATCH:'重点防对面直接赢',UNRESOLVED:'暂未定位'", "CONFLICT_UNRESOLVED:'多方冲突，出口未定',DRAW_WATCH:'重点防平',OPPOSITE_WIN_WATCH:'重点防对面直接赢',THIRD_DIRECTION_WATCH:'第三方向需防',UNRESOLVED:'暂未定位'")
s=s.replace("gap=Number(s.third_direction_second_gap)", "gap=Number(s.third_direction_top1_gap)")
s=s.replace(" · 距第二'+(gap*100).toFixed(1)+'个百分点", " · 距首选'+(gap*100).toFixed(1)+'个百分点")

# Keep internal keys in English; only visible labels are Chinese.
s=s.replace("['数据质量A级','数据质量A级'],['数据质量B级','数据质量B级'],['数据质量C级','数据质量C级'],['数据质量D级','数据质量D级']", "['DQ-A','数据质量A级'],['DQ-B','数据质量B级'],['DQ-C','数据质量C级'],['DQ-D','数据质量D级']")

# Translate status labels that are shown to the user.
visible_status={
"'HAD_MIRROR_UNAVAILABLE':'⚪ HAD镜像暂缺'":"'HAD_MIRROR_UNAVAILABLE':'⚪ 胜平负赔率镜像暂缺'",
"'NO_ANCHOR_SP_UNAVAILABLE':'⛔ SP数据不足'":"'NO_ANCHOR_SP_UNAVAILABLE':'⛔ 竞彩赔率数据不足'",
"'FAIL_ALL_SP_UNAVAILABLE':'⛔ 数据不足'":"'FAIL_ALL_SP_UNAVAILABLE':'⛔ 竞彩赔率数据不足'",
"'HHAD_REVIEW_CONFLICT':'🟠 让球冲突'":"'HHAD_REVIEW_CONFLICT':'🟠 让球胜平负冲突'",
"'HHAD_POISSON_CONFLICT':'🟠 让球冲突'":"'HHAD_POISSON_CONFLICT':'🟠 让球胜平负冲突'",
"'HHAD_POISSON_UNAVAILABLE':'⚪ 泊松进球模型未确认'":"'HHAD_POISSON_UNAVAILABLE':'⚪ 让球进球模型未确认'",
"'HHAD_MARKET_ONLY':'⚪ 仅市场让球判断'":"'HHAD_MARKET_ONLY':'⚪ 仅让球市场判断'",
"'HHAD_POISSON_COMPLETE':'✅ 让球泊松进球模型确认'":"'HHAD_POISSON_COMPLETE':'✅ 让球进球模型确认'",
"'HHAD_POISSON_ALIGNED':'✅ 让球同向确认'":"'HHAD_POISSON_ALIGNED':'✅ 让球方向同向确认'"
}
for a,b in visible_status.items():
    s=s.replace(a,b)

# Main source cards and odds labels.
s=s.replace("sourceCard('竞彩 SP 合并主链'", "sourceCard('竞彩赔率合并主链'")
s=s.replace("' · HAD '+(ok.had_matches||0)+'/'+total+' · 让球胜平负 '", "' · 胜平负 '+(ok.had_matches||0)+'/'+total+' · 让球胜平负 '")
s=s.replace("' · HAD '+(f.had_matches||0)+'/'+total+' · 让球胜平负 '", "' · 胜平负 '+(f.had_matches||0)+'/'+total+' · 让球胜平负 '")
s=s.replace("sourceCard('William AH'", "sourceCard('William Hill 亚洲盘'")
s=s.replace("'当前镜像暂无可核验HAD赔率（官方状态未确认）'", "'当前镜像暂无可核验胜平负赔率（官方状态未确认）'")
s=s.replace("metric('竞彩赔率','HAD '+sp.had,'HHAD '+sp.line+'：'+sp.hhad", "metric('竞彩赔率','胜平负 '+sp.had,'让球胜平负 '+sp.line+'：'+sp.hhad")

# User-facing helper output: no PASS/ABSTAIN abbreviations.
s=s.replace("return lab+' PASS · '+sup", "return lab+' 不选 · '+sup")
s=s.replace("return String(h)+' · '+String(p)", "return String(h)+' · '+reasonZh(p)")
s=s.replace("return 'ABSTAIN'", "return '未给意见'")
s=s.replace("'⚪ ABSTAIN / 不调整'", "'⚪ 未给意见 / 不调整'")
s=s.replace("'⚪ ABSTAIN / 未仲裁'", "'⚪ 未给意见 / 未仲裁'")
s=s.replace("'ABSTAIN / 不调整'", "'未给意见 / 不调整'")
s=s.replace("'ABSTAIN / 未仲裁'", "'未给意见 / 未仲裁'")
s=s.replace("'GPT-5.6 Sol本轮未注入，ABSTAIN；不伪造二审结论。'", "'GPT-5.6 Sol本轮未注入，因此本场二审不发表意见；不伪造二审结论。'")
s=s.replace("'二审ABSTAIN，最终仍按正式门槛执行。'", "'二审未给意见，最终仍按正式门槛执行。'")

# Reason translator: preserve machine keys, translate them at render time.
needle="['Gate','门槛'],['HAD','胜平负'],['HHAD','让球胜平负'],['HUR','爆冷风险'],['DTR','平局尾险'],['DLR','直接输球风险'],"
repl="['Gate','门槛'],['Anchor','稳腿'],['Top1','首选方向'],['FT','全场'],['HAD','胜平负'],['HHAD','让球胜平负'],['HUR','爆冷总风险'],['DTR','平局尾险'],['DLR','直接输球风险'],['Margin','净胜球'],"
if needle in s:
    s=s.replace(needle,repl,1)

# Make detailed risk naming explicit.
s=s.replace("<div>三类风险</div>", "<div>爆冷 / 平局 / 直接输球三类风险</div>")
s=s.replace("<div>市场/模型冲突</div>", "<div>市场与模型冲突</div>")

p.write_text(s)
Path('version.json').write_text('{"build":"2026-09-05 豪竞风险诊断全中文v16","updated_at":"2026-09-05"}\n')
print('patched v16')
