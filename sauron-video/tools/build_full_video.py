from pathlib import Path
import json, re, subprocess, wave
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT=Path('sauron-video')
SCRIPT=ROOT/'scripts/2026-09-15/012-ipswich-arsenal.md'
OUT=ROOT/'output/full-video'
BROLL=ROOT/'output/broll-full'
OUT.mkdir(parents=True,exist_ok=True); BROLL.mkdir(parents=True,exist_ok=True)
md=SCRIPT.read_text(encoding='utf-8')
text=md.split('## 口播文案',1)[1].split('## 自动素材关键词',1)[0].strip()
paras=[x.strip().replace('\n',' ') for x in text.split('\n\n') if x.strip()]
pipe=KPipeline(lang_code='z')
audios=[]; timings=[]; t=0.0
for i,p in enumerate(paras):
    chunks=[]
    for _,_,a in pipe(p,voice='zm_yunxi',speed=1.08): chunks.append(a)
    if not chunks: continue
    a=np.concatenate(chunks); dur=len(a)/24000
    audios.append(a); timings.append((t,t+dur,p)); t+=dur+0.18
    audios.append(np.zeros(int(24000*.18),dtype=np.float32))
voice=np.concatenate(audios)
sf.write(OUT/'voice.wav',voice,24000)

def ts(x):
    h=int(x//3600); x-=h*3600; m=int(x//60); x-=m*60
    return f'{h:02}:{m:02}:{x:06.3f}'.replace('.',',')
def wrap(s,n=17):
    s=s.replace(' ',''); return '\n'.join(s[i:i+n] for i in range(0,len(s),n))
with open(OUT/'subs.srt','w',encoding='utf-8') as f:
    for i,(a,b,p) in enumerate(timings,1): f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{wrap(p)}\n\n')
# Pexels material manifest/download via existing tools
subprocess.run(['python',str(ROOT/'tools/pexels_fetch.py')],check=True)
man=json.loads((ROOT/'output/pexels-test/manifest.json').read_text())
import urllib.request
clips=[]
for i,v in enumerate(man['videos'][:10]):
    url=v.get('download_url') or v.get('file_url') or v.get('video_file')
    if not url:
        for k in ('video_files','files'):
            if isinstance(v.get(k),list) and v[k]: url=v[k][0].get('link')
    if not url: continue
    p=BROLL/f'{i:02}.mp4'; urllib.request.urlretrieve(url,p); clips.append(p)
if not clips: raise SystemExit('NO_BROLL')
# normalize each clip to 9:16, 6 seconds; cycle to narration duration
segments=[]; cur=0; idx=0
while cur < t:
    src=clips[idx%len(clips)]; seg=OUT/f'seg{idx:03}.mp4'
    subprocess.run(['ffmpeg','-y','-stream_loop','-1','-i',str(src),'-t','6','-an','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30','-c:v','libx264','-preset','veryfast','-crf','22',str(seg)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    segments.append(seg); cur+=6; idx+=1
with open(OUT/'concat.txt','w') as f:
    for p in segments: f.write("file '"+p.name+"'\n")
subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-i',str(OUT/'voice.wav'),'-t',str(t),'-vf',"subtitles="+str(OUT/'subs.srt')+":force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=90'",'-c:v','libx264','-preset','veryfast','-crf','22','-c:a','aac','-b:a','128k','-movflags','+faststart',str(OUT/'sauron-ipswich-arsenal-v1.mp4')],check=True)
print('FULL_VIDEO_OK',round(t,1),'seconds',len(clips),'broll_clips')
