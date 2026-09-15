import json, pathlib, urllib.request

manifest_path = pathlib.Path('sauron-video/output/pexels-test/manifest.json')
out = pathlib.Path('sauron-video/output/broll-test')
out.mkdir(parents=True, exist_ok=True)
data = json.loads(manifest_path.read_text(encoding='utf-8'))
selected = data.get('videos', [])[:6]
results=[]
for i,v in enumerate(selected,1):
    dest=out/f'{i:02d}_{v["id"]}.mp4'
    req=urllib.request.Request(v['download_url'], headers={'User-Agent':'SauronVideoFactory/0.2'})
    with urllib.request.urlopen(req, timeout=60) as r, dest.open('wb') as f:
        while True:
            chunk=r.read(1024*1024)
            if not chunk: break
            f.write(chunk)
    results.append({'file':str(dest),'id':v['id'],'query':v['query'],'bytes':dest.stat().st_size,'creator':v.get('creator'),'pexels_url':v.get('pexels_url')})
(out/'downloaded.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('BROLL_OK',len(results),'files',sum(x['bytes'] for x in results),'bytes')
