#!/usr/bin/env python3
import json, os, sys, urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TZ=ZoneInfo('Asia/Shanghai')
API='https://api.lazq.com/MobileFoot/dateGameSpf'
ROOT=os.path.join(os.path.dirname(os.path.dirname(__file__)),'data','lazq')
os.makedirs(ROOT,exist_ok=True)
HIST_START=date(2026,8,31)
HIST_END=date(2026,9,12)

def ts_midnight(d):
    return int(datetime(d.year,d.month,d.day,tzinfo=TZ).timestamp())

def post_json(url,payload):
    data=json.dumps(payload,ensure_ascii=False).encode()
    req=urllib.request.Request(url,data=data,headers={'Content-Type':'application/json','User-Agent':'Mozilla/5.0 SorenCapture/1.0'})
    with urllib.request.urlopen(req,timeout=25) as r:
        return json.loads(r.read().decode('utf-8'))

def row_obj(fields,row):
    return {fields[i]: row[i] if i < len(row) else None for i in range(len(fields))}

def n3(v):
    s=''.join(ch for ch in str(v or '') if ch.isdigit())
    return s[-3:].zfill(3) if s else ''

def load_file(path,date_s):
    if os.path.exists(path):
        try:
            with open(path,'r',encoding='utf-8') as f: return json.load(f)
        except Exception: pass
    return {'schema_version':'freeze-v1','pool_date':date_s,'source':API,'capture_mode':'scheduled_prematch','matches':[]}

def fetch_games(d):
    api=post_json(API,{'date':ts_midnight(d),'hidden':1})
    fields=((api.get('data') or {}).get('field') or [])
    games=((api.get('data') or {}).get('game') or [])
    out=[]
    for row in games:
        o=row_obj(fields,row)
        if int(o.get('jinCai') or 0)==1: out.append(o)
    return out

def base_match(o):
    return {
      'game_id':o.get('gameId'),'match_no_raw':o.get('matchNumStr'),'match_no':n3(o.get('matchNumStr')),
      'league':o.get('sclassName'),'home_team':o.get('homeTeam'),'away_team':o.get('awayTeam'),
      'kickoff_ts':o.get('matchTime')
    }

def backfill_history(d):
    date_s=d.isoformat(); path=os.path.join(ROOT,date_s+'.json')
    # 已有历史文件不重复覆盖，保持首次回填内容可追溯。
    if os.path.exists(path): return False
    matches=[]
    for o in fetch_games(d):
        m=base_match(o)
        m.update({
          'gaiLv':o.get('gaiLv'),'yuChe':o.get('yuChe'),'drawOdds':o.get('drawOdds'),
          'zhiShu':o.get('zhiShu'),'judge':o.get('judge'),'had':o.get('had')
        })
        matches.append(m)
    doc={
      'schema_version':'historical-current-api-v1','pool_date':date_s,'source':API,
      'capture_mode':'historical_backfill_current_api','is_prematch':False,
      'note':'历史接口当前保存状态，仅用于回看/页面对照，不视为赛前冻结',
      'captured_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
      'matches':sorted(matches,key=lambda x:str(x.get('match_no') or '999'))
    }
    with open(path,'w',encoding='utf-8') as f: json.dump(doc,f,ensure_ascii=False,indent=2)
    print('historical backfill',date_s,'matches',len(matches))
    return True

def snap_from(o,now,kickoff):
    return {
      'captured_at':now.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),
      'seconds_to_kickoff':int(kickoff-now.timestamp()),
      'gaiLv':o.get('gaiLv'),'yuChe':o.get('yuChe'),'drawOdds':o.get('drawOdds'),
      'zhiShu':o.get('zhiShu'),'judge':o.get('judge'),'had':o.get('had')
    }

def choose_slot(rem, existing):
    slots={s.get('freeze_slot') for s in existing if isinstance(s,dict)}
    if 'T60' not in slots and 0 < rem <= 3900: return 'T60'
    if 'T30' not in slots and 0 < rem <= 2100: return 'T30'
    if 'T10' not in slots and 0 < rem <= 900: return 'T10'
    return None

def capture_date(d,now):
    date_s=d.isoformat(); path=os.path.join(ROOT,date_s+'.json')
    doc=load_file(path,date_s)
    incoming=fetch_games(d)
    by_key={str(x.get('game_id') or x.get('match_no')):x for x in doc.get('matches',[]) if isinstance(x,dict)}
    changed=False
    for o in incoming:
        key=str(o.get('gameId') or n3(o.get('matchNumStr')))
        m=by_key.get(key) or {**base_match(o),'snapshots':[]}
        m.update(base_match(o))
        snaps=m.setdefault('snapshots',[])
        try: kickoff=float(o.get('matchTime') or 0)
        except: kickoff=0
        rem=int(kickoff-now.timestamp()) if kickoff else -1
        slot=choose_slot(rem,snaps)
        if not snaps and rem>0: slot=slot or 'FIRST_SEEN'
        if slot:
            s=snap_from(o,now,kickoff); s['freeze_slot']=slot; snaps.append(s); m['latest_prematch']=s; changed=True
        by_key[key]=m
    doc['schema_version']='freeze-v1'; doc['pool_date']=date_s; doc['source']=API; doc['capture_mode']='scheduled_prematch'; doc['is_prematch']=True
    doc['updated_at']=now.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    doc['matches']=sorted(by_key.values(),key=lambda x:str(x.get('match_no') or '999'))
    if changed or not os.path.exists(path):
        with open(path,'w',encoding='utf-8') as f: json.dump(doc,f,ensure_ascii=False,indent=2)
        print('updated',date_s,'matches',len(doc['matches']))
    else: print('no new freeze slot',date_s)

if __name__=='__main__':
    # 一次性补齐 8/31—9/12 历史页面文件。只标历史当前态，绝不冒充赛前冻结。
    d=HIST_START
    while d<=HIST_END:
        try: backfill_history(d)
        except Exception as e: print('historical backfill failed',d,e,file=sys.stderr)
        d+=timedelta(days=1)
    now=datetime.now(TZ)
    # 同时抓销售日今天与昨天，避免跨午夜开球丢掉T-30/T-10冻结。
    for d in [now.date()-timedelta(days=1),now.date()]:
        try: capture_date(d,now)
        except Exception as e: print('capture failed',d,e,file=sys.stderr)
