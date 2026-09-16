from pathlib import Path
import subprocess, json, re
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT=Path('sauron-video')
SCRIPT=ROOT/'scripts/2026-09-15/004-johor-buriram-review.md'
OUT=ROOT/'output/full-video'; OUT.mkdir(parents=True,exist_ok=True)
PEXELS=ROOT/'output/pexels-test/manifest.json'
BROLL=ROOT/'output/broll-test'

md=SCRIPT.read_text(encoding='utf-8')
text=md.split('## 口播文案',1)[1].split('## 逐句视觉意图',1)[0].strip()
paras=[x.strip().replace('\n',' ') for x in text.split('\n\n') if x.strip()]

# Natural Chinese male voice; paragraph timing is the master timeline.
pipe=KPipeline(lang_code='z'); audios=[]; timings=[]; t=0.0
for p in paras:
    chunks=[a for _,_,a in pipe(p,voice='zm_yunxi',speed=1.18)]
    if not chunks: continue
    a=np.concatenate(chunks); dur=len(a)/24000
    audios.append(a); timings.append((t,t+dur,p)); t+=dur+0.10
    audios.append(np.zeros(int(24000*.10),dtype=np.float32))
sf.write(OUT/'voice.wav',np.concatenate(audios),24000)

def ts(x):
    h=int(x//3600); x-=h*3600; m=int(x//60); x-=m*60
    return f'{h:02}:{m:02}:{x:06.3f}'.replace('.',',')
def wrap(s,n=17):
    s=s.replace(' ',''); return '\n'.join(s[i:i+n] for i in range(0,len(s),n))
with open(OUT/'subs.srt','w',encoding='utf-8') as f:
    for i,(a,b,p) in enumerate(timings,1):
        f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{wrap(p)}\n\n')

# Paragraph -> visual intent. Queries are deliberately distinct so footage follows meaning.
def visual_query(p):
    if any(k in p for k in ['一比一','最终','第二方向']): return 'football stadium night tension'
    if any(k in p for k in ['柔佛','主队','相信']): return 'soccer attacking team match'
    if any(k in p for k in ['第二条路','原因','模型']): return 'football coach tactics board'
    if any(k in p for k in ['平局风险','优势存在','压掉']): return 'soccer defensive line match'
    if any(k in p for k in ['二十六分钟','四十三分钟','先下一城','扳成']): return '__EVENT_SCORE__'
    if any(k in p for k in ['少打一人','最后阶段','机会']): return '__EVENT_PRESSURE__'
    if any(k in p for k in ['真正难的','热门']): return 'football tactics analysis board'
    return 'football stadium night crowd'

semantic_queries=[]
for p in paras:
    q=visual_query(p)
    if not q.startswith('__') and q not in semantic_queries: semantic_queries.append(q)
subprocess.run(['python',str(ROOT/'tools/pexels_fetch.py'),*semantic_queries],check=True)
subprocess.run(['python',str(ROOT/'tools/download_broll.py')],check=True)

manifest=json.loads(PEXELS.read_text(encoding='utf-8'))
# download_broll names files using a numeric prefix; map Pexels video id back to local file.
local=list(BROLL.glob('*.mp4'))
def local_for_id(vid):
    s=str(vid)
    exact=[p for p in local if s in p.stem]
    return exact[0] if exact else None

by_query={}
for v in manifest.get('videos',[]):
    p=local_for_id(v.get('id'))
    if p: by_query.setdefault(v.get('query'),[]).append((v,p))

used_ids=set(); last_id=None
def choose_clip(query):
    global last_id
    candidates=by_query.get(query,[])
    # Hard rules: never reuse a Pexels video and never repeat adjacent IDs.
    for meta,p in candidates:
        vid=meta.get('id')
        if vid not in used_ids and vid != last_id:
            used_ids.add(vid); last_id=vid; return p,meta
    # Semantic fallback: unused clip from the whole pool, still no reuse.
    for q,items in by_query.items():
        for meta,p in items:
            vid=meta.get('id')
            if vid not in used_ids and vid != last_id:
                used_ids.add(vid); last_id=vid; return p,meta
    return None,None

def make_card(path,dur,title,lines):
    # Original event/result card: factual text, no stock footage pretending to be match action.
    txt='\\n'.join([title]+lines).replace(':','\\:').replace("'","\\'")
    vf=("drawbox=x=0:y=0:w=iw:h=ih:color=black@1:t=fill,"+
        "drawtext=font='Noto Sans CJK SC':text='"+txt+"':fontcolor=white:fontsize=44:"+
        "line_spacing=24:x=(w-text_w)/2:y=(h-text_h)/2")
    subprocess.run(['ffmpeg','-y','-f','lavfi','-i',f'color=c=black:s=720x1280:r=30:d={dur}',
                    '-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-crf','22',str(path)],check=True,
                   stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

segments=[]; edit_manifest=[]
for idx,(start,end,p) in enumerate(timings):
    dur=max(0.5,end-start); q=visual_query(p); seg=OUT/f'seg{idx:03}.mp4'
    if q=='__EVENT_SCORE__':
        make_card(seg,dur,'比赛事件',["26'  柔佛 1–0","43'  武里南联 1–1"])
        edit_manifest.append({'paragraph':p,'visual':'event_card','facts':['26 1-0','43 1-1']})
    elif q=='__EVENT_PRESSURE__':
        make_card(seg,dur,'最后阶段',["57'  对手少打一人","87'  仍有关键机会","最终比分没有改写"])
        edit_manifest.append({'paragraph':p,'visual':'event_card','facts':['57 opponent down to 10','87 key chance']})
    else:
        src,meta=choose_clip(q)
        if not src: raise SystemExit(f'NO_UNIQUE_BROLL_FOR {q}')
        subprocess.run(['ffmpeg','-y','-i',str(src),'-t',str(dur),'-an','-vf',
                        'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30',
                        '-c:v','libx264','-preset','veryfast','-crf','23',str(seg)],check=True,
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        edit_manifest.append({'paragraph':p,'visual':'pexels','query':q,'video_id':meta.get('id'),'creator':meta.get('creator')})
    segments.append(seg)

(OUT/'edit_manifest.json').write_text(json.dumps(edit_manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with open(OUT/'concat.txt','w') as f:
    for p in segments: f.write("file '"+p.name+"'\n")

final=OUT/'sauron-johor-buriram-review-v3.mp4'
subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-i',str(OUT/'voice.wav'),'-t',str(t),
                '-vf',"subtitles="+str(OUT/'subs.srt')+":force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Alignment=2,MarginV=90'",
                '-c:v','libx264','-preset','veryfast','-crf','24','-c:a','aac','-b:a','112k','-movflags','+faststart',str(final)],check=True)
print('SEMANTIC_VIDEO_V3_OK',round(t,1),'seconds',len(used_ids),'unique_pexels',len(segments),'segments',final)
