from pathlib import Path
import subprocess, json
import numpy as np
import soundfile as sf
from kokoro import KPipeline
ROOT=Path('sauron-video'); SCRIPT=ROOT/'scripts/2026-09-15/012-ipswich-arsenal.md'; OUT=ROOT/'output/full-video'; OUT.mkdir(parents=True,exist_ok=True)
md=SCRIPT.read_text(encoding='utf-8'); text=md.split('## 口播文案',1)[1].split('## 自动素材关键词',1)[0].strip(); paras=[x.strip().replace('\n',' ') for x in text.split('\n\n') if x.strip()]
pipe=KPipeline(lang_code='z'); audios=[]; timings=[]; t=0.0
# V2: faster football-commentary delivery, shorter dead air.
for p in paras:
    chunks=[a for _,_,a in pipe(p,voice='zm_yunxi',speed=1.20)]
    if not chunks: continue
    a=np.concatenate(chunks); dur=len(a)/24000; audios.append(a); timings.append((t,t+dur,p)); t+=dur+0.10; audios.append(np.zeros(int(24000*.10),dtype=np.float32))
sf.write(OUT/'voice.wav',np.concatenate(audios),24000)
def ts(x):
    h=int(x//3600); x-=h*3600; m=int(x//60); x-=m*60; return f'{h:02}:{m:02}:{x:06.3f}'.replace('.',',')
def wrap(s,n=17):
    s=s.replace(' ',''); return '\n'.join(s[i:i+n] for i in range(0,len(s),n))
with open(OUT/'subs.srt','w',encoding='utf-8') as f:
    for i,(a,b,p) in enumerate(timings,1): f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{wrap(p)}\n\n')
# Semantic search pool: each paragraph gets a visual intent; no cyclic reuse.
semantic_queries=[]
for p in paras:
    if any(k in p for k in ['0比0','防守','维持','风险']): q='soccer defensive line match'
    elif any(k in p for k in ['领先','进球','打开','扩大比分']): q='football goal celebration players'
    elif any(k in p for k in ['阵型','空间','往前','对攻']): q='football counter attack training'
    elif any(k in p for k in ['轮换','替补','赛程','消耗']): q='football substitutes bench'
    elif any(k in p for k in ['主场','球迷','情绪']): q='football fans stadium night'
    elif any(k in p for k in ['索伦','判断','方向','总结']): q='football coach tactics board'
    elif any(k in p for k in ['实力','优势','阿森纳']): q='soccer attacking run match'
    else: q='football stadium night crowd'
    semantic_queries.append(q)
queries=[]
for q in semantic_queries:
    if q not in queries: queries.append(q)
subprocess.run(['python',str(ROOT/'tools/pexels_fetch.py'),*queries],check=True)
subprocess.run(['python',str(ROOT/'tools/download_broll.py')],check=True)
clips=sorted((ROOT/'output/broll-test').glob('*.mp4'))
if not clips: raise SystemExit('NO_BROLL')
# V2 hard rule: unique clip use only. Shorten visual cuts rather than loop/repeat.
segments=[]; cur=0.0
for idx,src in enumerate(clips):
    if cur>=t: break
    segdur=min(5.0,t-cur); seg=OUT/f'v2seg{idx:03}.mp4'
    subprocess.run(['ffmpeg','-y','-i',str(src),'-t',str(segdur),'-an','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30','-c:v','libx264','-preset','veryfast','-crf','23',str(seg)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    segments.append(seg); cur+=segdur
# If stock pool ends, freeze last frame rather than repeating footage; later V2.1 replaces this with tactical cards.
if cur<t and segments:
    hold=OUT/'v2hold.mp4'; remain=t-cur
    subprocess.run(['ffmpeg','-y','-sseof','-0.1','-i',str(segments[-1]),'-vf',f'tpad=stop_mode=clone:stop_duration={remain},fps=30','-t',str(remain),'-an','-c:v','libx264','-preset','veryfast','-crf','23',str(hold)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); segments.append(hold)
with open(OUT/'concat.txt','w') as f:
    for p in segments: f.write("file '"+p.name+"'\n")
final=OUT/'sauron-ipswich-arsenal-v2.mp4'
subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-i',str(OUT/'voice.wav'),'-t',str(t),'-vf',"subtitles="+str(OUT/'subs.srt')+":force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Alignment=2,MarginV=90'",'-c:v','libx264','-preset','veryfast','-crf','24','-c:a','aac','-b:a','112k','-movflags','+faststart',str(final)],check=True)
print('FULL_VIDEO_V2_OK',round(t,1),'seconds',len(clips),'unique_broll',len(segments),'segments')
