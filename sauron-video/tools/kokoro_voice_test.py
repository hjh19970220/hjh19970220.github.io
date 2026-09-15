from pathlib import Path
from kokoro import KPipeline
import soundfile as sf

text = '''今晚英联杯，伊普斯维奇坐镇主场迎战阿森纳。
这场比赛如果只看双方的名字，好像没有太多分析空间。
但是今天真正值得看的，不是阿森纳能不能占据优势，而是他们到底能把这个优势，兑现到什么程度。
好了，言归正传。这场比赛我想先讲两个比较重要的信息。'''

out = Path('sauron-video/output/kokoro-test')
out.mkdir(parents=True, exist_ok=True)

pipeline = KPipeline(lang_code='z')
parts = []
for _, _, audio in pipeline(text, voice='zm_yunxi', speed=1.08, split_pattern=r'\n+'):
    parts.append(audio)
if not parts:
    raise SystemExit('KOKORO_NO_AUDIO')
import numpy as np
audio = np.concatenate(parts)
sf.write(out/'sauron-male-test.wav', audio, 24000)
print('KOKORO_OK', len(audio)/24000, 'seconds')
