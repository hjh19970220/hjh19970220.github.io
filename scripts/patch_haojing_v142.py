from pathlib import Path

p=Path('app14/app/src/main/java/com/haojing/app/MainActivity.java')
s=p.read_text()

s=s.replace(
    'r=get("hao_app_risk_snapshot_v14?select=publish_date,match_no,risk_badge,risk_reason");',
    'r=get("hao_app_risk_stats_v15?select=publish_date,match_no,league,risk_badge,risk_reason,risk_status,source_kind&order=publish_date.desc,match_no.asc");'
)
s=s.replace(
    'for(String d:set){TextView x=tv(',
    'int dc=0;for(String d:set){if(page.equals("full")&&dc++>=15)break;TextView x=tv('
)
s=s.replace(
    'void render(){drawNav();drawDates();',
    'String fmtNo(String n){try{return String.format(Locale.CHINA,"%03d",Integer.parseInt(n));}catch(Exception e){return n;}}\n            void render(){drawNav();drawDates();'
)
s=s.replace(
    'r.addView(tv(o.optString("match_no")+"  "+o.optString("league")',
    'r.addView(tv(fmtNo(o.optString("match_no"))+"  "+o.optString("league")'
)

a=s.index('            void record(){')
b=s.index('            void me(){',a)
rec='''            void record(){
              int h=0,l=0;LinkedHashSet<String> ds=new LinkedHashSet<>();
              for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);String st=o.optString("eval_status");if(st.equals("评测成功"))h++;else if(st.equals("评测失败"))l++;String d=o.optString("publish_date");if(!d.isEmpty())ds.add(d);}
              LinearLayout x=card();x.addView(tv("双选总命中率",15,muted,true));x.addView(tv((h+l)>0?h+"/"+(h+l)+" · "+String.format(Locale.CHINA,"%.2f%%",100.0*h/(h+l)):"暂无结算",24,orange,true));body.addView(x);
              HashSet<String> recent=new HashSet<>();int dc=0;for(String d:ds){if(dc++>=15)break;recent.add(d);}int rh=0,rl=0;
              for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);if(!recent.contains(o.optString("publish_date")))continue;String st=o.optString("eval_status");if(st.equals("评测成功"))rh++;else if(st.equals("评测失败"))rl++;}
              LinearLayout xr=card();xr.addView(tv("最近15天双选",15,muted,true));xr.addView(tv((rh+rl)>0?rh+"/"+(rh+rl)+" · "+String.format(Locale.CHINA,"%.2f%%",100.0*rh/(rh+rl)):"暂无结算",21,dark,true));body.addView(xr);
              int ph=0,pl=0,hh=0,hl=0,fh=0,fl=0;
              for(int i=0;i<picks.length();i++){JSONObject o=picks.optJSONObject(i);String st=o.optString("settle_status"),k=o.optString("record_kind");if(st.equals("命中")){ph++;if(k.equals("历史回放"))hh++;else if(k.equals("正式前瞻"))fh++;}else if(st.equals("未中")){pl++;if(k.equals("历史回放"))hl++;else if(k.equals("正式前瞻"))fl++;}}
              LinearLayout xp=card();xp.addView(tv("精选推荐命中率",15,muted,true));xp.addView(tv((ph+pl)>0?ph+"/"+(ph+pl)+" · "+String.format(Locale.CHINA,"%.2f%%",100.0*ph/(ph+pl)):"暂无结算",21,orange,true));xp.addView(tv("历史回放 "+((hh+hl)>0?String.format(Locale.CHINA,"%.2f%%",100.0*hh/(hh+hl)):"--")+" · 正式前瞻 "+((fh+fl)>0?String.format(Locale.CHINA,"%.2f%%",100.0*fh/(fh+fl)):"--"),13,muted,false));body.addView(xp);
              int sh=0,sl=0;for(int i=0;i<risks.length();i++){String st=risks.optJSONObject(i).optString("risk_status");if(st.equals("避险成功"))sh++;else if(st.equals("避险失败"))sl++;}
              LinearLayout rr=card();rr.addView(tv("风险场次避开命中率",15,warn,true));rr.addView(tv((sh+sl)>0?sh+"/"+(sh+sl)+" · "+String.format(Locale.CHINA,"%.2f%%",100.0*sh/(sh+sl)):"暂无可结算风险场",21,dark,true));body.addView(rr);
              LinkedHashMap<String,int[]> lm=new LinkedHashMap<>();
              for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);String st=o.optString("eval_status");if(st.equals("待赛"))continue;String lg=o.optString("league","其他");int[] z=lm.containsKey(lg)?lm.get(lg):new int[]{0,0};z[1]++;if(st.equals("评测成功"))z[0]++;lm.put(lg,z);}
              ArrayList<Map.Entry<String,int[]>> es=new ArrayList<>(lm.entrySet());Collections.sort(es,(u,v)->Integer.compare(v.getValue()[1],u.getValue()[1]));
              LinearLayout lc=card();lc.addView(tv("各联赛双选命中率",16,dark,true));for(Map.Entry<String,int[]> e:es){int[]z=e.getValue();lc.addView(tv(e.getKey()+"  "+z[0]+"/"+z[1]+"  "+String.format(Locale.CHINA,"%.1f%%",100.0*z[0]/z[1]),14,z[1]>=5?dark:muted,false));}body.addView(lc);
            }
'''
s=s[:a]+rec+s[b:]
s=s.replace('豪竞引擎 v1.4','豪竞引擎 v1.4.2 预览版')
s=s.replace('首页 / 全池 / 精选 / 战绩 / 我的：全部可点击。','首页 / 全池 / 精选 / 战绩 / 我的：全部可点击。\\n\\n全池只展示最近15天；更早比赛统一进入战绩统计。')
p.write_text(s)
