import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const OKOOO = "https://www.okooo.com";
const MIRROR_API = "https://qiulaile.vip/api";

const ALIAS: Record<string, string> = {
  "阿斯顿维拉": "维拉", "阿斯顿维拉队": "维拉", "伍尔弗汉普顿": "狼队",
  "布里斯托尔城": "布城", "布里斯托城": "布城", "南安普敦": "南安普顿",
  "西汉姆": "西汉姆联", "谢菲尔德联": "谢菲联", "朴次茅斯": "朴茨茅斯",
  "赫塔菲": "赫塔费", "巴塞罗那": "巴萨", "女王公园巡游者": "女王巡游",
  "女王公园巡游": "女王巡游", "雷克斯": "雷克瑟姆", "弗洛西诺尼": "弗洛西诺",
  "弗洛西诺内": "弗洛西诺", "奥斯纳布鲁克": "奥斯纳", "町田泽维亚": "町田泽维",
  "TPS土尔库": "TPS图尔", "库普斯": "库奥皮奥", "利雅新月": "利雅得新月",
};

function bjtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function weekday(date: string) {
  const d = new Date(`${date}T12:00:00+08:00`);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getUTCDay()];
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function strip(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/&minus;|&#8722;|−/g, "-").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function canon(value: unknown) {
  const clean = String(value || "").replace(/\s+/g, "").replace(/足球俱乐部|俱乐部|FC$/ig, "");
  return ALIAS[clean] || clean;
}
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
      d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function sameTeam(a: string, b: string) {
  a = canon(a); b = canon(b);
  return a === b || a.includes(b) || b.includes(a) || (Math.min(a.length, b.length) >= 3 && lev(a, b) <= 1);
}
function normDate(value: unknown) {
  const m = String(value || "").match(/(20\d{2})\s*-\s*(\d{2})\s*-\s*(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function odds3(value: unknown) {
  const values = String(value || "").match(/\d+\.\d+/g)?.map(Number) || [];
  return values.length >= 3 ? values.slice(-3) : null;
}
function lineFromRq(value: unknown) {
  const m = String(value || "").match(/主\(([+-]?\d+)\)/);
  return m ? Number(m[1]) : null;
}
function numberCell(value: unknown) {
  const m = String(value ?? "").replace(/,/g, "").replace(/%/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function rowCells(tr: string) {
  return [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => strip(m[1]));
}
function decodeBest(bytes: Uint8Array) {
  const options: Array<{ encoding: string; text: string; score: number }> = [];
  for (const encoding of ["gb18030", "utf-8"]) {
    try {
      const text = new TextDecoder(encoding as "utf-8").decode(bytes);
      const score = (text.match(/竞彩|比赛时间|欧赔|平均|庄家盈亏|交易量比例|伤停|情报/g) || []).length;
      options.push({ encoding, text, score });
    } catch { /* unsupported decoder */ }
  }
  options.sort((a, b) => b.score - a.score);
  return options[0];
}
async function fetchHtml(url: string, referer = `${OKOOO}/jingcai/`) {
  let last: unknown = null;
  for (let attempt = 1; attempt <= 1; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9", referer, "cache-control": "no-cache" },
        signal: AbortSignal.timeout(7000),
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const decoded = decodeBest(bytes);
      return { url, html: decoded.text, encoding: decoded.encoding, bytes: bytes.length };
    } catch (error) {
      last = error;
      if (attempt < 1) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw last;
}
async function fetchJson(url: string) {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/json", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(12000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (error) {
      last = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw last;
}

function parseOkoooRows(html: string, url: string) {
  const out: any[] = [];
  for (const raw of html.split('<div class="touzhu_1"')) {
    const no = raw.match(/<span class="xulie"[^>]*>([0-9]{3})<\/span>/)?.[1];
    if (!no) continue;
    const mid = raw.match(/id="match_([0-9]+)"/)?.[1] || null;
    const kickoff = raw.match(/title="比赛时间:([^"]+)"/)?.[1] || null;
    const lineRaw = raw.match(/data-rq="([^"]+)"/)?.[1];
    const names = [...raw.matchAll(/class="zhum[^"]*"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/div>/g)]
      .map((m) => ({ title: strip(m[1]), text: strip(m[2]) })).filter((x) => x.title || x.text);
    const values = [...raw.matchAll(/class="peilv[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => Number(strip(m[1]))).filter((v) => Number.isFinite(v) && v > 1 && v < 100);
    if (names.length >= 2) {
      const home = names[0], away = names[names.length - 1];
      out.push({ no, mid, kickoff, line: Number.isFinite(Number(lineRaw)) ? Number(lineRaw) : null,
        home: home.title || home.text, away: away.title || away.text,
        homeVariants: [home.title, home.text].filter(Boolean), awayVariants: [away.title, away.text].filter(Boolean),
        values: values.slice(0, 10), url });
    }
  }
  return out;
}
function activeMirrorPool(matches: any[], date: string) {
  const wd = weekday(date), maxDate = addDays(date, 1), byNo = new Map<number, any>();
  for (const m of matches) {
    const display = String(m?.displayNo || "").trim();
    const noMatch = display.match(/(\d{3})$/);
    const day = normDate(m?.dayLabel);
    const hasSp = !!odds3(m?.spfSp) || !!odds3(m?.rqspfSp);
    if (!noMatch || !display.startsWith(`${wd} `) || !day || day < date || day > maxDate || !hasSp) continue;
    const no = Number(noMatch[1]);
    if (!byNo.has(no) || String(m?.id || "") > String(byNo.get(no)?.id || "")) byNo.set(no, m);
  }
  return [...byNo.values()].sort((a, b) => Number(String(a.displayNo).match(/(\d{3})$/)?.[1]) - Number(String(b.displayNo).match(/(\d{3})$/)?.[1]));
}
function matchOkoooRow(mirror: any, rows: any[]) {
  const no = Number(String(mirror.displayNo || "").match(/(\d{3})$/)?.[1]);
  const sameNo = rows.filter((row) => Number(row.no) === no);
  const strict = sameNo.filter((row) =>
    (row.homeVariants || [row.home]).some((v: string) => sameTeam(v, mirror.home)) &&
    (row.awayVariants || [row.away]).some((v: string) => sameTeam(v, mirror.away)));
  if (strict.length === 1) return strict[0];
  const kickoff = `${normDate(mirror.dayLabel)} ${String(mirror.kickoff || "00:00")}`;
  const near = sameNo.filter((row) => row.kickoff && Math.abs(
    new Date(String(row.kickoff).replace(" ", "T") + "+08:00").getTime() -
    new Date(kickoff.replace(" ", "T") + "+08:00").getTime()) <= 10 * 60 * 1000);
  return near.length === 1 ? near[0] : null;
}
function parseEuropeanOdds(html: string) {
  const rows: any[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const cells = rowCells(m[0]);
    if (cells.length < 16 || !/^\d+$/.test(cells[0] || "")) continue;
    const current = [numberCell(cells[5]), numberCell(cells[6]), numberCell(cells[7])];
    if (!cells[1] || !current.every((v) => v !== null && v > 1 && v < 100)) continue;
    rows.push({ company: cells[1], initial: [numberCell(cells[2]), numberCell(cells[3]), numberCell(cells[4])],
      current, probabilities: [numberCell(cells[9]), numberCell(cells[10]), numberCell(cells[11])],
      kelly: [numberCell(cells[12]), numberCell(cells[13]), numberCell(cells[14])], payout: numberCell(cells[15]) });
  }
  const bookmakers = [...new Map(rows.map((row) => [row.company, row])).values()];
  const average = [0, 1, 2].map((i) => bookmakers.length
    ? bookmakers.reduce((sum, row: any) => sum + Number(row.current[i]), 0) / bookmakers.length : null);
  // Only accept original institution percentages, never derive them from SP or odds.
  const verifiedRows = bookmakers.filter((row: any) => Array.isArray(row.probabilities)
    && row.probabilities.length === 3
    && row.probabilities.every((v: any) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100)
    && Math.abs(row.probabilities.reduce((a: number, b: number) => a + b, 0) - 100) <= 1.5);
  const original = verifiedRows.length ? [0, 1, 2].map((i) =>
    verifiedRows.reduce((sum: number, row: any) => sum + row.probabilities[i], 0) / verifiedRows.length) : null;
  return { bookmaker_count: bookmakers.length, probability_bookmaker_count: verifiedRows.length,
    institution_probabilities: original ? { home: original[0], draw: original[1], away: original[2] } : null,
    average: { home: average[0], draw: average[1], away: average[2] }, bookmakers };
}
function parseExchange(html: string) {
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((m) => ({
    html: m[0], rows: [...m[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((row) => rowCells(row[0])),
  }));
  const volume = tables.find((t) => /必发买家挂牌/.test(t.html) && /做单人气比例/.test(t.html));
  const index = tables.find((t) => /交易冷热指数/.test(t.html) && /庄家盈亏指数/.test(t.html));
  const selections: Record<string, any> = { home: {}, draw: {}, away: {} };
  (volume?.rows || []).filter((c) => c.length >= 13 && numberCell(c[5]) !== null).slice(0, 3)
    .forEach((c, i) => Object.assign(selections[i === 0 ? "home" : i === 1 ? "draw" : "away"], {
      label: c[0], price: numberCell(c[5]), volume: numberCell(c[6]), profit_loss: numberCell(c[7]),
    }));
  (index?.rows || []).filter((c) => c.length >= 15 && numberCell(c[1]) !== null).slice(0, 3)
    .forEach((c, i) => Object.assign(selections[i === 0 ? "home" : i === 1 ? "draw" : "away"], {
      average_odds: numberCell(c[1]), average_probability_pct: numberCell(c[2]), share_pct: numberCell(c[3]),
      hot_index: numberCell(c[6]), market_index: numberCell(c[8]), profit_index: numberCell(c[10]),
    }));
  const complete_count = ["home", "draw", "away"].filter((key) =>
    typeof selections[key].volume === "number" && typeof selections[key].share_pct === "number").length;
  return { complete_count, selections };
}
function parseIntel(html: string) {
  const items = [...html.matchAll(/<(?:li|p|dd|div)[^>]*>([\s\S]*?)<\/(?:li|p|dd|div)>/gi)]
    .map((m) => strip(m[1])).filter((t) => t.length >= 8 && t.length <= 280 &&
      /伤|停|缺|出战|复出|有利|不利|主队|客队|近况|状态|阵容|交锋|赛程|体能|战意/.test(t));
  const unique = [...new Set(items)].slice(0, 100);
  return { items: unique, injuries: unique.filter((t) => /伤|停赛|缺阵|出战成疑|复出/.test(t)).slice(0, 40) };
}
function parseTriplet(value: unknown) {
  const parts = String(value ?? "").trim().split(/\s+/);
  if (parts.length < 3) return null;
  const home = Number(parts[0]), away = Number(parts[2]);
  return Number.isFinite(home) && Number.isFinite(away) ? { home, line: parts[1], away } : null;
}
function statusOf(m: any, kickoffIso: string | null) {
  const state = String(m?.state || "").toLowerCase();
  if (/finish|ended|complete|完场/.test(state)) return "finished";
  if (/live|playing|进行/.test(state)) return "live";
  if (kickoffIso && Date.now() >= new Date(kickoffIso).getTime()) return "live";
  return "scheduled";
}
function isSaleOpen(date: string, kickoffIso: string | null) {
  if (!kickoffIso) return false;
  const d = new Date(`${date}T12:00:00+08:00`);
  const weekend = [0, 6].includes(d.getUTCDay());
  const saleCutoff = new Date(`${date}T${weekend ? "23:00" : "22:00"}:00+08:00`).getTime();
  const kickoffCutoff = new Date(kickoffIso).getTime() - 10 * 60 * 1000;
  return Date.now() < Math.min(saleCutoff, kickoffCutoff);
}
function field(field_key: string, source_name: string, payload: any, quality: "verified" | "provisional" | "unavailable" = "verified") {
  return { field_key, source_name, payload, quality, observed_at: new Date().toISOString() };
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      out[index] = await worker(items[index]);
    }
  }));
  return out;
}

Deno.serve(async (req) => {
  const access = await sb.schema("ninety_core").rpc("check_collector_token", {
    p_token: req.headers.get("x-ninety-collector-token") || "",
  });
  if (access.error || access.data !== true) return Response.json({ ok: false, error: "CRON_TOKEN_REQUIRED" }, { status: 403 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || bjtDate();
  const dry = url.searchParams.get("dry") === "1";
  const deep = url.searchParams.get("deep") !== "0";
  const started = Date.now();
  try {
    const [mirrorResult, primaryPage] = await Promise.allSettled([
      fetchJson(`${MIRROR_API}/matches?matchType=0&mode=full`), fetchHtml(`${OKOOO}/jingcai/`),
    ]);
    const allMirror = mirrorResult.status === "fulfilled" && Array.isArray(mirrorResult.value?.matches) ? mirrorResult.value.matches : [];
    let pool = activeMirrorPool(allMirror.filter((m: any) => Number(m?.matchTypeValue) === 0), date);
    let okoooRows: any[] = [];
    const pages: any[] = [];
    if (primaryPage.status === "fulfilled") {
      okoooRows = parseOkoooRows(primaryPage.value.html, primaryPage.value.url);
      pages.push({ url: primaryPage.value.url, bytes: primaryPage.value.bytes, encoding: primaryPage.value.encoding, ok: true, role: "primary" });
    } else pages.push({ ok: false, error: String(primaryPage.reason), role: "primary" });
    if (!okoooRows.length) {
      for (const fallbackUrl of [`${OKOOO}/jingcai/${date}/`, `${OKOOO}/jingcai/shuju/`]) {
        try {
          const page = await fetchHtml(fallbackUrl);
          okoooRows = parseOkoooRows(page.html, page.url);
          pages.push({ url: page.url, bytes: page.bytes, encoding: page.encoding, ok: true, role: "fallback" });
          if (okoooRows.length) break;
        } catch (error) { pages.push({ url: fallbackUrl, ok: false, error: String(error), role: "fallback" }); }
      }
    }
    okoooRows = [...new Map(okoooRows.map((row) => [[row.mid, row.no, row.kickoff, row.home, row.away].join("|"), row])).values()];
    if (mirrorResult.status !== "fulfilled") {
      pages.push({ role: "mirror", ok: false, error: String(mirrorResult.reason) });
      if (!okoooRows.length) throw new Error("both okooo and mirror unavailable");
      const { data: known, error: knownError } = await sb.schema("ninety_core").from("match_pool")
        .select("match_no,league,home_team,away_team,kickoff_at,status")
        .eq("match_date",date).neq("status","invalid_test");
      if (knownError) throw knownError;
      pool = (known || []).filter((m: any) => m.kickoff_at && /^\\d{3}$/.test(String(m.match_no))).map((m: any) => {
        const kickoff = new Date(m.kickoff_at);
        const dayLabel = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit" }).format(kickoff);
        const localTime = new Intl.DateTimeFormat("en-GB", { timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false }).format(kickoff);
        return { displayNo: weekday(date)+" "+m.match_no, dayLabel, kickoff:localTime,
          _knownKickoff:m.kickoff_at,home:m.home_team,away:m.away_team,league:m.league,state:m.status };
      });
      if (!pool.length) throw new Error("mirror unavailable and no confirmed local match identities");
    }

    const prepared = pool.filter((m: any) => !/世界杯/.test(String(m.league || ""))).map((mirror: any) => {
      const no = String(mirror.displayNo).match(/(\d{3})$/)![1];
      const day = normDate(mirror.dayLabel) || date;
      const kickoffIso = mirror._knownKickoff || new Date(`${day}T${String(mirror.kickoff || "00:00")}:00+08:00`).toISOString();
      return { mirror, no, day, kickoffIso, okooo: matchOkoooRow(mirror, okoooRows) };
    });

    const matches = await mapLimit(prepared, 10, async ({ mirror, no, day, kickoffIso, okooo }) => {
      const fields: any[] = [];
      const open = isSaleOpen(date, kickoffIso);
      const hadOkooo = okooo?.values?.length >= 6 ? okooo.values.slice(0, 3) : null;
      const hhadOkooo = okooo?.values?.length >= 6 ? okooo.values.slice(3, 6) : null;
      const hadMirror = odds3(mirror.spfSp), hhadMirror = odds3(mirror.rqspfSp);
      if (open && hadOkooo && hhadOkooo) {
        fields.push(field("official_sp", "okooo", {
          source_match_id: okooo.mid, source_url: okooo.url, identity: "match_no+teams+kickoff",
          had: { home: hadOkooo[0], draw: hadOkooo[1], away: hadOkooo[2] },
          hhad: { line: okooo.line ?? lineFromRq(mirror.rqspfSp), home: hhadOkooo[0], draw: hhadOkooo[1], away: hhadOkooo[2] },
        }));
      } else if (open && (hadMirror || hhadMirror)) {
        fields.push(field("official_sp", "qiulaile_sp_mirror_fallback", {
          source_match_id: String(mirror.id), source_url: `${MIRROR_API}/matches?matchType=0&mode=full`,
          reason: okooo ? "okooo_single_market_ambiguous" : "okooo_identity_missing",
          had: hadMirror ? { home: hadMirror[0], draw: hadMirror[1], away: hadMirror[2] } : null,
          hhad: hhadMirror ? { line: lineFromRq(mirror.rqspfSp), home: hhadMirror[0], draw: hhadMirror[1], away: hhadMirror[2] } : null,
        }, "provisional"));
      }

      const detailStatus: Record<string, string> = {};
      if (open && okooo?.mid) {
        const base = `${OKOOO}/soccer/match/${okooo.mid}`;
        const [oddsShell, exchangePage, intelPage] = await Promise.allSettled([
          deep ? fetchHtml(`${base}/odds/`, `${base}/`) : Promise.reject(new Error("deep_disabled")),
          fetchHtml(`${base}/exchanges/`, `${base}/`),
          deep ? fetchHtml(`${base}/qingbao/`, `${base}/`) : Promise.reject(new Error("deep_disabled")),
        ]);
        if (oddsShell.status === "fulfilled") {
          let oddsPage: any = oddsShell.value;
          try { oddsPage = await fetchHtml(`${base}/odds/ajax/?page=0&all=1&companytype=BaijiaBooks&type=1`, oddsShell.value.url); } catch { /* shell/mobile fallback below */ }
          let euro = parseEuropeanOdds(oddsPage.html);
          if (!euro.bookmaker_count) {
            try { const mobile = await fetchHtml(`https://m.okooo.com/soccer/match/${okooo.mid}/odds/`, oddsShell.value.url); euro = parseEuropeanOdds(mobile.html); oddsPage = mobile; } catch { /* retain empty */ }
          }
          detailStatus.ft_odds = euro.bookmaker_count ? "verified" : "parse_empty";
          if (euro.bookmaker_count) fields.push(field("ft_odds", "okooo", {
            source_match_id: okooo.mid, source_url: oddsPage.url, charset: oddsPage.encoding,
            bookmaker_count: euro.bookmaker_count, probability_bookmaker_count: euro.probability_bookmaker_count, institution_probabilities: euro.institution_probabilities, average: euro.average, bookmakers: euro.bookmakers,
          }));
        } else detailStatus.ft_odds = "fetch_error";
        if (exchangePage.status === "fulfilled") {
          const exchange = parseExchange(exchangePage.value.html);
          detailStatus.betfair = exchange.complete_count === 3 ? "verified" : exchange.complete_count ? "partial" : "parse_empty";
          if (exchange.complete_count) fields.push(field("betfair", "okooo", {
            source_match_id: okooo.mid, source_url: exchangePage.value.url, ...exchange,
          }, exchange.complete_count === 3 ? "verified" : "provisional"));
        } else detailStatus.betfair = "fetch_error";
        if (intelPage.status === "fulfilled") {
          const intel = parseIntel(intelPage.value.html);
          detailStatus.intel = intel.items.length ? "verified" : "parse_empty";
          if (intel.items.length) {
            fields.push(field("team_form", "okooo", { source_match_id: okooo.mid, source_url: intelPage.value.url, items: intel.items }));
            if (intel.injuries.length) fields.push(field("injuries", "okooo", {
              source_match_id: okooo.mid, source_url: intelPage.value.url, items: intel.injuries,
            }));
          }
        } else detailStatus.intel = "fetch_error";
      }

      if (open && mirror.id) {
        try {
          const market = await fetchJson(`${MIRROR_API}/match/odds?matchId=${encodeURIComponent(String(mirror.id))}&matchType=1&home=${encodeURIComponent(mirror.home)}&away=${encodeURIComponent(mirror.away)}`);
          const lines = Array.isArray(market?.lines) ? market.lines : [];
          const asian = lines.filter((x: any) => /亚赔|亚洲/.test(String(x.market || ""))).map((x: any) => ({
            company: x.company, company_id: x.companyId ?? null, initial: parseTriplet(x.initial), current: parseTriplet(x.primary), time: x.time ?? null,
          })).filter((x: any) => x.initial || x.current);
          const european = lines.filter((x: any) => /欧赔|欧盘|胜平负/.test(String(x.market || ""))).map((x: any) => ({
            company: x.company, company_id: x.companyId ?? null, initial: parseTriplet(x.initial), current: parseTriplet(x.primary), time: x.time ?? null,
          })).filter((x: any) => x.initial || x.current);
          if (!fields.some((x) => x.field_key === "ft_odds") && european.length) {
            fields.push(field("ft_odds", "qiulaile_european_fallback", {
              source_match_id: String(mirror.id), source_url: `${MIRROR_API}/match/odds`,
              reason: "okooo_european_unavailable_or_parse_empty", institutions: european.slice(0, 40),
            }, "provisional"));
            detailStatus.ft_odds = "provisional_fallback";
          }
          if (asian.length) fields.push(field("asian_handicap", "qiulaile_asian_fallback", {
            source_match_id: String(mirror.id), source_url: `${MIRROR_API}/match/odds`, reason: "okooo_asian_not_publicly_parseable",
            institutions: asian.slice(0, 30),
          }, "provisional"));
          const totals = lines.filter((x: any) => /大小|总进球|进球数|over|under/i.test(String(x.market || ""))).slice(0, 30);
          if (totals.length) fields.push(field("over_under", "qiulaile_totals_fallback", {
            source_match_id: String(mirror.id), source_url: `${MIRROR_API}/match/odds`, lines: totals,
          }, "provisional"));
          detailStatus.asian_handicap = asian.length ? "provisional" : "missing";
          detailStatus.over_under = totals.length ? "provisional" : "missing";
        } catch {
          detailStatus.asian_handicap = "fetch_error";
          detailStatus.over_under = "fetch_error";
        }
      }

      const status = statusOf(mirror, kickoffIso);
      if (status === "finished") {
        const homeScore = numberCell(mirror.homeScore ?? mirror.home_score ?? mirror.scoreHome);
        const awayScore = numberCell(mirror.awayScore ?? mirror.away_score ?? mirror.scoreAway);
        if (homeScore !== null && awayScore !== null) fields.push(field("result", "qiulaile_result_fallback", {
          source_match_id: String(mirror.id), home_score: homeScore, away_score: awayScore, raw_state: mirror.state,
        }, "provisional"));
      }

      return {
        match_key: `${date.replaceAll("-", "")}-${no}`, match_date: date, match_no: no,
        league: String(mirror.league || "未确认"), home_team: canon(mirror.home), away_team: canon(mirror.away),
        kickoff_at: kickoffIso, status, fields,
        _diagnostic: { okooo_identity: !!okooo, source_match_id: okooo?.mid || null, sale_open: open,
          field_keys: fields.map((x) => x.field_key), detail_status: detailStatus },
      };
    });

    const payloadMatches = matches.map(({ _diagnostic, ...match }) => match);
    let ingest: any = { dry: true };
    if (!dry) {
      const { data, error } = await sb.rpc("ninety_ingest_batch", { p_payload: {
        source_name: "okooo_primary_collector_v1", observed_at: new Date().toISOString(), matches: payloadMatches,
      } });
      if (error) throw error;
      ingest = data;
    }
    const diagnostics = matches.map((m) => ({ match_no: m.match_no, home: m.home_team, away: m.away_team,
      kickoff_at: m.kickoff_at, ...m._diagnostic }));
    const coverage: Record<string, number> = {};
    for (const match of matches) for (const key of new Set(match.fields.map((x: any) => x.field_key))) coverage[key] = (coverage[key] || 0) + 1;
    return Response.json({ ok: true, dry, deep, date, source: "okooo_primary+on_demand_fallbacks", pool_matches: matches.length,
      okooo_list_rows: okoooRows.length, pages, coverage, ingest, diagnostics, duration_ms: Date.now() - started });
  } catch (error) {
    console.error("NINETY_OKOOO_COLLECTOR_FAILED", error);
    const errorText = String((error as Error)?.message || error);
    try {
      await sb.schema("ninety_core").from("ingest_runs").insert({
        source_name: "okooo_primary_collector_v1", status: "failed",
        started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(),
        summary: { date, error: errorText.slice(0, 1000), duration_ms: Date.now() - started },
      });
    } catch (logError) { console.error("NINETY_COLLECTOR_FAILURE_LOG_FAILED", logError); }
    return Response.json({ ok: false, date, error: errorText, duration_ms: Date.now() - started }, { status: 500 });
  }
});
