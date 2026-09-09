from pathlib import Path
import re, json

p=Path('index.html')
s=p.read_text(encoding='utf-8')
build='2026-09-09 豪竞2.5完整双灯补水v29'

s=re.sub(r"const APP_BUILD='[^']+';", f"const APP_BUILD='{build}';", s, count=1)

helper=r'''async function hydrateHjFullSource(j){
 const runId=Number(j?.hj?.run?.id||0),rows=Array.isArray(j?.hj?.rows)?j.hj.rows:[];
 if(!runId||!rows.length)return j;
 try{
  const rr=await fetch(API+'?api=1&run_id='+encodeURIComponent(runId)+'&t='+Date.now(),{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
  if(!rr.ok)return j;
  const full=await rr.json();
  const fr=Array.isArray(full?.detail?.rows)?full.detail.rows:[];
  if(!fr.length)return j;
  const by=new Map(fr.map(x=>[String(x.match_no),x]));
  for(const r of rows){
   const f=by.get(String(r.match_no));
   if(!f)continue;
   r.source_status={...(r.source_status||{}),...(f.source_status||{})};
  }
 }catch(e){console.warn('hydrateHjFullSource failed',e)}
 return j;
}
'''

marker='async function load(show=false){'
if 'async function hydrateHjFullSource(j)' not in s:
    if marker not in s: raise SystemExit('load marker missing')
    s=s.replace(marker,helper+marker,1)

old="const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'读取失败');const oldHistory="
new="const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'读取失败');await hydrateHjFullSource(j);const oldHistory="
if old not in s: raise SystemExit('load hydration target missing')
s=s.replace(old,new,1)

# User-facing naming: never show V灯 shorthand on current UI.
s=s.replace('💰V</th>','💰价值灯</th>')
s=s.replace('💰 V灯','💰 价值灯')
s=s.replace('💰V灯','💰价值灯')
s=s.replace('V正价值','正价值').replace('V负价值','负价值').replace('V未确认','价值未确认')

p.write_text(s,encoding='utf-8')
Path('version.json').write_text(json.dumps({'build':build,'updated_at':'2026-09-09'},ensure_ascii=False)+'\n',encoding='utf-8')

out=p.read_text(encoding='utf-8')
assert build in out
assert 'async function hydrateHjFullSource(j)' in out
assert 'await hydrateHjFullSource(j)' in out
assert 'selection_dual_light_v01' in out
assert '价值灯' in out
print('patched v29 full source hydration')
