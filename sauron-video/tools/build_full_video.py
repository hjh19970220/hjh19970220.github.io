from pathlib import Path
import subprocess
import numpy as np
import soundfile as sf
from kokoro import KPipeline
ROOT=Path('sauron-video'); SCRIPT=ROOT/'scripts/2026-09-15/012-ipswich-arsenal.md'; OUT=ROOT/'output/full-video'; OUT.mkdir(parents=True,exist_ok=True)
md=SCRIPT.read_text(encoding='utf-8'); text=md.split('## 口播文案',1)[1].split('## 自动素材关键词',1)[0].strip(); paras=[x.strip().replace('\n',' ') for x in text.split('\n\n') if x.strip()]
pipe=KPipeline(lang_code='z'); audios=[]; timings=[]; t=0.0
for p in paras:
    chunks=[a for _,_,a in pipe(p,voice='zm_yunxi',speed=1.08)]
    if not chunks: continue
    a=np.concatenate(chunks); dur=len(a)/24000; audios.append(a); timings.append((t,t+dur,p)); t+=dur+0.18; audios.append(np.zeros(int(24000*.18),dtype=np.float32))
sf.write(OUT/'voice.wav',np.concatenate(audios),24000)
def ts(x):
    h=int(x//3600); x-=h*3600; m=int(x//60); x-=m*60; return f'{h:02}:{m:02}:{x:06.3f}'.replace('.',',')
def wrap(s,n=17):
    s=s.replace(' ',''); return '\n'.join(s[i:i+n] for i in range(0,len(s),n))
with open(OUT/'subs.srt','w',encoding='utf-8') as f:
    for i,(a,b,p) in enumerate(timings,1): f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{wrap(p)}\n\n')
subprocess.run(['python',str(ROOT/'tools/pexels_fetch.py')],check=True)
subprocess.run(['python',str(ROOT/'tools/download_broll.py')],check=True)
clips=sorted((ROOT/'output/broll-test').glob('*.mp4'))
if not clips: raise SystemExit('NO_BROLL')
segments=[]; cur=0; idx=0
while cur<t:
    src=clips[idx%len(clips)]; seg=OUT/f'seg{idx:03}.mp4'; subprocess.run(['ffmpeg','-y','-stream_loop','-1','-i',str(src),'-t','6','-an','-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30','-c:v','libx264','-preset','veryfast','-crf','22',str(seg)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); segments.append(seg); cur+=6; idx+=1
with open(OUT/'concat.txt','w') as f:
    for p in segments: f.write("file '"+p.name+"'\n")
subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(OUT/'concat.txt'),'-i',str(OUT/'voice.wav'),'-t',str(t),'-vf',"subtitles="+str(OUT/'subs.srt')+":force_style='FontName=Noto Sans CJK SC,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,BorderStyle=1,Outline=2,Alignment=2,MarginV=90'",'-c:v','libx264','-preset','veryfast','-crf','22','-c:a','aac','-b:a','128k','-movflags','+faststart',str(OUT/'sauron-ipswich-arsenal-v1.mp4')],check=True)
print('FULL_VIDEO_OK',round(t,1),'seconds',len(clips),'broll_clips')
