import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const H={"user-agent":"Mozilla/5.0","accept-language":"zh-CN,zh;q=0.9"};

const ALIAS:Record<string,string[]>={
 "巴萨":["巴萨","巴塞罗那"],
 "维拉":["维拉","阿斯顿维拉"],
 "佐加顿斯":["佐加顿斯","尤尔加登"],
 "国际图尔":["国际图尔","图尔库国际","国际图尔库"],
 "TPS图尔":["TPS图尔","TPS图尔库"],
 "库奥皮奥":["库奥皮奥","古比斯"],
 "赫尔火花":["赫尔火花","赫尔辛基火花","格尼斯坦","Gnistan"],
 "吉马良斯":["吉马良斯","吉马雷斯"],
 "圣埃蒂安":["圣埃蒂安","圣艾蒂安"],
 "谢菲尔德联":["谢菲尔德联","谢菲联"],
 "西布罗姆维奇":["西布罗姆维奇","西布朗"],
 "布里斯托城":["布里斯托城","布里斯托尔城"],
 "弗洛西诺":["弗洛西诺","弗洛西诺内"],
 "塞尔塔":["塞尔塔","维戈塞尔塔"],
 "雷克斯汉姆":["雷克斯汉姆","雷克瑟姆"],
 "狼队":["狼队","伍尔弗汉普顿"],
 "热刺":["热刺","托特纳姆热刺"],
 "纽卡斯尔联":["纽卡斯尔联","纽卡斯尔"],
 "马竞":["马竞","马德里竞技"],
 "尤文图斯":["尤文图斯","尤文"],
 "国际米兰":["国际米兰","国米"],
 "埃斯托里":["埃斯托里","埃斯托里尔"]
};

const norm=(s:any)=>String(s||"").toLowerCase().replace(/足球俱乐部|俱乐部|football club|\bfc\b/gi,"").replace(/[·•\.\-—_\s]/g,"").trim();
const CANON=new Map<string,string>();
for(const [k,vs] of Object.entries(ALIAS)){for(const v of [k,...vs])CANON.set(norm(v),norm(k));}
const canon=(s:any)=>CANON.get(norm(s))||norm(s);
const teamEq=(a:any,b:any)=>!!canon(a)&&canon(a)===canon(b);

const clean=(s:string)=>s
 .replace(/<script[\s\S]*?<\/script>/gi," ")
 .replace(/<style[\s\S]*?<\/style>/gi," ")
 .replace(/<[^>]+>/g," ")
 .replace(/&nbsp;|&#160;/gi," ")
 .replace(/&amp;/gi,"&")
 .replace(/&quot;/gi,'"')
 .replace(/&#39;|&apos;/gi,"'")
 .replace(/\s+/g," ")
 .trim();

async function fetchText(u:string){
 const c=new AbortController(),tm=setTimeout(()=>c.abort(),12000);
 try{
   const r=await fetch(u,{headers:H,signal:c.signal});
   return {ok:r.ok,status:r.status,text:await r.text()};
 } finally {clearTimeout(tm)}
}
async function digest(s:string){
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function structuredTeams(text:string){
 const re=/([^\s，。；：:（）()]{2,32})\s*[（(](主队|客队)[）)]/g;
 let home:any=null,away:any=null,m:any;
 while((m=re.exec(text))){
   const team=String(m[1]||"").trim();
   const side=String(m[2]);
   if(side==="主队"&&!home) home={team,pos:m.index};
   if(side==="客队"&&!away) away={team,pos:m.index};
 }
 if(!home||!away||home.pos===away.pos)return null;
 return {home:home.team,away:away.team,homePos:home.pos,awayPos:away.pos};
}
function clipAtNextLabel(s:string){
 const labels=["有利情报","不利情报","中立情报","中立"];
 let cut=s.length;
 for(const l of labels){const i=s.indexOf(l);if(i>=0&&i<cut)cut=i;}
 return s.slice(0,cut).replace(/下载小炮APP[\s\S]*$/,"").replace(/关键词[\s\S]*$/,"").trim();
}
function section(seg:string,label:string){
 const i=seg.indexOf(label); if(i<0)return "";
 return clipAtNextLabel(seg.slice(i+label.length));
}
function splitFacts(s:string){
 const t=s.replace(/\s+/g," ").trim(); if(!t)return [];
 const marks=[...t.matchAll(/(?:^|\s)(\d{1,2})[\.、]\s*/g)];
 if(!marks.length)return [t.slice(0,900)];
 const out:string[]=[];
 for(let i=0;i<marks.length;i++){
   const start=(marks[i].index||0)+marks[i][0].length;
   const end=i+1<marks.length?(marks[i+1].index||t.length):t.length;
   const x=t.slice(start,end).trim();
   if(x)out.push(x.slice(0,900));
 }
 return out.slice(0,12);
}
function classifyFact(f:string,basePolarity:string){
 const has=(r:RegExp)=>r.test(f);
 const suspension=has(/停赛|禁赛|红牌|累计.{0,8}黄牌|追加处罚/);
 const returnBack=has(/复出|解禁|伤愈|回归|恢复训练|重返|重新合练/);
 const injury=has(/伤停|伤缺|受伤|伤退|伤病|缺席|手术|免战牌|出战成疑|无法出战/);
 const rotation=has(/轮换|替补出战|主力休息|大幅轮换|雪藏/);
 const squad=has(/引援|加盟|签下|租借|买断|转会|离队|续约|补强/);
 if((suspension||injury)&&returnBack)return {category:"阵容变化",polarity:"mixed"};
 if(suspension)return {category:"停赛",polarity:"negative"};
 if(returnBack)return {category:"复出",polarity:"positive"};
 if(injury)return {category:"伤停",polarity:"negative"};
 if(rotation)return {category:"轮换",polarity:basePolarity};
 if(squad)return {category:"阵容变化",polarity:basePolarity};
 return {category:basePolarity==="positive"?"有利情报":"不利情报",polarity:basePolarity};
}
async function insert(row:any){
 row.fingerprint=await digest(["v2",row.pool_kind,row.pool_date||"",row.issue_no||"",row.match_no,row.source_code,row.source_item_id||"",row.category,row.team_side||"",row.fact_text||""].join("|"));
 const {error}=await sb.from("hao_match_intelligence_v01").upsert(row,{onConflict:"fingerprint",ignoreDuplicates:true});
 if(error)throw error;
}

Deno.serve(async()=>{
 try{
  const {data:od}=await sb.from("jc_offerings_2026").select("offer_date").order("offer_date",{ascending:false}).limit(1).maybeSingle();
  const saleDate=od?.offer_date||null;
  const {data:hj}=saleDate?await sb.from("jc_offerings_2026").select("id,offer_date,match_no,league,home_team,away_team,kickoff_local,is_world_cup").eq("offer_date",saleDate).eq("is_world_cup",false).order("match_no"):{data:[]};

  const {data:io}=await sb.from("r9_issues_2026").select("issue_no").order("issue_no",{ascending:false}).limit(1).maybeSingle();
  const issue=io?.issue_no||null;
  const {data:hc}=issue?await sb.from("r9_issues_2026").select("issue_no,seq_no,competition,home_team,away_team,match_date,is_world_cup").eq("issue_no",issue).eq("is_world_cup",false).order("seq_no"):{data:[]};

  const pools:any[]=[
   ...(hj||[]).map((x:any)=>({pool_kind:"hj",pool_date:x.offer_date,issue_no:null,offering_id:x.id,match_no:String(x.match_no).padStart(2,"0"),league:x.league,home_team:x.home_team,away_team:x.away_team,kickoff_bjt:x.kickoff_local?String(x.kickoff_local).replace(" ","T")+"+08:00":null})),
   ...(hc||[]).map((x:any)=>({pool_kind:"hc",pool_date:null,issue_no:x.issue_no,offering_id:null,match_no:String(x.seq_no).padStart(2,"0"),league:x.competition,home_team:x.home_team,away_team:x.away_team,kickoff_bjt:null}))
  ];

  const pages=Array.from({length:12},(_,i)=>i+1);
  const feeds=await Promise.all(pages.map(async page=>{
    try{
      const u="https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2512&k=&num=50&page="+page;
      const r=await fetch(u,{headers:H});
      if(!r.ok)return [];
      const j=await r.json();
      return (j?.result?.data||[]).map((x:any)=>({...x,page}));
    }catch{return []}
  }));

  const since=Date.now()-72*3600*1000;
  const items=feeds.flat().filter((x:any)=>String(x.title||"").includes("[小炮APP]竞彩情报")&&Number(x.ctime||0)*1000>=since&&/^https:\/\/sports\.sina\.com\.cn\/l\//.test(String(x.url||"")));
  const uniq=[...new Map(items.map((x:any)=>[x.url,x])).values()] as any[];

  let articles=0,strictStructured=0,mapped=0,rowsAttempted=0;
  const mappings:any[]=[],unmatched:any[]=[];

  for(let i=0;i<uniq.length;i+=6){
   const batch=uniq.slice(i,i+6);
   const fetched=await Promise.all(batch.map(async(x:any)=>{
     try{const r=await fetchText(String(x.url));return {...x,body:r.ok?clean(r.text):"",http_status:r.status}}
     catch{return {...x,body:"",http_status:0}}
   }));

   for(const a of fetched){
    if(!a.body)continue; articles++;
    const st=structuredTeams(a.body);
    if(!st){unmatched.push({title:a.title,url:a.url,reason:"NO_STRICT_HOME_AWAY_HEADINGS"});continue;}
    strictStructured++;
    const matchedPools=pools.filter((m:any)=>teamEq(st.home,m.home_team)&&teamEq(st.away,m.away_team));
    if(!matchedPools.length){
      unmatched.push({title:a.title,url:a.url,article_home:st.home,article_away:st.away,reason:"NO_POOL_EXACT_TEAM_MATCH"});
      continue;
    }

    const firstPos=Math.min(st.homePos,st.awayPos);
    const secondPos=Math.max(st.homePos,st.awayPos);
    const firstSeg=a.body.slice(firstPos,secondPos);
    const secondSeg=a.body.slice(secondPos);
    const homeSeg=st.homePos<st.awayPos?firstSeg:secondSeg;
    const awaySeg=st.awayPos>st.homePos?secondSeg:firstSeg;
    const pub=Number(a.ctime)>0?new Date(Number(a.ctime)*1000).toISOString():null;
    const sid=(String(a.url).match(/doc-([^.\/]+)\.shtml/)||[])[1]||String(a.url);

    for(const m of matchedPools){
      let n=0;
      for(const it of [{side:"home",seg:homeSeg,team:m.home_team},{side:"away",seg:awaySeg,team:m.away_team}]){
        for(const block of [{label:"有利情报",pol:"positive"},{label:"不利情报",pol:"negative"}]){
          const sec=section(it.seg,block.label);
          for(const fact of splitFacts(sec)){
            if(!fact)continue;
            const cls=classifyFact(fact,block.pol);
            const publishedBeforeKickoff=!!(pub&&m.kickoff_bjt&&new Date(pub).getTime()<new Date(m.kickoff_bjt).getTime());
            await insert({
              ...m,
              source_code:"sina_xiaopao",
              source_item_id:sid,
              source_url:a.url,
              category:cls.category,
              team_side:it.side,
              polarity:cls.polarity,
              evidence_grade:"XP-B",
              headline:a.title,
              fact_text:fact,
              source_published_at:pub,
              fetched_at:new Date().toISOString(),
              match_confidence:"strict_article_home_away_heading",
              parse_status:"parsed_structured_prematch_v2",
              affects_formal:false,
              raw:{
                parser_version:"v2-strict-headings",
                article_home:st.home,
                article_away:st.away,
                team:it.team,
                source_section:block.label,
                feed_intro:a.intro||null,
                feed_page:a.page,
                published_before_kickoff:publishedBeforeKickoff,
                formal_eligibility:"executor_must_check_freeze_time"
              }
            });
            n++;rowsAttempted++;
          }
        }
      }
      if(n){
        mapped++;
        mappings.push({pool:m.pool_kind,issue:m.issue_no,pool_date:m.pool_date,match_no:m.match_no,match:m.home_team+"-"+m.away_team,article_home:st.home,article_away:st.away,title:a.title,rows:n});
      }
    }
   }
  }

  const hjExpected=new Set(pools.filter((x:any)=>x.pool_kind==='hj').map((x:any)=>String(x.offering_id))).size;
  const hjMapped=new Set(mappings.filter((x:any)=>x.pool==='hj').map((x:any)=>String(x.match_no))).size;
  const healthAt=new Date().toISOString();
  await sb.from('hao_source_health_v01').upsert({
    source_code:'sina_xiaopao',source_role:'prematch_intelligence_optional_coverage',status:'ok',
    last_attempt_at:healthAt,last_success_at:healthAt,latest_pool_date:saleDate,
    expected_matches:hjExpected,mapped_matches:hjMapped,captured_matches:hjMapped,verified_matches:hjMapped,
    consecutive_failures:0,last_error:null,
    notes:`strict feed/parser healthy; source publishes selective coverage; HJ mapped=${hjMapped}/${hjExpected}`,
    updated_at:healthAt
  },{onConflict:'source_code'});

  return Response.json({
    ok:true,status:"COMPLETE_V2_STRICT",
    parser_version:"v2-strict-headings",
    sale_date:saleDate,issue_no:issue,
    pool_matches:pools.length,
    feed_hits:uniq.length,articles_fetched:articles,strict_structured_articles:strictStructured,
    mapped_pairs:mapped,rows_inserted_attempted:rowsAttempted,
    mappings,unmatched:unmatched.slice(0,60)
  });
 }catch(e:any){
   return Response.json({ok:false,error:String(e?.message||e)},{status:500});
 }
});
