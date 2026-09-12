package com.haojing.client;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String BASE = "https://tqlibowvnwfkaseqqvvp.supabase.co";
    private static final String API_KEY = "sb_publishable_FVHoVk1pL1gNtu65-cZ0JQ_lOllpCSs";
    private static final int ORANGE = Color.rgb(255, 122, 0);
    private static final int ORANGE_DARK = Color.rgb(230, 96, 0);
    private static final int BG = Color.rgb(246, 247, 249);
    private static final int TEXT = Color.rgb(32, 34, 38);
    private static final int MUTED = Color.rgb(115, 120, 128);
    private static final int BORDER = Color.rgb(232, 234, 238);
    private static final int GREEN = Color.rgb(28, 155, 88);
    private static final int RED = Color.rgb(220, 69, 69);

    private LinearLayout content;
    private LinearLayout nav;
    private String token = "";
    private String userId = "";
    private String email = "";
    private final DecimalFormat money = new DecimalFormat("0.00");

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(ORANGE_DARK);
        token = prefs().getString("access_token", "");
        userId = prefs().getString("user_id", "");
        email = prefs().getString("email", "");
        if (token == null || token.isEmpty()) showLogin(); else showShell("home");
    }

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences("haojing_session", MODE_PRIVATE);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private GradientDrawable bg(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp((int) radius));
        return d;
    }

    private GradientDrawable bordered(int color, int stroke, float radius) {
        GradientDrawable d = bg(color, radius);
        d.setStroke(dp(1), stroke);
        return d;
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private LinearLayout.LayoutParams lp(int w, int h) {
        return new LinearLayout.LayoutParams(w, h);
    }

    private void showLogin() {
        ScrollView sc = new ScrollView(this);
        sc.setFillViewport(true);
        sc.setBackgroundColor(Color.WHITE);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(56), dp(28), dp(32));
        sc.addView(root, new ScrollView.LayoutParams(-1, -1));

        TextView logo = text("豪", 32, Color.WHITE, true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(bg(ORANGE, 24));
        root.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(72)));

        TextView title = text("豪竞", 30, TEXT, true);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tlp = lp(-1, -2); tlp.topMargin = dp(18); root.addView(title, tlp);
        TextView sub = text("专业赛前研判平台", 14, MUTED, false);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams slp = lp(-1, -2); slp.topMargin = dp(6); root.addView(sub, slp);

        EditText mail = new EditText(this);
        mail.setHint("邮箱");
        mail.setSingleLine(true);
        mail.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        mail.setText(email);
        mail.setTextSize(16);
        mail.setPadding(dp(16), 0, dp(16), 0);
        mail.setBackground(bordered(Color.rgb(250,250,251), BORDER, 12));
        LinearLayout.LayoutParams mlp = lp(-1, dp(54)); mlp.topMargin = dp(42); root.addView(mail, mlp);

        EditText pass = new EditText(this);
        pass.setHint("密码");
        pass.setSingleLine(true);
        pass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pass.setTextSize(16);
        pass.setPadding(dp(16), 0, dp(16), 0);
        pass.setBackground(bordered(Color.rgb(250,250,251), BORDER, 12));
        LinearLayout.LayoutParams plp = lp(-1, dp(54)); plp.topMargin = dp(14); root.addView(pass, plp);

        Button login = new Button(this);
        login.setText("登录"); login.setTextSize(17); login.setTextColor(Color.WHITE); login.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        login.setAllCaps(false); login.setBackground(bg(ORANGE, 12));
        LinearLayout.LayoutParams blp = lp(-1, dp(54)); blp.topMargin = dp(24); root.addView(login, blp);

        Button register = new Button(this);
        register.setText("注册账号"); register.setTextSize(16); register.setTextColor(ORANGE); register.setAllCaps(false);
        register.setBackground(bordered(Color.WHITE, ORANGE, 12));
        LinearLayout.LayoutParams rlp = lp(-1, dp(52)); rlp.topMargin = dp(12); root.addView(register, rlp);

        TextView note = text("账号体系已为会员与后续充值服务预留。", 12, MUTED, false);
        note.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nlp = lp(-1, -2); nlp.topMargin = dp(22); root.addView(note, nlp);

        login.setOnClickListener(v -> doAuth(mail.getText().toString().trim(), pass.getText().toString(), false, login, register));
        register.setOnClickListener(v -> doAuth(mail.getText().toString().trim(), pass.getText().toString(), true, login, register));
        setContentView(sc);
    }

    private void doAuth(String mail, String password, boolean signup, Button login, Button register) {
        if (!mail.contains("@") || password.length() < 6) {
            Toast.makeText(this, "请输入有效邮箱，密码至少6位", Toast.LENGTH_SHORT).show(); return;
        }
        login.setEnabled(false); register.setEnabled(false);
        login.setText(signup ? "处理中…" : "登录中…");
        new Thread(() -> {
            try {
                String url = signup ? BASE + "/auth/v1/signup" : BASE + "/auth/v1/token?grant_type=password";
                JSONObject body = new JSONObject(); body.put("email", mail); body.put("password", password);
                HttpResult res = request("POST", url, null, body.toString());
                JSONObject obj = res.body.isEmpty() ? new JSONObject() : new JSONObject(res.body);
                if (res.code >= 200 && res.code < 300) {
                    String access = obj.optString("access_token", "");
                    JSONObject u = obj.optJSONObject("user");
                    String uid = u == null ? "" : u.optString("id", "");
                    if (!access.isEmpty()) {
                        token = access; userId = uid; email = mail;
                        prefs().edit().putString("access_token", token).putString("user_id", userId).putString("email", email).apply();
                        runOnUiThread(() -> showShell("home"));
                    } else if (signup) {
                        runOnUiThread(() -> {
                            login.setEnabled(true); register.setEnabled(true); login.setText("登录");
                            Toast.makeText(this, "注册成功。如需邮箱验证，请验证后登录。", Toast.LENGTH_LONG).show();
                        });
                    } else throw new Exception("登录响应缺少会话");
                } else {
                    String msg = obj.optString("msg", obj.optString("error_description", obj.optString("message", "请求失败")));
                    throw new Exception(msg);
                }
            } catch (Exception e) {
                runOnUiThread(() -> {
                    login.setEnabled(true); register.setEnabled(true); login.setText("登录");
                    Toast.makeText(this, "操作失败：" + safeMessage(e), Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    private String safeMessage(Exception e) {
        String s = e.getMessage(); return s == null || s.isEmpty() ? "网络或服务异常" : s;
    }

    private void showShell(String tab) {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);

        LinearLayout header = new LinearLayout(this); header.setOrientation(LinearLayout.HORIZONTAL); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(10), dp(14), dp(10)); header.setBackgroundColor(ORANGE);
        TextView brand = text("豪竞 Professional", 20, Color.WHITE, true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(48), 1));
        TextView account = text("我的", 14, Color.WHITE, true); account.setGravity(Gravity.CENTER);
        account.setPadding(dp(12), 0, dp(12), 0); account.setBackground(bordered(Color.argb(35,255,255,255), Color.argb(80,255,255,255), 18));
        header.addView(account, new LinearLayout.LayoutParams(-2, dp(36)));
        account.setOnClickListener(v -> selectTab("me"));
        root.addView(header, lp(-1, -2));

        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setBackgroundColor(BG);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));

        nav = new LinearLayout(this); nav.setOrientation(LinearLayout.HORIZONTAL); nav.setPadding(dp(3), dp(5), dp(3), dp(5)); nav.setBackgroundColor(Color.WHITE);
        addNav("首页", "home"); addNav("全池", "pool"); addNav("精选", "featured"); addNav("战绩", "history"); addNav("我的", "me");
        root.addView(nav, lp(-1, dp(62)));
        setContentView(root);
        selectTab(tab);
    }

    private void addNav(String label, String key) {
        TextView t = text(label, 13, MUTED, false); t.setGravity(Gravity.CENTER); t.setTag(key);
        t.setOnClickListener(v -> selectTab((String)v.getTag()));
        nav.addView(t, new LinearLayout.LayoutParams(0, -1, 1));
    }

    private void selectTab(String key) {
        if (nav != null) {
            for (int i=0;i<nav.getChildCount();i++) {
                TextView t=(TextView)nav.getChildAt(i); boolean on=key.equals(t.getTag());
                t.setTextColor(on?ORANGE:MUTED); t.setTypeface(Typeface.DEFAULT,on?Typeface.BOLD:Typeface.NORMAL);
            }
        }
        if ("home".equals(key)) showHome();
        else if ("pool".equals(key)) showPool();
        else if ("featured".equals(key)) showFeatured();
        else if ("history".equals(key)) showHistory();
        else showMe();
    }

    private ScrollView page(String title, String subtitle) {
        content.removeAllViews();
        ScrollView sc = new ScrollView(this); sc.setFillViewport(true); sc.setBackgroundColor(BG);
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(16), dp(18), dp(16), dp(28));
        TextView h = text(title, 24, TEXT, true); box.addView(h);
        if (subtitle != null) { TextView s=text(subtitle,13,MUTED,false); LinearLayout.LayoutParams p=lp(-1,-2);p.topMargin=dp(5);box.addView(s,p); }
        sc.addView(box, new ScrollView.LayoutParams(-1,-2)); content.addView(sc, new LinearLayout.LayoutParams(-1,-1));
        return sc;
    }

    private LinearLayout pageBox() {
        ScrollView sc=(ScrollView)content.getChildAt(0); return (LinearLayout)sc.getChildAt(0);
    }

    private View loading() {
        LinearLayout l=new LinearLayout(this); l.setGravity(Gravity.CENTER); l.setPadding(0,dp(42),0,dp(42));
        ProgressBar p=new ProgressBar(this); l.addView(p,new LinearLayout.LayoutParams(dp(34),dp(34))); return l;
    }

    private void showHome() {
        page("今日研判", "只展示客户需要的结论，不展示内部算法过程。");
        LinearLayout box=pageBox();
        LinearLayout hero=new LinearLayout(this); hero.setOrientation(LinearLayout.VERTICAL); hero.setPadding(dp(18),dp(16),dp(18),dp(16)); hero.setBackground(bg(ORANGE,16));
        TextView a=text("豪竞 2.7 专业版",19,Color.WHITE,true); hero.addView(a);
        TextView b=text("赛前数据 · 专业研判 · 风险控制",13,Color.WHITE,false); LinearLayout.LayoutParams bp=lp(-1,-2);bp.topMargin=dp(5);hero.addView(b,bp);
        LinearLayout.LayoutParams hp=lp(-1,-2);hp.topMargin=dp(18);box.addView(hero,hp);
        TextView sec=text("今日精选",18,TEXT,true); LinearLayout.LayoutParams sp=lp(-1,-2);sp.topMargin=dp(22);box.addView(sec,sp);
        box.addView(loading());
        loadFeatured(rows -> {
            box.removeViewAt(box.getChildCount()-1);
            List<JSONObject> latest=latestDate(rows);
            if (latest.isEmpty()) box.addView(empty("今日暂无已冻结精选"));
            else for (JSONObject r: latest) box.addView(matchCard(r,true,false));
        }, box);
    }

    private void showFeatured() {
        page("精选", "每场先比较三类玩法，只发布赛前信心最高的两类。点进比赛查看方案。");
        LinearLayout box=pageBox(); box.addView(loading());
        loadFeatured(rows -> {
            box.removeViewAt(box.getChildCount()-1);
            List<JSONObject> latest=latestDate(rows);
            if (latest.isEmpty()) box.addView(empty("暂无精选方案"));
            else for(JSONObject r:latest) box.addView(matchCard(r,true,false));
        }, box);
    }

    private void showPool() {
        page("全池", "全池只展示比赛与评测状态；具体精选方向不在列表公开。");
        LinearLayout box=pageBox(); box.addView(loading());
        new Thread(() -> {
            try {
                String q="/rest/v1/hao_app_full_snapshot_v14?select=publish_date,match_no,league,home_team,away_team,kickoff_bjt,result_text,eval_status&order=publish_date.desc,match_no.asc&limit=80";
                HttpResult r=request("GET",BASE+q,null,null); if(r.code<200||r.code>=300) throw new Exception("数据读取失败");
                JSONArray a=new JSONArray(r.body); ArrayList<JSONObject> rows=new ArrayList<>(); for(int i=0;i<a.length();i++)rows.add(a.getJSONObject(i));
                runOnUiThread(() -> {
                    box.removeViewAt(box.getChildCount()-1); List<JSONObject> latest=latestDate(rows);
                    if(latest.isEmpty()) box.addView(empty("暂无全池数据")); else for(JSONObject o:latest) box.addView(poolCard(o));
                });
            }catch(Exception e){runOnUiThread(()->replaceLoadingError(box,safeMessage(e)));}
        }).start();
    }

    private void showHistory() {
        page("战绩", "只按赛前冻结方案自动结算；列表不展示历史具体方向。");
        LinearLayout box=pageBox(); box.addView(loading());
        loadFeatured(rows -> {
            box.removeViewAt(box.getChildCount()-1); int n=0;
            for(JSONObject r:rows){ String st=r.optString("settle_status","待赛"); if(!"待赛".equals(st)){box.addView(matchCard(r,false,true));n++;} }
            if(n==0) box.addView(empty("暂无已结算精选"));
        }, box);
    }

    private void showMe() {
        page("我的账户", "账号与钱包已接入，充值通道暂未开放。");
        LinearLayout box=pageBox();
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(18),dp(18),dp(18),dp(18));card.setBackground(bg(Color.WHITE,16));
        TextView mail=text(email.isEmpty()?"已登录":email,17,TEXT,true);card.addView(mail);
        TextView status=text("账户状态：读取中…",14,MUTED,false); LinearLayout.LayoutParams stp=lp(-1,-2);stp.topMargin=dp(12);card.addView(status,stp);
        TextView member=text("会员：读取中…",14,MUTED,false); LinearLayout.LayoutParams mp=lp(-1,-2);mp.topMargin=dp(7);card.addView(member,mp);
        TextView wallet=text("余额：读取中…",14,MUTED,false); LinearLayout.LayoutParams wp=lp(-1,-2);wp.topMargin=dp(7);card.addView(wallet,wp);
        LinearLayout.LayoutParams cp=lp(-1,-2);cp.topMargin=dp(18);box.addView(card,cp);

        Button recharge=new Button(this);recharge.setText("充值（即将开放）");recharge.setTextColor(Color.WHITE);recharge.setAllCaps(false);recharge.setBackground(bg(ORANGE,12));
        LinearLayout.LayoutParams rp=lp(-1,dp(52));rp.topMargin=dp(16);box.addView(recharge,rp);recharge.setOnClickListener(v->Toast.makeText(this,"充值通道正在准备，当前不会扣款。",Toast.LENGTH_SHORT).show());
        Button logout=new Button(this);logout.setText("退出登录");logout.setTextColor(RED);logout.setAllCaps(false);logout.setBackground(bordered(Color.WHITE,BORDER,12));
        LinearLayout.LayoutParams lop=lp(-1,dp(50));lop.topMargin=dp(12);box.addView(logout,lop);logout.setOnClickListener(v->{prefs().edit().clear().apply();token="";userId="";showLogin();});
        loadAccount(status,member,wallet);
    }

    private void loadAccount(TextView status, TextView member, TextView wallet) {
        if(token.isEmpty()||userId.isEmpty()){status.setText("账户状态：已登录");member.setText("会员：普通用户");wallet.setText("余额：¥0.00");return;}
        new Thread(() -> {
            try {
                String uid=URLEncoder.encode(userId,"UTF-8");
                HttpResult pr=request("GET",BASE+"/rest/v1/hao_app_profiles?select=display_name,membership_tier,membership_expires_at,account_status&user_id=eq."+uid+"&limit=1",token,null);
                HttpResult wr=request("GET",BASE+"/rest/v1/hao_app_wallets?select=currency,balance_cents,frozen_cents&user_id=eq."+uid+"&limit=1",token,null);
                JSONArray pa=pr.code>=200&&pr.code<300?new JSONArray(pr.body):new JSONArray(); JSONArray wa=wr.code>=200&&wr.code<300?new JSONArray(wr.body):new JSONArray();
                JSONObject p=pa.length()>0?pa.getJSONObject(0):new JSONObject(); JSONObject w=wa.length()>0?wa.getJSONObject(0):new JSONObject();
                String as=p.optString("account_status","active");String mt=p.optString("membership_tier","FREE");long cents=w.optLong("balance_cents",0);
                runOnUiThread(()->{status.setText("账户状态："+("active".equalsIgnoreCase(as)?"正常":as));member.setText("会员："+mt);wallet.setText("余额：¥"+money.format(cents/100.0));});
            }catch(Exception e){runOnUiThread(()->{status.setText("账户状态：正常");member.setText("会员：普通用户");wallet.setText("余额：暂未读取");});}
        }).start();
    }

    private interface RowsCallback { void accept(List<JSONObject> rows); }

    private void loadFeatured(RowsCallback cb, LinearLayout box) {
        new Thread(() -> {
            try {
                String fields="publish_date,match_no,league,home_team,away_team,kickoff_bjt,category,recommendation_rank,official_handicap,play1_type,play1_pick1,play1_pick2,play2_type,play2_pick1,play2_pick2,star_level,short_reason,settle_status,result_text";
                String q="/rest/v1/hao_customer_featured_v03?select="+fields+"&order=publish_date.desc,recommendation_rank.asc&limit=80";
                HttpResult r=request("GET",BASE+q,null,null); if(r.code<200||r.code>=300) throw new Exception("精选数据读取失败");
                JSONArray a=new JSONArray(r.body);ArrayList<JSONObject> rows=new ArrayList<>();for(int i=0;i<a.length();i++)rows.add(a.getJSONObject(i));
                runOnUiThread(()->cb.accept(rows));
            }catch(Exception e){runOnUiThread(()->replaceLoadingError(box,safeMessage(e)));}
        }).start();
    }

    private List<JSONObject> latestDate(List<JSONObject> rows) {
        ArrayList<JSONObject> out=new ArrayList<>(); if(rows.isEmpty())return out;
        String d=rows.get(0).optString("publish_date",""); for(JSONObject r:rows)if(d.equals(r.optString("publish_date","")))out.add(r); return out;
    }

    private View empty(String s) { TextView t=text(s,14,MUTED,false);t.setGravity(Gravity.CENTER);t.setPadding(0,dp(40),0,dp(40));return t; }

    private void replaceLoadingError(LinearLayout box,String msg){ if(box.getChildCount()>0)box.removeViewAt(box.getChildCount()-1);TextView t=text("加载失败："+msg,14,RED,false);t.setPadding(0,dp(30),0,dp(30));box.addView(t); }

    private View matchCard(JSONObject r, boolean clickable, boolean history) {
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(16),dp(14),dp(16),dp(14));card.setBackground(bordered(Color.WHITE,BORDER,14));
        LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.HORIZONTAL);top.setGravity(Gravity.CENTER_VERTICAL);
        TextView left=text(r.optString("match_no","")+"  "+r.optString("league",""),12,MUTED,false);top.addView(left,new LinearLayout.LayoutParams(0,-2,1));
        String cat=history?r.optString("settle_status",""):r.optString("category","精选单场");
        int cc="评测成功".equals(cat)?GREEN:("评测未中".equals(cat)?RED:ORANGE);
        TextView badge=text(cat,12,cc,true);top.addView(badge);card.addView(top);
        TextView teams=text(r.optString("home_team","")+"  vs  "+r.optString("away_team",""),17,TEXT,true);LinearLayout.LayoutParams tp=lp(-1,-2);tp.topMargin=dp(10);card.addView(teams,tp);
        String result=r.optString("result_text","");
        if(history && !result.isEmpty()){TextView score=text("完场  "+result,14,TEXT,true);LinearLayout.LayoutParams sp=lp(-1,-2);sp.topMargin=dp(8);card.addView(score,sp);}
        else if(clickable){TextView hint=text("点击查看两项精选方案  ›",13,ORANGE,false);LinearLayout.LayoutParams hp=lp(-1,-2);hp.topMargin=dp(9);card.addView(hint,hp);}
        LinearLayout.LayoutParams cp=lp(-1,-2);cp.topMargin=dp(10);card.setLayoutParams(cp);
        if(clickable)card.setOnClickListener(v->showDetail(r)); return card;
    }

    private View poolCard(JSONObject r) {
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(15),dp(13),dp(15),dp(13));card.setBackground(bordered(Color.WHITE,BORDER,13));
        TextView meta=text(r.optString("match_no","")+"  "+r.optString("league",""),12,MUTED,false);card.addView(meta);
        TextView teams=text(r.optString("home_team","")+"  vs  "+r.optString("away_team",""),16,TEXT,true);LinearLayout.LayoutParams tp=lp(-1,-2);tp.topMargin=dp(7);card.addView(teams,tp);
        String result=r.optString("result_text","");String ev=r.optString("eval_status","");
        TextView st=text(result.isEmpty()?(ev.isEmpty()?"赛前评测已记录":ev):("赛果  "+result+"  "+ev),13,MUTED,false);LinearLayout.LayoutParams sp=lp(-1,-2);sp.topMargin=dp(7);card.addView(st,sp);
        LinearLayout.LayoutParams cp=lp(-1,-2);cp.topMargin=dp(9);card.setLayoutParams(cp);return card;
    }

    private void showDetail(JSONObject r) {
        String p1=formatPlan(r.optString("play1_type",""),r.optString("play1_pick1",""),r.optString("play1_pick2",""),r.optInt("official_handicap",0));
        String p2=formatPlan(r.optString("play2_type",""),r.optString("play2_pick1",""),r.optString("play2_pick2",""),r.optInt("official_handicap",0));
        StringBuilder m=new StringBuilder();
        m.append("精选方案\n\n① ").append(p1).append("\n\n② ").append(p2);
        m.append("\n\n评测规则\n以上两项任意命中一项，本场即为评测成功。方案在开赛前冻结，赛后自动结算。");
        String st=r.optString("settle_status","待赛");String score=r.optString("result_text","");if(!score.isEmpty())m.append("\n\n赛果：").append(score).append("　").append(st);
        m.append("\n\n赛前说明\n").append(r.optString("short_reason","综合赛前数据筛选后保留本场更有把握的两类方案。"));
        new AlertDialog.Builder(this).setTitle(r.optString("home_team","")+" vs "+r.optString("away_team","")).setMessage(m.toString()).setPositiveButton("知道了",null).show();
    }

    private String formatPlan(String type,String a,String b,int line) {
        if("半全场".equals(type))return "半全场："+a+" / "+b;
        if("让球胜平负".equals(type)){String l=line>0?"+"+line:String.valueOf(line);return "让球胜平负（"+l+"）："+a;}
        return "胜平负："+a;
    }

    private static class HttpResult { final int code; final String body; HttpResult(int c,String b){code=c;body=b;} }

    private HttpResult request(String method,String url,String authToken,String body) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();
        c.setRequestMethod(method);c.setConnectTimeout(12000);c.setReadTimeout(16000);c.setRequestProperty("apikey",API_KEY);c.setRequestProperty("Accept","application/json");
        if(authToken!=null&&!authToken.isEmpty())c.setRequestProperty("Authorization","Bearer "+authToken);
        if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");byte[] bytes=body.getBytes(StandardCharsets.UTF_8);try(OutputStream os=c.getOutputStream()){os.write(bytes);}}
        int code=c.getResponseCode();InputStream is=code>=400?c.getErrorStream():c.getInputStream();StringBuilder sb=new StringBuilder();
        if(is!=null)try(BufferedReader br=new BufferedReader(new InputStreamReader(is,StandardCharsets.UTF_8))){String line;while((line=br.readLine())!=null)sb.append(line);}
        c.disconnect();return new HttpResult(code,sb.toString());
    }
}
