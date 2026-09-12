from pathlib import Path
import re

p=Path('haojing-customer-v20/app/src/main/java/com/haojing/app/MainActivity.java')
s=p.read_text()

old='void render(){nav();drawDates();body.removeAllViews();if(page.equals("home"))home();else if(page.equals("full"))fullPage();else if(page.equals("picks"))picksPage();else if(page.equals("record"))recordPage();else mePage();}'
new='void render(){nav();drawDates();body.removeAllViews();if(page.equals("home"))home();else if(page.equals("full"))fullPage();else if(page.equals("picks"))picksPage();else if(page.equals("record"))recordPage();else if(page.equals("super"))superPage();else mePage();}'
if old not in s: raise SystemExit('render target not found')
s=s.replace(old,new,1)

old='boolean show=page.equals("home")||page.equals("full")||page.equals("picks");'
new='boolean show=page.equals("home")||page.equals("full")||page.equals("picks")||page.equals("super");'
if old not in s: raise SystemExit('dates target not found')
s=s.replace(old,new,1)

marker='body.addView(p);LinearLayout w=card();w.addView(tv("个人中心",18,dark,true));'
insert='''body.addView(p);LinearLayout sv=card();sv.setBackground(box(0xFF211A10,18));sv.addView(tv("SUPER VIP · 豪竞2.7深度分析",20,0xFFFFC15A,true));sv.addView(tv(isSuperVip()?"已解锁 · 可查看每一场完整研判链":"超级会员专享 · 查看完整概率、市场、风险、情报与价值分析",12,0xFFE4D5B9,false));Button vip=new Button(this);vip.setText(isSuperVip()?"进入超级会员专区":"超级会员专享");vip.setOnClickListener(v->{if(isSuperVip()){page="super";render();}else new AlertDialog.Builder(this).setTitle("超级会员专区").setMessage("当前账号未开通超级会员权限。").setPositiveButton("知道了",null).show();});sv.addView(vip);body.addView(sv);LinearLayout w=card();w.addView(tv("个人中心",18,dark,true));'''
if marker not in s: raise SystemExit('mePage target not found')
s=s.replace(marker,insert,1)

idx=s.find(' void loginDialog(boolean register)')
if idx<0: raise SystemExit('loginDialog marker not found')
methods=r'''
 boolean isSuperVip(){String t=profile.optString("membership_tier","");return "admin".equals(profile.optString("role"))||"super_vip".equals(t)||"super_vip_lifetime".equals(t);}
 void superPage(){
   if(token.isEmpty()){LinearLayout c=card();c.addView(tv("请先登录",20,dark,true));c.addView(tv("超级会员深度数据需要登录验证。",13,muted,false));body.addView(c);return;}
   if(!isSuperVip()){LinearLayout c=card();c.addView(tv("SUPER VIP",22,0xFFD39A28,true));c.addView(tv("当前账号没有超级会员权限。",13,muted,false));body.addView(c);return;}
   LinearLayout h=card();h.setBackground(box(0xFF1D1811,18));h.addView(tv("SUPER VIP · 豪竞2.7",23,0xFFFFC15A,true));h.addView(tv("每场完整研判 · 赛前冻结数据 · 市场 / 概率 / 风险 / 情报 / 价值",12,0xFFE6D8BE,false));body.addView(h);
   int n=0;for(int i=0;i<full.length();i++){JSONObject o=full.optJSONObject(i);if(!day.equals(o.optString("publish_date")))continue;n++;LinearLayout c=card();LinearLayout top=new LinearLayout(this);top.addView(tv(fmtNo(o.optString("match_no"))+"  "+o.optString("league"),12,muted,true),new LinearLayout.LayoutParams(0,-2,1));top.addView(tv("完整分析  ›",12,0xFFD39A28,true));c.addView(top);c.addView(tv(o.optString("home_team")+"  VS  "+o.optString("away_team"),17,dark,true));c.addView(tv("点击查看豪竞2.7本场全部研判数据",12,muted,false));final String dd=o.optString("publish_date"),nn=o.optString("match_no");c.setClickable(true);c.setOnClickListener(v->loadSuperAnalysis(dd,nn));body.addView(c);}if(n==0){LinearLayout c=card();c.addView(tv("该日期暂无比赛数据",17,dark,true));body.addView(c);}
 }
 void loadSuperAnalysis(String d,String n){Toast.makeText(this,"正在读取完整分析…",Toast.LENGTH_SHORT).show();new Thread(()->{try{JSONObject b=new JSONObject();b.put("p_date",d);b.put("p_match_no",n);JSONObject r=postJson(API+"/rest/v1/rpc/hao_app_super_match_analysis",b,true);runOnUiThread(()->showSuperAnalysis(r));}catch(Exception ex){runOnUiThread(()->Toast.makeText(this,"读取失败："+ex.getMessage(),Toast.LENGTH_LONG).show());}}).start();}
 String jsonSection(String title,JSONObject o){if(o==null||o.length()==0)return title+"\n暂无可确认数据\n";StringBuilder b=new StringBuilder();b.append(title).append("\n");Iterator<String> it=o.keys();while(it.hasNext()){String k=it.next();Object v=o.opt(k);if(v==null||v==JSONObject.NULL||String.valueOf(v).isEmpty())continue;b.append("• ").append(k).append("：").append(String.valueOf(v)).append("\n");}return b.toString();}
 void showSuperAnalysis(JSONObject r){if(!r.optBoolean("found",false)){new AlertDialog.Builder(this).setTitle("完整分析").setMessage("这场暂时没有可确认的豪竞2.7完整分析数据。").setPositiveButton("关闭",null).show();return;}ScrollView sc=new ScrollView(this);LinearLayout x=new LinearLayout(this);x.setOrientation(LinearLayout.VERTICAL);x.setPadding(dp(18),dp(8),dp(18),dp(18));JSONObject m=r.optJSONObject("match");x.addView(tv((m==null?"":fmtNo(m.optString("match_no"))+"  "+m.optString("league")),12,muted,true));if(m!=null)x.addView(tv(m.optString("home")+"  VS  "+m.optString("away"),21,dark,true));x.addView(tv("数据类型："+r.optString("source_kind"),11,muted,false));String[] keys={"decision","probability","handicap","market","residual","market_route","source","direction_audit","quant","value","audit","freeze","result"};String[] names={"核心结论","主平客概率","让球研判","市场主链","平局/冷门与残差风险","精选与价值路由","数据质量与来源","方向一致性审计","Poisson / xG","EV / 价值","完整性审计","赛前冻结信息","赛果核验"};for(int i=0;i<keys.length;i++){JSONObject o=r.optJSONObject(keys[i]);if(o==null||o.length()==0)continue;LinearLayout c=card();c.addView(tv(names[i],17,dark,true));c.addView(tv(jsonSection("",o).trim(),12,muted,false));x.addView(c);}Object intel=r.opt("intelligence");if(intel instanceof JSONArray){JSONArray a=(JSONArray)intel;LinearLayout c=card();c.addView(tv("赛前情报",17,dark,true));if(a.length()==0)c.addView(tv("暂无可确认情报",12,muted,false));for(int i=0;i<a.length();i++){JSONObject q=a.optJSONObject(i);if(q==null)continue;c.addView(tv("• "+q.optString("headline")+"\n  "+q.optString("fact")+"\n  来源："+q.optString("source")+"  证据："+q.optString("grade"),12,muted,false));}x.addView(c);}else if(intel instanceof JSONObject){LinearLayout c=card();c.addView(tv("赛前情报",17,dark,true));c.addView(tv(jsonSection("",(JSONObject)intel).trim(),12,muted,false));x.addView(c);}sc.addView(x);new AlertDialog.Builder(this).setTitle("豪竞2.7 · 完整分析").setView(sc).setPositiveButton("关闭",null).show();}
'''
s=s[:idx]+methods+s[idx:]
p.write_text(s)
