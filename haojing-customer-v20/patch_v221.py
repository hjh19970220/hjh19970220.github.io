from pathlib import Path
import re

p=Path('haojing-customer-v20/app/src/main/java/com/haojing/app/MainActivity.java')
s=p.read_text()
s=s.replace('LinearLayout body,nav,dates; String page="home",day="";', 'LinearLayout body,nav,dates; String page="home",day="",homeFilter="全部";')
s=s.replace('hao_app_picks_snapshot_v14?select=publish_date,match_no,league,home_team,away_team,kickoff_bjt,category,selected_pick,selected_price,recommendation_rank,star_level,short_reason,settle_status,result_text,record_kind&order=publish_date.desc,recommendation_rank.asc&limit=500','hao_app_picks_customer_v20?select=publish_date,match_no,league,home_team,away_team,kickoff_bjt,category,selected_pick,selected_price,selected_model_probability,recommendation_rank,star_level,short_reason,settle_status,result_text,record_kind&order=publish_date.desc,match_no.asc,recommendation_rank.asc&limit=500')

def repl(start,end,body):
    global s
    pat=re.escape(start)+r'.*?(?='+re.escape(end)+r')'
    ns,n=re.subn(pat,lambda m: body+'\n ',s,flags=re.S)
    if n!=1: raise SystemExit(f'patch failed {start} n={n}')
    s=ns

repl('void home(){','LinearLayout homeCard(JSONObject o){',r'''void home(){String latest=day.isEmpty()?latestDate():day;int n=0,featured=0,warns=0;for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);if(!latest.equals(o.optString("publish_date")))continue;n++;if(isFormalFeatured(latest,o.optString("match_no")))featured++;if(isRiskMatch(latest,o.optString("match_no")))warns++;}LinearLayout hero=card();hero.setBackground(box(0xFFFFF4E6,18));hero.addView(tv("近期实战表现",19,dark,true));LinearLayout nums=new LinearLayout(this);nums.setPadding(0,dp(8),0,0);TextView a=tv("今日赛事\\n"+n,14,orange,true);a.setGravity(Gravity.CENTER);TextView b=tv("正式精选\\n"+featured,14,orange,true);b.setGravity(Gravity.CENTER);TextView c=tv("风险预警\\n"+warns,14,orange,true);c.setGravity(Gravity.CENTER);nums.addView(a,new LinearLayout.LayoutParams(0,-2,1));nums.addView(b,new LinearLayout.LayoutParams(0,-2,1));nums.addView(c,new LinearLayout.LayoutParams(0,-2,1));hero.addView(nums);body.addView(hero);LinearLayout tabs=card();tabs.setOrientation(LinearLayout.HORIZONTAL);String[] ts={"全部","精选","预警"};for(String z:ts){final String zz=z;boolean on=homeFilter.equals(z);TextView q=tv(z,13,on?Color.WHITE:dark,true);q.setGravity(Gravity.CENTER);q.setBackground(box(on?orange:0xFFF2F2F2,14));q.setOnClickListener(v->{homeFilter=zz;render();});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(38),1);lp.setMargins(dp(3),0,dp(3),0);tabs.addView(q,lp);}body.addView(tabs);int shown=0;for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);if(!latest.equals(o.optString("publish_date")))continue;String no=o.optString("match_no");boolean ok=homeFilter.equals("全部")||(homeFilter.equals("精选")&&isFormalFeatured(latest,no))||(homeFilter.equals("预警")&&isRiskMatch(latest,no));if(ok){body.addView(homeCard(o));shown++;}}if(shown==0){LinearLayout e=card();String title=homeFilter.equals("精选")?"该日期暂无正式精选":homeFilter.equals("预警")?"该日期暂无风险预警":"暂无赛事";String sub=homeFilter.equals("精选")?"只有达到精选门槛的正式前瞻才会出现在这里。":"豪竞核心研判系统暂未触发对应记录。";e.addView(tv(title,18,dark,true));e.addView(tv(sub,12,muted,false));body.addView(e);}}''')

repl('LinearLayout homeCard(JSONObject o){','void detail(JSONObject o){',r'''LinearLayout homeCard(JSONObject o){LinearLayout c=card();String d=o.optString("publish_date"),no=fmtNo(o.optString("match_no"));boolean feat=isFormalFeatured(d,o.optString("match_no")),warn=isRiskMatch(d,o.optString("match_no"));ArrayList<JSONObject> ps=pickList(d,o.optString("match_no"));LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);top.addView(tv(no+"  "+o.optString("league"),12,muted,true),new LinearLayout.LayoutParams(0,-2,1));if(feat){TextView tag=tv("精选",11,Color.WHITE,true);tag.setBackground(box(orange,10));tag.setPadding(dp(8),dp(3),dp(8),dp(3));top.addView(tag);}else if(warn){TextView tag=tv("⚠ 预警",11,0xFFB46A16,true);tag.setBackground(box(0xFFFFF1D8,10));tag.setPadding(dp(8),dp(3),dp(8),dp(3));top.addView(tag);}c.addView(top);TextView teams=tv(o.optString("home_team")+"   VS   "+o.optString("away_team"),17,dark,true);teams.setGravity(Gravity.CENTER);teams.setPadding(0,dp(10),0,dp(8));c.addView(teams);String rs=o.optString("result_text");String st=feat?featuredStatus(ps):"";LinearLayout foot=new LinearLayout(this);foot.setGravity(Gravity.CENTER_VERTICAL);foot.addView(tv(rs.isEmpty()?"未开赛":"完场  "+rs,12,muted,false),new LinearLayout.LayoutParams(0,-2,1));if(!st.isEmpty())foot.addView(tv(st,12,st.contains("成功")?green:st.contains("未中")?red:orange,true));c.addView(foot);c.setOnClickListener(v->detail(o));return c;}''')

helpers=r'''
 boolean isFormalFeatured(String d,String n){ArrayList<JSONObject>a=pickList(d,n);for(JSONObject q:a)if("正式前瞻".equals(q.optString("record_kind")))return true;return false;}
 boolean isRiskMatch(String d,String n){JSONObject r=riskFor(d,n);return !r.optString("risk_badge").isEmpty()||!r.optString("risk_reason").isEmpty();}
'''
idx=s.find(' void mePage(){')
if idx<0: raise SystemExit('mePage not found')
s=s[:idx]+helpers+s[idx:]
p.write_text(s)
