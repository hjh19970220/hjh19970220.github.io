import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const CUSTOMER_API = "https://ttydbcejxqxdkcfoizkj.supabase.co/functions/v1/soren-public-api-v1";
const CUSTOMER_PUBLISHABLE_KEY = "sb_publishable_n5thZ1g6h93ronyzPfqhsg_N_lFaoSa";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};
let cookieJar = "";
const ALIAS: Record<string, string> = {
  "阿斯顿维拉": "维拉", "阿斯顿维拉队": "维拉", "伍尔弗汉普顿": "狼队",
  "布里斯托尔城": "布城", "布里斯托城": "布城", "布里斯托": "布城",
  "南安普敦": "南安普顿", "西汉姆": "西汉姆联", "谢菲尔德联": "谢菲联",
  "朴次茅斯": "朴茨茅斯", "弗洛西诺内": "弗洛西诺", "TPS土尔库": "TPS图尔",
  "国际图尔库": "国际图尔", "库普斯": "库奥皮奥", "赫塔菲": "赫塔费", "巴塞罗那": "巴萨",
  "枥木UvaFC": "枥木城", "枥木UVAFC": "枥木城", "栃木UvaFC": "枥木城", "枥木市FC": "枥木城",
  "女王公园巡游者": "女王巡游", "女王公园巡游": "女王巡游", "女王巡游者": "女王巡游",
  "雷克斯": "雷克瑟姆", "弗洛西诺尼": "弗洛西诺", "奥斯纳布鲁克": "奥斯纳",
  "米拉索尔": "米拉索", "町田泽维亚": "町田泽维", "斯洛文尼": "斯洛文尼亚",
};

function bjtDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function strip(s: string) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/&minus;|&#8722;|−/g, "-").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function canon(x: unknown) {
  const z = String(x || "").replace(/\s+/g, "").replace(/足球俱乐部|俱乐部|FC$/ig, "");
  return ALIAS[z] || z;
}
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function one(a: string, b: string) {
  a = canon(a); b = canon(b);
  return a === b || (Math.min(a.length, b.length) >= 3 && lev(a, b) <= 1) || a.includes(b) || b.includes(a);
}
function decodeBest(buf: Uint8Array) {
  const choices: { enc: string; text: string; score: number }[] = [];
  for (const enc of ["gb18030", "utf-8"]) {
    try {
      const text = new TextDecoder(enc as "utf-8").decode(buf);
      const score = (text.match(/竞彩|比赛时间|欧赔|平均|情报|伤停|有利|不利|主队|客队/g) || []).length;
      choices.push({ enc, text, score });
    } catch { /* ignore unsupported decoder */ }
  }
  choices.sort((a, b) => b.score - a.score);
  return choices[0];
}
async function fetchHtml(url: string, referer = "https://www.okooo.com/jingcai/") {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: {
        "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "cache-control": "no-cache", "upgrade-insecure-requests": "1", referer,
        ...(cookieJar ? { cookie: cookieJar } : {}),
      }, signal: AbortSignal.timeout(18000) });
      const bytes = new Uint8Array(await r.arrayBuffer());
      const setCookie = r.headers.get("set-cookie");
      if (setCookie) cookieJar = setCookie.split(",").map((x) => x.split(";")[0]).join("; ");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const decoded = decodeBest(bytes);
      return { url, html: decoded.text, enc: decoded.enc, status: r.status, bytes: bytes.length };
    } catch (e) {
      last = e;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1400));
    }
  }
  throw last;
}
function parseRows(html: string, url: string) {
  const out: any[] = [];
  for (const raw of html.split('<div class="touzhu_1"')) {
    const no = raw.match(/<span class="xulie"[^>]*>([0-9]{3})<\/span>/)?.[1];
    if (!no) continue;
    const mid = raw.match(/id="match_([0-9]+)"/)?.[1] || null;
    const kickoff = raw.match(/title="比赛时间:([^"]+)"/)?.[1] || null;
    const names = [...raw.matchAll(/class="zhum[^"]*"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/div>/g)]
      .map((m) => ({ title: strip(m[1]), text: strip(m[2]) })).filter((x) => x.title || x.text);
    if (names.length >= 2) {
      const home = names[0], away = names[names.length - 1];
      out.push({ no, mid, kickoff, home: home.title || home.text, away: away.title || away.text,
        homeVariants: [home.title, home.text].filter(Boolean), awayVariants: [away.title, away.text].filter(Boolean), url });
    }
  }
  return out;
}
function rowCells(tr: string) {
  return [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => strip(m[1]));
}
function numericCell(s: string) {
  const m = String(s || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function parseOdds(html: string) {
  const rows: any[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const cells = rowCells(m[0]);
    if (cells.length < 16 || !/^\d+$/.test(cells[0] || "")) continue;
    const company = cells[1];
    const trio = [numericCell(cells[5]), numericCell(cells[6]), numericCell(cells[7])];
    if (company && trio.every((v) => v !== null && v > 1 && v < 100)) {
      rows.push({ company, home: trio[0], draw: trio[1], away: trio[2],
        initial: [numericCell(cells[2]), numericCell(cells[3]), numericCell(cells[4])],
        probabilities: [numericCell(cells[9]), numericCell(cells[10]), numericCell(cells[11])],
        kelly: [numericCell(cells[12]), numericCell(cells[13]), numericCell(cells[14])],
        payout: numericCell(cells[15]) });
    }
  }
  const unique = [...new Map(rows.map((r) => [r.company, r])).values()];
  const mean = (key: "home" | "draw" | "away") => unique.length ? unique.reduce((s, r) => s + r[key], 0) / unique.length : null;
  return { bookmaker_count: unique.length, avg_home: mean("home"), avg_draw: mean("draw"), avg_away: mean("away"), bookmakers: unique };
}
function oddsDebug(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map((m) => rowCells(m[0])).filter((x) => x.length >= 16).slice(0, 30);
}
function pageHints(html: string) {
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const urls = [...html.matchAll(/(?:src|href|url)\s*(?:=|:)\s*["']([^"'<> ]+)["']/gi)]
    .map((m) => m[1]).filter((x) => /odds|match|ajax|api|soccer/i.test(x));
  const snippets: string[] = [];
  for (const token of ["ajax", "odds", "company", "average", "赔率", "欧赔"]) {
    let at = html.toLowerCase().indexOf(token.toLowerCase());
    for (let n = 0; at >= 0 && n < 4; n++) {
      snippets.push(strip(html.slice(Math.max(0, at - 180), Math.min(html.length, at + 360))));
      at = html.toLowerCase().indexOf(token.toLowerCase(), at + token.length);
    }
  }
  return { scripts: [...new Set(scripts)].slice(0, 80), urls: [...new Set(urls)].slice(0, 80), snippets: [...new Set(snippets)].slice(0, 30) };
}
async function fetchFirst(urls: string[], referer: string) {
  let last: unknown = null;
  for (const url of urls) {
    try { return await fetchHtml(url, referer); } catch (e) { last = e; }
  }
  throw last;
}
function textItems(html: string) {
  const items: string[] = [];
  for (const m of html.matchAll(/<(?:li|p|dd|div)[^>]*>([\s\S]*?)<\/(?:li|p|dd|div)>/gi)) {
    const t = strip(m[1]);
    if (t.length >= 8 && t.length <= 280 && /伤|停|缺|出战|复出|有利|不利|主队|客队|近况|状态|阵容|交锋|赛程|体能|战意/.test(t)) items.push(t);
  }
  return [...new Set(items)].slice(0, 120);
}
function parseIntel(html: string, home: string, away: string) {
  const all = textItems(html);
  const injuries = all.filter((x) => /伤|停赛|缺阵|出战成疑|复出/.test(x));
  const homeItems = all.filter((x) => x.includes(home) || x.includes(canon(home)) || /主队/.test(x));
  const awayItems = all.filter((x) => x.includes(away) || x.includes(canon(away)) || /客队/.test(x));
  const assigned = new Set([...homeItems, ...awayItems, ...injuries]);
  const remainder = all.filter((x) => !assigned.has(x));
  return { home_items: [...homeItems, ...remainder.filter((_, i) => i % 2 === 0)].slice(0, 40),
    away_items: [...awayItems, ...remainder.filter((_, i) => i % 2 === 1)].slice(0, 40),
    injury_items: injuries.slice(0, 40), all_items: all };
}
function timing(kickoffLocal: string) {
  const kickoff = new Date(String(kickoffLocal).replace(" ", "T") + "+08:00").getTime();
  const mins = (kickoff - Date.now()) / 60000;
  if (!Number.isFinite(mins)) return { eligible: false, mins: null, quality: "UNKNOWN" };
  if (mins <= 0) return { eligible: false, mins, quality: "POST_KICKOFF_REJECT" };
  if (mins >= 360) return { eligible: true, mins, quality: "PREMATCH_GT6H" };
  if (mins >= 180) return { eligible: true, mins, quality: "PREMATCH_3_6H" };
  if (mins >= 60) return { eligible: true, mins, quality: "PREMATCH_1_3H" };
  if (mins >= 30) return { eligible: true, mins, quality: "PREMATCH_30_60M" };
  return { eligible: true, mins, quality: "PREMATCH_LT30M" };
}
async function sha(value: unknown) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: CORS });
}
async function requireCustomerAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false as const, response: json({ ok: false, error: "LOGIN_REQUIRED" }, 401) };
  try {
    const response = await fetch(CUSTOMER_API + "?view=membership", {
      headers: { Authorization: "Bearer " + token, apikey: CUSTOMER_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false as const, response: json({ ok: false, error: response.status === 401 ? "LOGIN_REQUIRED" : "ADMIN_CHECK_FAILED" }, response.status === 401 ? 401 : 403) };
    const data = await response.json();
    if (data?.ok !== true || data?.membership?.isAdmin !== true)
      return { ok: false as const, response: json({ ok: false, error: "ADMIN_REQUIRED" }, 403) };
    return { ok: true as const };
  } catch (error) {
    console.error("SHADOW_ADMIN_CHECK_FAILED", error);
    return { ok: false as const, response: json({ ok: false, error: "ADMIN_CHECK_UNAVAILABLE" }, 503) };
  }
}
function safeIntelItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => String(x || "").replace(/\\+\"\s*\/>/g, "").trim())
    .filter((x) => x.length >= 8 && !/绝密情报|绝密爆料|伤停解析等/.test(x)))].slice(0, 12);
}
async function serveAdminPreview(req: Request, u: URL) {
  const auth = await requireCustomerAdmin(req);
  if (!auth.ok) return auth.response;
  const date = u.searchParams.get("date") || "";
  const no = u.searchParams.get("no") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{3}$/.test(no))
    return json({ ok: false, error: "INVALID_MATCH_ID" }, 400);
  const { data: offering, error: offeringError } = await sb.from("jc_offerings_2026")
    .select("id,offer_date,match_no,league,home_team,away_team,kickoff_local")
    .eq("offer_date", date).eq("match_no", Number(no)).maybeSingle();
  if (offeringError) throw offeringError;
  if (!offering) return json({ ok: false, error: "MATCH_NOT_FOUND" }, 404);
  const [marketResult, intelResult] = await Promise.all([
    sb.from("hao_okooo_market_shadow_v01")
      .select("source_match_id,source_url,bookmaker_count,avg_home,avg_draw,avg_away,captured_at,timing_quality,fetch_status")
      .eq("offering_id", offering.id).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("hao_okooo_intel_shadow_v01")
      .select("source_match_id,source_url,home_items,away_items,injury_items,captured_at,timing_quality,fetch_status")
      .eq("offering_id", offering.id).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (marketResult.error) throw marketResult.error;
  if (intelResult.error) throw intelResult.error;
  const market = marketResult.data;
  const intel = intelResult.data;
  return json({
    ok: true,
    shadowOnly: true,
    match: {
      date: String(offering.offer_date), no: String(offering.match_no).padStart(3, "0"),
      league: offering.league, home: offering.home_team, away: offering.away_team,
      kickoffLocal: offering.kickoff_local,
    },
    market: market ? {
      status: market.fetch_status, bookmakerCount: market.bookmaker_count,
      average: { home: market.avg_home, draw: market.avg_draw, away: market.avg_away },
      capturedAt: market.captured_at, timingQuality: market.timing_quality,
      sourceMatchId: market.source_match_id, sourceUrl: market.source_url,
    } : null,
    intelligence: intel ? {
      status: intel.fetch_status,
      homeItems: safeIntelItems(intel.home_items), awayItems: safeIntelItems(intel.away_items),
      injuryItems: safeIntelItems(intel.injury_items),
      capturedAt: intel.captured_at, timingQuality: intel.timing_quality,
      sourceMatchId: intel.source_match_id, sourceUrl: intel.source_url,
    } : null,
    updatedAt: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (u.searchParams.get("view") === "admin-preview") {
    if (req.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    try { return await serveAdminPreview(req, u); }
    catch (error) {
      console.error("SHADOW_PREVIEW_FAILED", error);
      return json({ ok: false, error: "SHADOW_PREVIEW_UNAVAILABLE" }, 502);
    }
  }
  if (u.searchParams.get("jsprobe") === "1") {
    const targets = [
      "https://imgv1.okoooimg.cn/min/?b=JS&f=dataanalysis%2fnewfootvictorysp.js&v=202602271022",
      "https://imgv1.okoooimg.cn/min/?b=JS&f=dataanalysis%2fpushdata.js,dataanalysis%2fheaderdata.js&v=202603181616",
    ];
    const out: any[] = [];
    for (const target of targets) {
      try {
        const p = await fetchHtml(target, "https://www.okooo.com/");
        const hits = [...p.html.matchAll(/.{0,220}(?:ajax|url|odds|matchid|betting_type|company).{0,420}/gi)]
          .map((m) => m[0]).slice(0, 80);
        out.push({ target, bytes: p.bytes, hits });
      } catch (e) { out.push({ target, error: String(e) }); }
    }
    return Response.json({ ok: true, jsprobe: out });
  }
  const date = u.searchParams.get("date") || bjtDate();
  const dry = u.searchParams.get("dry") === "1";
  const debug = dry && u.searchParams.get("debug") === "1";
  const fromNo = Math.max(1, Number(u.searchParams.get("from") || 1));
  const toNo = Math.min(999, Number(u.searchParams.get("to") || 15));
  const now = new Date().toISOString();
  try {
    const { data: offerings, error } = await sb.from("jc_offerings_2026")
      .select("id,match_no,home_team,away_team,kickoff_local")
      .eq("offer_date", date).gte("match_no", fromNo).lte("match_no", toNo).order("match_no");
    if (error) throw error;
    const listPages = await Promise.allSettled([
      "https://www.okooo.com/jingcai/", "https://www.okooo.com/jingcai/shuju/", `https://www.okooo.com/jingcai/${date}/`,
    ].map((url) => fetchHtml(url)));
    let sourceRows: any[] = [];
    for (const page of listPages) if (page.status === "fulfilled") sourceRows.push(...parseRows(page.value.html, page.value.url));
    sourceRows = [...new Map(sourceRows.map((r) => [[r.mid, r.no, r.kickoff, r.home, r.away].join("|"), r])).values()];

    const results: any[] = [];
    for (const offering of offerings || []) {
      const sameNo = sourceRows.filter((r) => Number(r.no) === Number(offering.match_no));
      const strict = sameNo.filter((r) => (r.homeVariants || [r.home]).some((x: string) => one(x, offering.home_team))
        && (r.awayVariants || [r.away]).some((x: string) => one(x, offering.away_team)));
      const near = sameNo.filter((r) => r.kickoff && Math.abs(
        new Date(String(r.kickoff).replace(" ", "T") + "+08:00").getTime() -
        new Date(String(offering.kickoff_local).replace(" ", "T") + "+08:00").getTime(),
      ) <= 10 * 60 * 1000);
      const candidates = strict.length ? strict : (near.length === 1 ? near : []);
      const best = candidates.sort((a, b) => Math.abs(new Date(String(a.kickoff).replace(" ", "T") + "+08:00").getTime() - new Date(String(offering.kickoff_local).replace(" ", "T") + "+08:00").getTime()) - Math.abs(new Date(String(b.kickoff).replace(" ", "T") + "+08:00").getTime() - new Date(String(offering.kickoff_local).replace(" ", "T") + "+08:00").getTime()))[0];
      if (!best?.mid) { results.push({ match_no: offering.match_no, status: "identity_unconfirmed", candidates: sameNo.length }); continue; }
      const t = timing(offering.kickoff_local);
      if (!t.eligible) { results.push({ match_no: offering.match_no, mid: best.mid, status: "post_kickoff_rejected", timing_quality: t.quality }); continue; }
      const base = `https://www.okooo.com/soccer/match/${best.mid}`;
      const oddsShell = await Promise.resolve().then(() => fetchFirst([
        `${base}/odds/`, `https://m.okooo.com/soccer/match/${best.mid}/odds/`,
      ], `${base}/`)).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason }));
      let oddsPage = oddsShell.status === "fulfilled"
        ? await Promise.resolve().then(() => fetchHtml(
          `${base}/odds/ajax/?page=0&all=1&companytype=BaijiaBooks&type=1`, oddsShell.value.url,
        )).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason }))
        : oddsShell;
      const mobileOddsUrl = oddsShell.status === "fulfilled"
        ? oddsShell.value.html.match(/mobile-agent[^>]+url=(https:\/\/m\.okooo\.com\/[^"' ;>]+)/i)?.[1]?.replace(/&amp;/g, "&")
        : null;
      let marketBlockedByLogin = oddsPage.status === "fulfilled" && /needLogin\s*=\s*['"]1['"]/.test(oddsPage.value.html);
      if (marketBlockedByLogin && mobileOddsUrl) {
        oddsPage = await Promise.resolve().then(() => fetchHtml(mobileOddsUrl, oddsShell.status === "fulfilled" ? oddsShell.value.url : `${base}/odds/`))
          .then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason }));
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
      const intelPage = await Promise.resolve().then(() => fetchFirst([
        `${base}/qingbao/`, `https://m.okooo.com/soccer/match/${best.mid}/qingbao/`,
      ], `${base}/`)).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason }));
      let marketStatus = "fetch_error", intelStatus = "fetch_error";
      let market: any = null, intel: any = null;
      if (oddsPage.status === "fulfilled") {
        market = parseOdds(oddsPage.value.html);
        marketStatus = market.bookmaker_count > 0 ? "ok" : "parse_empty";
        const payload = { source: "okooo", match_no: offering.match_no, home: best.home, away: best.away,
          endpoint: oddsPage.value.url, charset: oddsPage.value.enc, bytes: oddsPage.value.bytes, ...market };
        if (!dry) {
          const { error: writeError } = await sb.from("hao_okooo_market_shadow_v01").insert({
            offering_id: offering.id, source_match_id: best.mid, source_url: oddsPage.value.url,
            bookmaker_count: market.bookmaker_count, avg_home: market.avg_home, avg_draw: market.avg_draw, avg_away: market.avg_away,
            market_payload: payload, captured_at: now, timing_quality: t.quality, fetch_status: marketStatus, source_hash: await sha(payload),
          });
          if (writeError) throw writeError;
        }
      }
      if (oddsPage.status === "rejected") {
        marketStatus = marketBlockedByLogin ? "login_required" : "fetch_error";
        const payload = { source: "okooo", match_no: offering.match_no, home: best.home, away: best.away,
          endpoint: `${base}/odds/`, error: String(oddsPage.reason), blocked_by_login: marketBlockedByLogin };
        if (!dry) {
          const { error: writeError } = await sb.from("hao_okooo_market_shadow_v01").insert({
            offering_id: offering.id, source_match_id: best.mid, source_url: `${base}/odds/`,
            bookmaker_count: 0, avg_home: null, avg_draw: null, avg_away: null,
            market_payload: payload, captured_at: now, timing_quality: t.quality, fetch_status: marketStatus, source_hash: await sha(payload),
          });
          if (writeError) throw writeError;
        }
      }
      if (intelPage.status === "fulfilled") {
        intel = parseIntel(intelPage.value.html, best.home, best.away);
        intelStatus = intel.all_items.length > 0 ? "ok" : "parse_empty";
        const payload = { source: "okooo", match_no: offering.match_no, home: best.home, away: best.away,
          endpoint: intelPage.value.url, charset: intelPage.value.enc, bytes: intelPage.value.bytes, all_items: intel.all_items };
        if (!dry) {
          const { error: writeError } = await sb.from("hao_okooo_intel_shadow_v01").insert({
            offering_id: offering.id, source_match_id: best.mid, source_url: intelPage.value.url,
            home_items: intel.home_items, away_items: intel.away_items, injury_items: intel.injury_items,
            raw_payload: payload, captured_at: now, timing_quality: t.quality, fetch_status: intelStatus, source_hash: await sha(payload),
          });
          if (writeError) throw writeError;
        }
      }
      if (intelPage.status === "rejected") {
        const payload = { source: "okooo", match_no: offering.match_no, home: best.home, away: best.away,
          endpoint: `${base}/qingbao/`, error: String(intelPage.reason) };
        if (!dry) {
          const { error: writeError } = await sb.from("hao_okooo_intel_shadow_v01").insert({
            offering_id: offering.id, source_match_id: best.mid, source_url: `${base}/qingbao/`,
            home_items: [], away_items: [], injury_items: [], raw_payload: payload,
            captured_at: now, timing_quality: t.quality, fetch_status: intelStatus, source_hash: await sha(payload),
          });
          if (writeError) throw writeError;
        }
      }
      results.push({ match_no: offering.match_no, mid: best.mid, status: "mapped", timing_quality: t.quality,
        market: { status: marketStatus, bookmaker_count: market?.bookmaker_count || 0, averages: market ? [market.avg_home, market.avg_draw, market.avg_away] : null,
          debug_rows: debug && oddsPage.status === "fulfilled" ? oddsDebug(oddsPage.value.html) : undefined,
          debug_hints: debug && oddsPage.status === "fulfilled" ? pageHints(oddsPage.value.html) : undefined,
          debug_raw: debug && oddsPage.status === "fulfilled" ? oddsPage.value.html.slice(0, 1800) : undefined,
          debug_bytes: debug && oddsPage.status === "fulfilled" ? oddsPage.value.bytes : undefined,
          error: oddsPage.status === "rejected" ? String(oddsPage.reason) : null },
        intel: { status: intelStatus, total: intel?.all_items?.length || 0, home: intel?.home_items?.length || 0,
          away: intel?.away_items?.length || 0, injuries: intel?.injury_items?.length || 0,
          debug_items: debug ? intel?.all_items : undefined,
          error: intelPage.status === "rejected" ? String(intelPage.reason) : null } });
    }
    return Response.json({ ok: true, shadow_only: true, dry, date, range: [fromNo, toNo], expected: offerings?.length || 0, results });
  } catch (e) {
    return Response.json({ ok: false, shadow_only: true, error: String((e as Error)?.message || e) }, { status: 500 });
  }
});
