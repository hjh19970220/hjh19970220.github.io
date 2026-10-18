import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const REVISION = "singapore_ft_okooo_v2";
const DIR = ["home", "draw", "away"] as const;
const DIR_ZH: Record<string, string> = { home: "主胜", draw: "平局", away: "客胜" };

function bjtDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function n(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}
function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}
function normalizedFromOdds(values: Array<number | null>) {
  if (values.some((x) => x === null || x <= 1)) return null;
  const inverse = values.map((x) => 1 / Number(x));
  const sum = inverse.reduce((a, b) => a + b, 0);
  return inverse.map((x) => x / sum);
}
function rank(values: number[], labels: string[]) {
  return values.map((probability, i) => ({ direction: labels[i], probability }))
    .sort((a, b) => b.probability - a.probability);
}
function poisson(lambda: number, k: number) {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}
function scoreDistribution(homeLambda: number, awayLambda: number, maxGoals = 7) {
  const rows: Array<{ home: number; away: number; probability: number }> = [];
  let sum = 0;
  for (let h = 0; h <= maxGoals; h++) for (let a = 0; a <= maxGoals; a++) {
    const probability = poisson(homeLambda, h) * poisson(awayLambda, a);
    rows.push({ home: h, away: a, probability }); sum += probability;
  }
  return rows.map((x) => ({ ...x, probability: x.probability / sum }));
}
function outcomeFromScores(rows: Array<{ home: number; away: number; probability: number }>) {
  const out = { home: 0, draw: 0, away: 0 };
  for (const row of rows) out[row.home > row.away ? "home" : row.home === row.away ? "draw" : "away"] += row.probability;
  return out;
}
function median(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
function totalsLine(payload: any) {
  const values: number[] = [];
  for (const line of Array.isArray(payload?.lines) ? payload.lines : []) {
    const tokens = String(line?.primary || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (tokens.length >= 3 && tokens[1] >= 1.5 && tokens[1] <= 5.5) values.push(tokens[1]);
  }
  return median(values);
}
function betfairDirections(payload: any) {
  const selections = payload?.selections || {};
  const shares = DIR.map((key) => n(selections?.[key]?.share_pct));
  const averages = DIR.map((key) => n(selections?.[key]?.average_odds));
  if (shares.some((x) => x === null) || averages.some((x) => x === null)) return null;
  const fund = DIR.map((direction, i) => ({ direction, value: Number(shares[i]) })).sort((a, b) => b.value - a.value);
  const institution = DIR.map((direction, i) => ({ direction, value: Number(averages[i]) })).sort((a, b) => a.value - b.value);
  return { fund, institution, selections };
}
function output(module: string, payload: any, quality: "provisional" | "pass" = "provisional") {
  return { module, revision: REVISION, payload: { ...payload, shadow: true, revision: REVISION }, quality };
}

function computeMatch(match: any) {
  const fields = match?.fields || {};
  const official = fields?.official_sp?.payload || null;
  // FT: prefer independently verified original institutional percentages; otherwise use verified Okooo SP.
  const marketField = fields?.ft_odds;
  const rawInstitution = marketField?.quality === "verified" && marketField?.source_name === "okooo"
    ? marketField?.payload?.institution_probabilities : null;
  const rawTriplet = rawInstitution ? [n(rawInstitution.home), n(rawInstitution.draw), n(rawInstitution.away)] : null;
  const rawValid = rawTriplet && rawTriplet.every((v) => v !== null && v >= 0 && v <= 100)
    && Math.abs(rawTriplet.reduce((a, b) => a + Number(b), 0) - 100) <= 1;
  const officialVerified = fields?.official_sp?.quality === "verified" &&
    ["okooo", "okooo_mirror"].includes(fields?.official_sp?.source_name);
  const spProb = officialVerified ? normalizedFromOdds([
    n(official?.had?.home), n(official?.had?.draw), n(official?.had?.away),
  ]) : null;
  const ftProb = rawValid ? rawTriplet!.map((v) => Number(v) / rawTriplet!.reduce((a, b) => a + Number(b), 0)) : spProb;
  const ftMethod = rawValid ? "okooo_verified_institution_percentages" : "okooo_verified_sp_normalized";
  const ftSource = rawValid ? "okooo_institution" : (officialVerified ? fields?.official_sp?.source_name : null);
  const handicapProb = official ? normalizedFromOdds([
    n(official?.hhad?.home), n(official?.hhad?.draw), n(official?.hhad?.away),
  ]) : null;
  const outputs: any[] = [];

  if (ftProb) {
    const ranking = rank(ftProb, ["主胜", "平局", "客胜"]);
    outputs.push(output("ft", { status: "READY", method: ftMethod, source: ftSource, probability_kind: rawValid ? "institution_original" : "odds_implied",
      probabilities: { home: ftProb[0], draw: ftProb[1], away: ftProb[2] }, top3: ranking,
      top1: ranking[0], top2: ranking.slice(0, 2) }));
  } else outputs.push(output("ft", { status: "PASS", reason: "official_sp_missing_or_frozen" }, "pass"));

  if (handicapProb) {
    const ranking = rank(handicapProb, ["让胜", "让平", "让负"]);
    outputs.push(output("handicap", { status: "READY", method: "official_hhad_sp_implied_probability",
      handicap_line: official?.hhad?.line ?? null,
      probabilities: { home: handicapProb[0], draw: handicapProb[1], away: handicapProb[2] },
      top3: ranking, top1: ranking[0], top2: ranking.slice(0, 2) }));
  } else outputs.push(output("handicap", { status: "PASS", reason: "official_hhad_missing_or_frozen" }, "pass"));

  const goalLine = totalsLine(fields?.over_under?.payload);
  if (ftProb && goalLine !== null) {
    const totalLambda = clamp(goalLine, 1.5, 4.5);
    const homeRatio = clamp(0.5 + 0.45 * (ftProb[0] - ftProb[2]), 0.2, 0.8);
    const homeLambda = totalLambda * homeRatio, awayLambda = totalLambda - homeLambda;
    const scores = scoreDistribution(homeLambda, awayLambda);
    const scoreTop = [...scores].sort((a, b) => b.probability - a.probability).slice(0, 3)
      .map((x) => ({ score: `${x.home}-${x.away}`, probability: x.probability }));
    outputs.push(output("score_top3", { status: "READY", method: "market_total_poisson_shadow",
      inputs: { total_line: goalLine, home_lambda: homeLambda, away_lambda: awayLambda }, top3: scoreTop }));

    const totals = new Map<number, number>();
    for (const row of scores) totals.set(row.home + row.away, (totals.get(row.home + row.away) || 0) + row.probability);
    const totalTop = [...totals.entries()].map(([goals, probability]) => ({ goals, probability }))
      .sort((a, b) => b.probability - a.probability).slice(0, 3);
    outputs.push(output("total_goals", { status: "READY", method: "market_total_poisson_shadow",
      inputs: { total_line: goalLine }, top3: totalTop, top1: totalTop[0] }));

    const halfOutcome = outcomeFromScores(scoreDistribution(homeLambda * 0.45, awayLambda * 0.45, 5));
    const half = DIR.map((direction) => ({ direction, probability: halfOutcome[direction] }));
    const combos: Array<{ combination: string; probability: number }> = [];
    for (const h of half) for (let i = 0; i < DIR.length; i++) combos.push({
      combination: `${DIR_ZH[h.direction]}/${DIR_ZH[DIR[i]]}`, probability: h.probability * ftProb[i],
    });
    const comboSum = combos.reduce((sum, x) => sum + x.probability, 0);
    const htftTop = combos.map((x) => ({ ...x, probability: x.probability / comboSum }))
      .sort((a, b) => b.probability - a.probability).slice(0, 3);
    outputs.push(output("htft_top3", { status: "READY", method: "halftime_poisson_x_fulltime_market_shadow",
      top3: htftTop }));
  } else {
    outputs.push(output("score_top3", { status: "PASS", reason: "goal_line_or_ft_probability_missing" }, "pass"));
    outputs.push(output("total_goals", { status: "PASS", reason: "goal_line_or_ft_probability_missing" }, "pass"));
    outputs.push(output("htft_top3", { status: "PASS", reason: "goal_line_or_ft_probability_missing" }, "pass"));
  }

  const market = betfairDirections(fields?.betfair?.payload);
  let upset: any = { status: "PASS", triggered: false, reason: "verified_three_way_market_missing" };
  let daily: any = { status: "PASS", reason: "entry_conditions_not_met" };
  if (ftProb && market) {
    const ftRank = DIR.map((direction, i) => ({ direction, probability: ftProb[i] })).sort((a, b) => b.probability - a.probability);
    const ftTop = ftRank[0], fundTop = market.fund[0], institutionTop = market.institution[0];
    const fundGap = fundTop.value - market.fund[1].value;
    const drawShare = Number(market.selections?.draw?.share_pct || 0);
    const strongReverse = fundTop.direction !== ftTop.direction && fundTop.value >= 40 && fundGap >= 8;
    const drawHot = drawShare >= 35 && ftTop.direction !== "draw";
    if (strongReverse || drawHot) {
      const pressure = drawHot ? "draw" : fundTop.direction;
      const direction = ftTop.direction === "home" ? "主队不胜" : ftTop.direction === "away" ? "主队不败" : null;
      if (direction) upset = { status: "TRIGGERED", triggered: true, channel: strongReverse ? "A" : "C",
        direction, reason: strongReverse ? "verified_betfair_strong_reverse" : "verified_draw_funds_overheated",
        evidence: { ft_top1: ftTop, fund_top1: fundTop, fund_gap: fundGap, draw_share: drawShare, pressure } };
    } else upset = { status: "PASS", triggered: false, reason: "no_verified_reverse_signal",
      evidence: { ft_top1: ftTop, institution_direction: institutionTop.direction, fund_direction: fundTop.direction } };

    const aligned = ftTop.direction === institutionTop.direction && ftTop.direction === fundTop.direction;
    if (!upset.triggered && !match.upset_locked && aligned && ftTop.probability >= 0.55) {
      daily = { status: "SELECTED", tier: ftTop.probability >= 0.60 ? "稳健" : "激进",
        direction: DIR_ZH[ftTop.direction], probability: ftTop.probability,
        evidence: { ft: ftTop.direction, institution: institutionTop.direction, funds: fundTop.direction } };
    } else daily = { status: "PASS", reason: upset.triggered || match.upset_locked ? "upset_warning_hard_exclusion" :
      !aligned ? "three_way_alignment_failed" : "top1_below_55_percent" };
  }
  outputs.push(output("upset_warning", upset, upset.triggered ? "provisional" : "pass"));
  outputs.push(output("daily_selection", daily, daily.status === "SELECTED" ? "provisional" : "pass"));
  return { match_key: match.match_key, outputs };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || bjtDate();
  const dry = url.searchParams.get("dry") === "1";
  try {
    const { data: input, error: inputError } = await sb.rpc("ninety_engine_inputs", { p_date: date });
    if (inputError) throw inputError;
    const matches = Array.isArray(input?.matches) ? input.matches.map(computeMatch) : [];
    let publish: any = { dry: true };
    if (!dry) {
      const { data, error } = await sb.rpc("ninety_publish_modules", { p_payload: { date, matches } });
      if (error) throw error;
      publish = data;
    }
    const summary: Record<string, any> = {};
    for (const module of ["ft", "handicap", "score_top3", "htft_top3", "total_goals", "upset_warning", "daily_selection"]) {
      const rows = matches.map((m: any) => m.outputs.find((x: any) => x.module === module)).filter(Boolean);
      summary[module] = { outputs: rows.length, ready: rows.filter((x: any) => !["PASS"].includes(x.payload.status)).length,
        pass: rows.filter((x: any) => x.payload.status === "PASS").length };
    }
    return Response.json({ ok: true, dry, date, shadow: true, matches: matches.length, summary, publish,
      previews: matches.slice(0, 5).map((m: any) => ({ match_key: m.match_key,
        ft: m.outputs.find((x: any) => x.module === "ft")?.payload,
        upset: m.outputs.find((x: any) => x.module === "upset_warning")?.payload,
        daily: m.outputs.find((x: any) => x.module === "daily_selection")?.payload })) });
  } catch (error) {
    console.error("NINETY_MODULE_ENGINE_FAILED", error);
    return Response.json({ ok: false, date, error: String((error as Error)?.message || error) }, { status: 500 });
  }
});
