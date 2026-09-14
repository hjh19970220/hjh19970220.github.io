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
    req=urllib.request.Request(url,data=data,headers={
        'Content-Type':'application/json',
        'User-Agent':'Mozilla/5.0 SorenCapture/1.1'
    })
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
            with open(path,'r',encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'schema_version':'freeze-v2',
        'pool_date':date_s,
        'source':API,
        'capture_mode':'scheduled_live_and_prematch',
        'matches':[]
    }


def fetch_games(d):
    api=post_json(API,{'date':ts_midnight(d),'hidden':1})
    fields=((api.get('data') or {}).get('field') or [])
    games=((api.get('data') or {}).get('game') or [])
    out=[]
    for row in games:
        o=row_obj(fields,row)
        if int(o.get('jinCai') or 0)==1:
            out.append(o)
    return out


def base_match(o):
    return {
        'game_id':o.get('gameId'),
        'match_no_raw':o.get('matchNumStr'),
        'match_no':n3(o.get('matchNumStr')),
        'league':o.get('sclassName'),
        'home_team':o.get('homeTeam'),
        'away_team':o.get('awayTeam'),
        'kickoff_ts':o.get('matchTime')
    }


def model_fields(o):
    return {
        'gaiLv':o.get('gaiLv'),
        'yuChe':o.get('yuChe'),
        'drawOdds':o.get('drawOdds'),
        'zhiShu':o.get('zhiShu'),
        'judge':o.get('judge'),
        'had':o.get('had')
    }


def has_prediction(x):
    return bool(x and (x.get('gaiLv') or x.get('yuChe')))


def backfill_history(d):
    date_s=d.isoformat(); path=os.path.join(ROOT,date_s+'.json')
    if os.path.exists(path):
        return False
    matches=[]
    for o in fetch_games(d):
        m=base_match(o)
        m.update(model_fields(o))
        matches.append(m)
    doc={
        'schema_version':'historical-current-api-v1',
        'pool_date':date_s,
        'source':API,
        'capture_mode':'historical_backfill_current_api',
        'is_prematch':False,
        'note':'历史接口当前保存状态，仅用于回看/页面对照，不视为赛前冻结',
        'captured_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'matches':sorted(matches,key=lambda x:str(x.get('match_no') or '999'))
    }
    with open(path,'w',encoding='utf-8') as f:
        json.dump(doc,f,ensure_ascii=False,indent=2)
    print('historical backfill',date_s,'matches',len(matches))
    return True


def snap_from(o,now,kickoff):
    s={
        'captured_at':now.astimezone(timezone.utc).isoformat().replace('+00:00','Z'),
        'seconds_to_kickoff':int(kickoff-now.timestamp()) if kickoff else None,
    }
    s.update(model_fields(o))
    s['has_prediction']=has_prediction(s)
    s['is_prematch']=bool(kickoff and now.timestamp() < kickoff)
    return s


def choose_slot(rem,existing):
    slots={s.get('freeze_slot') for s in existing if isinstance(s,dict)}
    if 'T60' not in slots and 0 < rem <= 3900: return 'T60'
    if 'T30' not in slots and 0 < rem <= 2100: return 'T30'
    if 'T10' not in slots and 0 < rem <= 900: return 'T10'
    return None


def signature(m):
    lp=m.get('latest_prematch') if isinstance(m,dict) else None
    ls=m.get('latest_seen') if isinstance(m,dict) else None
    return json.dumps({
        'base':{k:m.get(k) for k in ['game_id','match_no_raw','match_no','league','home_team','away_team','kickoff_ts']},
        'current':{k:m.get(k) for k in ['gaiLv','yuChe','drawOdds','zhiShu','judge','had']},
        'lp':{k:(lp or {}).get(k) for k in ['gaiLv','yuChe','drawOdds','zhiShu','judge','had','freeze_slot','is_prematch']},
        'ls':{k:(ls or {}).get(k) for k in ['gaiLv','yuChe','drawOdds','zhiShu','judge','had','phase']}
    },ensure_ascii=False,sort_keys=True)


def capture_date(d,now):
    date_s=d.isoformat(); path=os.path.join(ROOT,date_s+'.json')
    doc=load_file(path,date_s)
    incoming=fetch_games(d)
    by_key={str(x.get('game_id') or x.get('match_no')):x for x in doc.get('matches',[]) if isinstance(x,dict)}
    changed=False

    for o in incoming:
        key=str(o.get('gameId') or n3(o.get('matchNumStr')))
        m=by_key.get(key) or {**base_match(o),'snapshots':[]}
        before=signature(m)
        m.update(base_match(o))

        # 顶层字段始终代表“接口当前最新可见值”，用于页面实时显示。
        m.update(model_fields(o))
        snaps=m.setdefault('snapshots',[])
        try:
            kickoff=float(o.get('matchTime') or 0)
        except Exception:
            kickoff=0
        rem=int(kickoff-now.timestamp()) if kickoff else -1
        cur=snap_from(o,now,kickoff)
        cur['phase']='PREMATCH' if rem>0 else 'LIVE_OR_POST'
        m['latest_seen']=cur

        if rem>0:
            slot=choose_slot(rem,snaps)
            if not snaps:
                slot=slot or 'FIRST_SEEN'
            if slot:
                fr=dict(cur); fr['freeze_slot']=slot
                snaps.append(fr)
            # 页面展示“最后一次赛前看到的值”，每次检查都会向前滚动。
            pre=dict(cur); pre['freeze_slot']=slot or 'LATEST_PREMATCH'
            m['latest_prematch']=pre
        else:
            # 如果赛前从未公开预测，而开赛后接口首次放出，则允许页面展示，
            # 但明确标 POST_RELEASE，不能计入正式赛前成绩。
            lp=m.get('latest_prematch') if isinstance(m.get('latest_prematch'),dict) else None
            if has_prediction(cur) and not has_prediction(lp):
                post=dict(cur)
                post['freeze_slot']='POST_RELEASE'
                post['is_prematch']=False
                m['latest_prematch']=post

        after=signature(m)
        if before!=after:
            changed=True
        by_key[key]=m

    doc['schema_version']='freeze-v2'
    doc['pool_date']=date_s
    doc['source']=API
    doc['capture_mode']='scheduled_live_and_prematch'
    doc['collector_note']='页面显示接口最新可见值；正式赛前比较只认 is_prematch=true 的冻结。POST_RELEASE 只展示，不计赛前命中。'
    doc['last_checked_at']=now.astimezone(timezone.utc).isoformat().replace('+00:00','Z')
    doc['matches']=sorted(by_key.values(),key=lambda x:str(x.get('match_no') or '999'))

    if changed or not os.path.exists(path):
        with open(path,'w',encoding='utf-8') as f:
            json.dump(doc,f,ensure_ascii=False,indent=2)
        print('updated',date_s,'matches',len(doc['matches']))
    else:
        print('checked-no-change',date_s,'matches',len(doc['matches']))


if __name__=='__main__':
    # 一次性历史回填：只做历史当前态，不冒充赛前冻结。
    d=HIST_START
    while d<=HIST_END:
        try:
            backfill_history(d)
        except Exception as e:
            print('historical backfill failed',d,e,file=sys.stderr)
        d+=timedelta(days=1)

    now=datetime.now(TZ)
    # 连续追踪最近3个销售日。这样“14号销售、15号凌晨开球”的比赛仍会持续更新。
    for d in [now.date()-timedelta(days=2), now.date()-timedelta(days=1), now.date()]:
        try:
            capture_date(d,now)
        except Exception as e:
            print('capture failed',d,e,file=sys.stderr)
