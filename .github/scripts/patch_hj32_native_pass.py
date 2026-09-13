from pathlib import Path
import json
import re

NEW_BUILD = "2026-09-13 豪竞3.2前端v35-native-pass"
FILES = ["index.html", "latest.html", "live.html"]


def replace_function(text: str, name: str, replacement: str, required: bool = False) -> str:
    # Functions in these static pages are top-level and do not contain a top-level closing brace
    # before the next `function ...`; use the next function declaration as a stable boundary.
    pattern = rf"function {re.escape(name)}\([^\n]*?\)\{{.*?(?=\nfunction [A-Za-z0-9_]+\()"
    out, n = re.subn(pattern, replacement.rstrip() + "\n", text, count=1, flags=re.S)
    if required and n != 1:
        raise RuntimeError(f"failed to replace {name}: {n}")
    return out


def patch(text: str, required: bool = False) -> str:
    text, n = re.subn(
        r"const APP_BUILD='[^']+';",
        f"const APP_BUILD='{NEW_BUILD}';",
        text,
        count=1,
    )
    if required and n != 1:
        raise RuntimeError("APP_BUILD replacement failed")

    text = text.replace("🔀 豪竞2.7 单双选", "🔀 豪竞3.2 单双 / Native PASS")
    text = text.replace(
        "有把握单选 · 有可信第二方向双选 · 不可靠则PASS",
        "3.2先判断方向 · 红灯禁裸单不自动PASS · DQ-C降级不自动PASS · 仅硬条件才PASS",
    )

    # Insert helpers immediately after the single/double source accessor.
    accessor = "function hjSingleDoubleData(r){return r?.source_status?.single_double_v01||{}}"
    if accessor in text and "function hj32NativePassData" not in text:
        helpers = """function hjSingleDoubleData(r){return r?.source_status?.single_double_v01||{}}
function hj32NativePassData(r){return r?.source_status?.hj32_native_pass_v01||{}}
function hj32LegacyPassData(r){return r?.source_status?.hj32_legacy_pass_shadow_v01||{}}
function hj32NativePassActive(r){const x=hj32NativePassData(r),sd=hjSingleDoubleData(r);return String(x.status||'')==='ACTIVE_FORMAL_RUNTIME'||String(sd.status||'').includes('HJ32_NATIVE_PASS')||sd.native_pass_v01===true}
function hj32LegacyPassText(r){const x=hj32LegacyPassData(r);if(x.legacy_would_pass===true)return '旧机制会PASS · 仅影子，不再一票否决';if(String(x.status||'').includes('SHADOW'))return '旧机制未触发硬PASS · 仅影子';return '旧冻结未记录Native PASS影子'}"""
        text = text.replace(accessor, helpers, 1)
    elif required and "function hj32NativePassData" not in text:
        raise RuntimeError("single/double accessor not found")

    text = replace_function(
        text,
        "hjDualActionBadge",
        """function hjDualActionBadge(r){
 const sd=hjSingleDoubleData(r),c=String(sd.class_code||'').toUpperCase(),native=hj32NativePassActive(r);
 if(native&&c==='STRONG_DOUBLE')return '🟣 强双保护';
 if(native&&c==='CANDIDATE_DOUBLE')return '🟠 候选双·禁裸单';
 if(native&&c==='PASS')return '⚪ 硬PASS';
 const a=String(hjDualData(r).action_tier||'').toUpperCase();
 const m={PRIORITY:'⭐ 优先出手',DIRECTION:'🟢 方向可打',DIRECTION_NO_HAD:'🟢 方向强·普通胜平负暂不可执行',VALUE_B:'💰 B档价值',WATCH:'🟡 观察',PASS:'🔴 旧执行PASS',PASS_UNAVAILABLE:'⚪ 不可用'};
 return m[a]||'⚪ 出手未确认';
}""",
        required,
    )

    text = replace_function(
        text,
        "hjSingleDoubleBadge",
        """function hjSingleDoubleBadge(r){
 const x=hjSingleDoubleData(r),c=String(x.class_code||'').toUpperCase(),native=hj32NativePassActive(r);
 if(c==='SINGLE')return '🟢 单选';
 if(c==='STRONG_DOUBLE')return '🟣 强双';
 if(c==='CANDIDATE_DOUBLE')return native?'🟠 候选双·禁裸单':'🟠 候选双';
 if(c==='PASS')return native?'⚪ 硬PASS':'⚪ PASS（旧冻结）';
 return '⚪ 待新运行';
}""",
        required,
    )

    text = replace_function(
        text,
        "hjSingleDoublePicks",
        """function hjSingleDoublePicks(r){
 const x=hjSingleDoubleData(r),ps=Array.isArray(x.picks)?x.picks.filter(Boolean):[];
 if(ps.length)return ps.join(' + ');
 return String(x.class_code||'').toUpperCase()==='PASS'?(hj32NativePassActive(r)?'硬PASS':'PASS'):'未确认';
}""",
        required,
    )

    text = replace_function(
        text,
        "hjSingleDoubleDetailSection",
        """function hjSingleDoubleDetailSection(r){
 const x=hjSingleDoubleData(r),c=String(x.class_code||'').toUpperCase();
 if(!c)return '';
 const np=hj32NativePassData(r),native=hj32NativePassActive(r),top1Changed=(x.top1_core_unchanged===true||x.top1_unchanged===true)?'否':'未确认',probChanged=x.probability_unchanged===true?'否':'未确认';
 const nativeState=native?'✅ Native PASS已生效':'🧊 旧冻结口径';
 const redPolicy=native?'红灯=禁止裸单；优先保留Top1+可信第二方向，不自动PASS':'按该场冻结时的旧规则解释';
 const dqPolicy=native?'DQ-C=降执行等级/禁裸单，不自动PASS；DQ-D才是数据硬PASS':'按该场冻结时的旧规则解释';
 return '<section class="section"><div class="shead"><h2>🔀 豪竞3.2 单双 / Native PASS</h2><span>3.2先完成判断 · PASS只做最后刹车</span></div><div class="cards"><div class="card feature"><div class="kv"><div>单双类型</div><div><b>'+esc(hjSingleDoubleBadge(r))+'</b></div><div>执行方向</div><div><b>'+esc(hjSingleDoublePicks(r))+'</b></div><div>动作</div><div>'+esc(x.action||'—')+'</div><div>Native状态</div><div>'+esc(nativeState)+'</div><div>判定理由</div><div>'+esc(x.reason||np.reason||'—')+'</div></div></div><div class="card"><div class="kv"><div>正式Top1</div><div>'+esc(r.top1||'未确认')+'</div><div>第二方向</div><div>'+esc(r.second_pick||'—')+'</div><div>红灯现在代表</div><div>'+esc(redPolicy)+'</div><div>DQ-C现在代表</div><div>'+esc(dqPolicy)+'</div><div>Legacy PASS</div><div>'+esc(hj32LegacyPassText(r))+'</div><div>是否改Top1</div><div>'+esc(top1Changed)+'</div><div>是否改概率</div><div>'+esc(probChanged)+'</div></div></div></div></section>';
}""",
        required,
    )

    old = " if(a==='PASS'||dir==='RED')return '方向本身偏弱：PASS；即使赔率有价值也不复活。';"
    new = """ const sdClass=String(hjSingleDoubleData(r).class_code||'').toUpperCase(),sdNative=hj32NativePassActive(r);
 if(sdNative&&sdClass==='STRONG_DOUBLE')return '豪竞3.2强双保护：风险存在，但不PASS；按双向保护处理。';
 if(sdNative&&sdClass==='CANDIDATE_DOUBLE')return '豪竞3.2 Native PASS：禁止裸单，保留Top1 + 第二方向观察；旧红灯不再一票否决。';
 if(sdNative&&sdClass==='PASS')return '豪竞3.2硬PASS：当前无法形成可靠可执行结构。';
 if(a==='PASS'||dir==='RED')return '旧方向红灯/旧PASS仅作风险提示；是否硬PASS以3.2 Native PASS为准。';"""
    if old in text:
        text = text.replace(old, new, 1)
    elif required and "旧方向红灯/旧PASS仅作风险提示" not in text:
        raise RuntimeError("quick decision patch target missing")

    render_old = "function renderHaojing(){return modelHeader()+plays()+rowsTable('hj')+sourceStatusSection()}"
    if render_old in text:
        notice = """function hj32NativePassNotice(){const a=activeByRole('hj'),run=DATA?.hj?.run,tag=String(a?.revision_tag||''),on=tag.includes('native-pass'),cur=!!(on&&run&&Number(run.model_revision_id)===Number(a.id));if(!on)return '';const state=cur?'当前冻结盘已按Native PASS运行':'当前active已升级，等待下一次新赛前冻结正式落地';return '<div class="notice good"><b>🛡️ 豪竞3.2 Native PASS：</b> '+esc(state)+'。红灯不再自动PASS，先禁裸单并寻找第二方向；DQ-C降级但不自动删除模型观点；DQ-D / Top1缺失 / 非法赛前冻结 / 正式硬冲突才允许硬PASS。<br><span class="tiny">A/B/C、Anchor和具体玩法仍有独立执行闸门，可以PASS，但不会反向抹掉全池Top1判断。</span></div>'}
function renderHaojing(){return modelHeader()+hj32NativePassNotice()+plays()+rowsTable('hj')+sourceStatusSection()}"""
        text = text.replace(render_old, notice, 1)
    elif required and "function hj32NativePassNotice" not in text:
        raise RuntimeError("renderHaojing target missing")

    text = text.replace("metric('PASS隔离'", "metric('历史PASS隔离'")
    text = text.replace("metric('PASS误杀'", "metric('历史PASS误杀'")
    return text


changed = []
for name in FILES:
    p = Path(name)
    if not p.exists():
        continue
    before = p.read_text(encoding="utf-8")
    after = patch(before, required=(name == "index.html"))
    if after != before:
        p.write_text(after, encoding="utf-8")
        changed.append(name)

idx = Path("index.html").read_text(encoding="utf-8")
assert NEW_BUILD in idx
assert "豪竞3.2 单双 / Native PASS" in idx
assert "function hj32NativePassData" in idx
assert "候选双·禁裸单" in idx
assert "旧方向红灯/旧PASS仅作风险提示" in idx
assert "function hj32NativePassNotice" in idx

Path("version.json").write_text(
    json.dumps({"build": NEW_BUILD, "updated_at": "2026-09-13"}, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print("patched", changed)
