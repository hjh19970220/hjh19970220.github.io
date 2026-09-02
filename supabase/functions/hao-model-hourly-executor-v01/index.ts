import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AnyRow = Record<string, any>;
type Prob = { home: number; draw: number; away: number };
const SOURCE_PROVENANCE = 'William + Asia4 + JC SP (Okooo primary, 500 verified fallback, qiulaile gap-fill only) + Jiebao/Sina Xiaopao intelligence audit + FotMob xG + live Elo + professional prediction + Teacher Second Review';

async function authorized(req: Request) {
  const supplied = req.headers.get('x-hao-internal-key') || '';
  const { data, error } = await sb.from('hao_internal_secrets_v01')
    .select('secret_value').eq('secret_name', 'cron_internal_v01').maybeSingle();
  return !error && !!data?.secret_value && supplied === data.secret_value;
}

const n = (v: any) => v == null || v === '' ? null : Number(v);
const validOdds = (row: AnyRow | null, keys: string[]) => !!row && keys.every((k) => Number(row[k]) > 1);
const iso = (v: any) => v ? new Date(v).toISOString() : null;
const pad = (v: any, len = 3) => String(v).padStart(len, '0');

function devig(home: any, draw: any, away: any): Prob | null {
  const h = Number(home), d = Number(draw), a = Number(away);
  if (!(h > 1 && d > 1 && a > 1)) return null;
  const ih = 1 / h, id = 1 / d, ia = 1 / a, total = ih + id + ia;
  return { home: ih / total, draw: id / total, away: ia / total };
}

function ordered(p: Prob) {
  return ([['主胜', p.home], ['平', p.draw], ['客胜', p.away]] as [string, number][])
    .sort((a, b) => b[1] - a[1]);
}

function riskLight(value: number) {
  if (value >= 0.50) return '红';
  if (value >= 0.40) return '黄';
  return '绿';
}

function tailLight(absProb: number, tailShare: number) {
  if (absProb >= 0.25 && tailShare >= 0.60) return '红';
  if (absProb >= 0.20 && tailShare >= 0.50) return '黄';
  return '绿';
}

function confidence(p: number, gap: number) {
  if (p >= 0.65 && gap >= 0.25) return '高';
  if (p >= 0.58 && gap >= 0.15) return '中高';
  if (p >= 0.50 && gap >= 0.08) return '中';
  return '低';
}

function parseAh(line: any) {
  if (line == null) return null;
  const raw = String(line).trim().replace(/−/g, '-').replace(/\+/g, '');
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const nums = raw.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const sign = raw.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(nums[0]) + Math.abs(nums[1])) / 2;
}

function median(values: number[]) {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function chooseLatest(rows: AnyRow[], filter: (row: AnyRow) => boolean) {
  return rows.filter(filter).sort((a, b) => new Date(b.fetched_at || b.captured_at || 0).getTime() - new Date(a.fetched_at || a.captured_at || 0).getTime())[0] || null;
}

function chooseSp(rows: AnyRow[], offeringId: number, marketType: string) {
  const priority: Record<string, number> = { okooo_sp_mirror: 1, '500_sp_mirror': 2, qiulaile_sp_mirror: 3 };
  return rows.filter((r) => Number(r.offering_id) === offeringId && String(r.market_type).toUpperCase() === marketType && validOdds(r, ['home_sp', 'draw_sp', 'away_sp']))
    .sort((a, b) => (priority[a.source_code] || 99) - (priority[b.source_code] || 99) || new Date(b.fetched_at || 0).getTime() - new Date(a.fetched_at || 0).getTime())[0] || null;
}

function factorial(k: number) {
  let x = 1;
  for (let i = 2; i <= k; i++) x *= i;
  return x;
}

function pois(k: number, lambda: number) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function poissonHandicap(base: AnyRow | null, handicap: number | null) {
  if (!base || handicap == null || Number(base.home_hist_n) < 3 || Number(base.away_hist_n) < 3 || !(Number(base.lg_avg) > 0)) return null;
  const hxgf = Number(base.home_xgf3), hxga = Number(base.home_xga3), axgf = Number(base.away_xgf3), axga = Number(base.away_xga3), lg = Number(base.lg_avg);
  if (![hxgf, hxga, axgf, axga, lg].every((x) => Number.isFinite(x) && x >= 0)) return null;
  // Existing v42/v40 frozen shrinkage formula recovered from the audited run artifacts.
  const lambdaHome = 0.7 * Math.sqrt(hxgf * axga) + 0.3 * lg;
  const lambdaAway = 0.7 * Math.sqrt(axgf * hxga) + 0.3 * lg;
  let home = 0, draw = 0, away = 0, total = 0;
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) {
    const p = pois(h, lambdaHome) * pois(a, lambdaAway);
    total += p;
    const adjusted = h - a + handicap;
    if (adjusted > 0) home += p;
    else if (adjusted === 0) draw += p;
    else away += p;
  }
  if (!(total > 0)) return null;
  const probs = { home: home / total, draw: draw / total, away: away / total };
  const top = ordered(probs)[0];
  return { lambda_home: lambdaHome, lambda_away: lambdaAway, probs, top1: top[0].replace('主胜', '让胜').replace('平', '让平').replace('客胜', '让负'), top1_prob: top[1], base };
}

function hhadLabel(label: string) {
  return label.replace('主胜', '让胜').replace('平', '让平').replace('客胜', '让负');
}

function teacherAgreement(pick: any, top1: string | null) {
  const s = String(pick || '').trim();
  if (!s || /未确认|无明确|NONE|不覆盖/.test(s) || !top1) return 'NONE';
  return s.includes(top1) ? 'SAME' : 'DIFFERENT';
}

function teacherState(row: AnyRow | null, top1: string | null) {
  if (!row || !top1) return { action: 'NO_ACTION', adjustment: 0, score: 0, agreements: { b: 'NONE', c: 'NONE', g: 'NONE' } };
  const agreements = {
    b: teacherAgreement(row.teacher_b_had, top1),
    c: teacherAgreement(row.teacher_c_had, top1),
    g: teacherAgreement(row.teacher_g_had, top1),
  };
  const score = (agreements.b === 'SAME' ? .35 : agreements.b === 'DIFFERENT' ? -.35 : 0)
    + (agreements.c === 'SAME' ? .20 : agreements.c === 'DIFFERENT' ? -.20 : 0)
    + (agreements.g === 'SAME' ? .45 : agreements.g === 'DIFFERENT' ? -.45 : 0);
  const action = score >= .20 ? 'SUPPORT' : score <= -.55 ? 'STRONG_CONFLICT' : score <= -.20 ? 'REVIEW' : 'NO_ACTION';
  const adjustment = action === 'SUPPORT' ? 4 : action === 'REVIEW' ? -6 : action === 'STRONG_CONFLICT' ? -10 : 0;
  return { action, adjustment, score, agreements };
}

function comboHighCorrelation(a: AnyRow, b: AnyRow) {
  return a.league === b.league && a.top1 === b.top1 && Number(a.deep_abs) >= 1 && Number(b.deep_abs) >= 1;
}

function combinations<T>(items: T[], size: number) {
  const out: T[][] = [];
  const walk = (start: number, chosen: T[]) => {
    if (chosen.length === size) { out.push([...chosen]); return; }
    for (let i = start; i < items.length; i++) walk(i + 1, [...chosen, items[i]]);
  };
  walk(0, []);
  return out;
}

function recommendations(candidates: AnyRow[]) {
  const pairs = combinations(candidates, 2).filter(([a, b]) => !comboHighCorrelation(a, b));
  const triples = combinations(candidates, 3).filter((xs) => !xs.some((a, i) => xs.slice(i + 1).some((b) => comboHighCorrelation(a, b))));
  const card = (xs: AnyRow[], objective: 'prob' | 'ev') => {
    if (!xs.length) return null;
    const p = xs.reduce((v, x) => v * x.p_final, 1);
    const odds = xs.reduce((v, x) => v * x.sp, 1);
    return { status: 'READY', legs: xs.map((x) => ({ match_no: x.match_no, pick: x.top1, p_final: x.p_final, sp: x.sp })), joint_probability: p, combo_odds: odds, ev: p * odds - 1, objective };
  };
  const bestA = pairs.sort((x, y) => y.reduce((v, z) => v * z.p_final, 1) - x.reduce((v, z) => v * z.p_final, 1) || Math.min(...y.map((z) => z.p_final)) - Math.min(...x.map((z) => z.p_final)))[0];
  const bestB = pairs.sort((x, y) => y.reduce((v, z) => v * z.p_final * z.sp, 1) - x.reduce((v, z) => v * z.p_final * z.sp, 1))[0];
  const bestC = triples.sort((x, y) => y.reduce((v, z) => v * z.p_final * z.sp, 1) - x.reduce((v, z) => v * z.p_final * z.sp, 1))[0];
  return {
    A: bestA ? card(bestA, 'prob') : { status: 'PASS', reason: '不足2条正式HAD Anchor腿' },
    B: bestB ? card(bestB, 'ev') : { status: 'PASS', reason: '不足2条可计算EV的正式HAD腿' },
    C: bestC ? card(bestC, 'ev') : { status: 'PASS', reason: '不足3条通过相关性审计的正式HAD腿' },
  };
}

Deno.serve(async (req: Request) => {
  if (!(await authorized(req))) return Response.json({ ok: false, error: 'UNAUTHORIZED_INTERNAL_CALL' }, { status: 401 });
  const freeze = new Date();
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  try {
    let saleDate = url.searchParams.get('date');
    if (!saleDate) {
      const { data: health } = await sb.from('hao_source_health_v01').select('latest_pool_date')
        .eq('source_code', 'jc_pool_discovery').maybeSingle();
      saleDate = health?.latest_pool_date || null;
    }
    if (!saleDate) throw new Error('CURRENT_SALE_DATE_UNCONFIRMED');

    const [modelQ, offeringQ, williamQ, asiaQ, spQ, teacherQ, intelQ, eloQ, proQ, poissonBaseQ, mapQ] = await Promise.all([
      sb.from('hao_model_registry').select('id,model_name,model_version,revision_tag,status').eq('model_name', '豪竞2.3').eq('status', 'active').single(),
      sb.from('jc_offerings_2026').select('id,offer_date,match_code,weekday_text,match_no,league,home_team,away_team,kickoff_local,cutoff_local,handicap_line').eq('offer_date', saleDate).eq('is_world_cup', false).order('match_no'),
      sb.from('hao_market_raw_william_v01').select('*').eq('pool_date', saleDate).lte('fetched_at', freeze.toISOString()),
      sb.from('hao_market_raw_asia4_v01').select('*').eq('pool_date', saleDate).lte('fetched_at', freeze.toISOString()),
      sb.from('hao_jc_sp_mirror_raw_v01').select('*').eq('pool_date', saleDate).lte('fetched_at', freeze.toISOString()),
      sb.from('hao_teacher_live_v01').select('*').eq('offer_date', saleDate),
      sb.from('hao_match_intelligence_v01').select('*').eq('pool_date', saleDate).lte('fetched_at', freeze.toISOString()),
      sb.from('hao_elo_live_v01').select('*').eq('offer_date', saleDate),
      sb.from('hao_professional_predictions_live_v01').select('*').eq('offer_date', saleDate).lte('fetched_at', freeze.toISOString()),
      sb.from('hao_fotmob_mid_poisson_base_v01').select('*').eq('offer_date', saleDate).lte('created_at', freeze.toISOString()),
      sb.from('hao_market_match_map_v01').select('*').eq('source_code', 'jiebao'),
    ]);
    const errors = [modelQ, offeringQ, williamQ, asiaQ, spQ, teacherQ, intelQ, eloQ, proQ, poissonBaseQ, mapQ].map((x: any) => x.error).filter(Boolean);
    if (errors.length) throw new Error(errors.map((x: any) => x.message).join(' | '));
    const model = modelQ.data;
    const offerings = offeringQ.data || [];
    if (!offerings.length) throw new Error(`EMPTY_JC_SALE_POOL:${saleDate}`);

    const details: AnyRow[] = [];
    const formalCandidates: AnyRow[] = [];
    for (const o of offerings) {
      const williamRows = (williamQ.data || []).filter((x: AnyRow) => Number(x.offering_id) === Number(o.id) && validOdds(x, ['odds_home', 'odds_draw', 'odds_away']));
      const williamCurrent = chooseLatest(williamRows, (x) => String(x.snapshot_type || '').toLowerCase() === 'current') || chooseLatest(williamRows, () => true);
      const williamOpening = chooseLatest(williamRows, (x) => String(x.snapshot_type || '').toLowerCase() === 'initial') || williamRows.sort((a: AnyRow, b: AnyRow) => new Date(a.captured_at || a.fetched_at || 0).getTime() - new Date(b.captured_at || b.fetched_at || 0).getTime())[0] || null;
      const pRaw = williamCurrent ? devig(williamCurrent.odds_home, williamCurrent.odds_draw, williamCurrent.odds_away) : null;
      const asiaLatest: AnyRow[] = [];
      for (const code of new Set((asiaQ.data || []).filter((x: AnyRow) => Number(x.offering_id) === Number(o.id)).map((x: AnyRow) => x.institution_code))) {
        const row = chooseLatest(asiaQ.data || [], (x) => Number(x.offering_id) === Number(o.id) && x.institution_code === code && String(x.snapshot_type || '').toLowerCase() === 'current')
          || chooseLatest(asiaQ.data || [], (x) => Number(x.offering_id) === Number(o.id) && x.institution_code === code);
        if (row) asiaLatest.push(row);
      }
      const ahValues = asiaLatest.map((x) => parseAh(x.handicap_line)).filter((x): x is number => x != null);
      const deepAbs = median(ahValues.map(Math.abs));
      const had = chooseSp(spQ.data || [], Number(o.id), 'HAD');
      const hhad = chooseSp(spQ.data || [], Number(o.id), 'HHAD');
      const hadProb = had ? devig(had.home_sp, had.draw_sp, had.away_sp) : null;
      const hhadProb = hhad ? devig(hhad.home_sp, hhad.draw_sp, hhad.away_sp) : null;
      const intel = (intelQ.data || []).filter((x: AnyRow) => Number(x.offering_id) === Number(o.id));
      const teacher = chooseLatest(teacherQ.data || [], (x) => Number(x.offering_id) === Number(o.id));
      const elo = chooseLatest(eloQ.data || [], (x) => Number(x.offering_id) === Number(o.id));
      const professional = (proQ.data || []).filter((x: AnyRow) => Number(x.offering_id) === Number(o.id));
      const poissonBase = chooseLatest(poissonBaseQ.data || [], (x) => Number(x.offering_id) === Number(o.id));
      const handicap = n(o.handicap_line);
      const poisson = poissonHandicap(poissonBase, handicap);
      const jiebaoMap = (mapQ.data || []).find((x: AnyRow) => Number(x.offering_id) === Number(o.id) && x.mapping_status === 'verified') || null;

      let top1: string | null = null, secondPick: string | null = null, top1Prob: number | null = null, gap: number | null = null;
      let hur = '未确认', dtr = '未确认', dlr = '未确认', conf = '未确认', baseLight = 'UNAVAILABLE';
      if (pRaw) {
        const order = ordered(pRaw);
        [top1, top1Prob] = order[0]; secondPick = order[1][0]; gap = order[0][1] - order[1][1];
        const tail = 1 - top1Prob;
        hur = riskLight(tail);
        if (top1 === '平') { dtr = 'NA'; dlr = 'NA'; baseLight = 'YELLOW'; }
        else {
          const opposite = top1 === '主胜' ? pRaw.away : pRaw.home;
          dtr = tailLight(pRaw.draw, pRaw.draw / tail);
          dlr = tailLight(opposite, opposite / tail);
          baseLight = [hur, dtr, dlr].includes('红') ? 'RED' : [hur, dtr, dlr].includes('黄') ? 'YELLOW' : 'GREEN';
        }
        conf = confidence(top1Prob, gap!);
      }

      const hadTop = hadProb ? ordered(hadProb)[0][0] : null;
      const hadIdentityAligned = !!top1 && !!hadTop && top1 === hadTop;
      const dq = pRaw && asiaLatest.length >= 4 && had && hhad ? 'DQ-A' : pRaw && asiaLatest.length >= 3 && had ? 'DQ-B' : 'DQ-C';
      const nonRiskQuality = !!pRaw && ['DQ-A', 'DQ-B'].includes(dq) && !!top1 && top1 !== '平' && Number(top1Prob) >= .58 && Number(gap) >= .15 && asiaLatest.length >= 3 && Number(deepAbs) >= 1 && !!had && hadIdentityAligned;
      const teacherAudit = teacherState(teacher, top1);
      const eloSame = !!elo && ((top1 === '主胜' && Number(elo.elo_diff) > 0) || (top1 === '客胜' && Number(elo.elo_diff) < 0));
      const proDirectional = professional.filter((x: AnyRow) => ['主胜', '客胜', '平'].includes(x.pick_1x2));
      const proSame = proDirectional.length > 0 && proDirectional.filter((x: AnyRow) => x.pick_1x2 === top1).length > proDirectional.length / 2;
      const reproofDomains = Number(eloSame) + Number(proSame);

      let finalLight = 'UNAVAILABLE', finalReason = '未形成正式HAD候选链';
      if (pRaw) {
        if (baseLight === 'RED') { finalLight = 'RED'; finalReason = '基础HUR/DTR/DLR存在红灯，Teacher不得复活'; }
        else if (!nonRiskQuality) { finalLight = 'YELLOW'; finalReason = 'HAD非风险候选质量Gate未通过'; }
        else if (baseLight === 'GREEN') {
          if (teacherAudit.action === 'STRONG_CONFLICT') { finalLight = 'RED'; finalReason = 'Teacher二审强冲突'; }
          else if (teacherAudit.action === 'REVIEW') { finalLight = 'YELLOW'; finalReason = 'Teacher二审要求复核'; }
          else { finalLight = 'GREEN'; finalReason = teacherAudit.action === 'SUPPORT' ? '基础绿灯且Teacher支持' : '基础绿灯且Teacher无反向动作'; }
        } else if (baseLight === 'YELLOW') {
          if (['REVIEW', 'STRONG_CONFLICT'].includes(teacherAudit.action)) { finalLight = 'RED'; finalReason = '基础黄灯且Teacher二审反向'; }
          else if (teacherAudit.action === 'SUPPORT' && reproofDomains >= 1) { finalLight = 'GREEN'; finalReason = '基础黄灯、Teacher支持且独立证据再证明'; }
          else { finalLight = 'YELLOW'; finalReason = '基础黄灯未满足解锁条件'; }
        }
      }
      const formalEligible = finalLight === 'GREEN' && nonRiskQuality;
      const anchorStatus = !pRaw ? 'NO_FORMAL_ANCHOR' : baseLight === 'RED' ? 'NO_ANCHOR_RED' : formalEligible ? 'HAD_ANCHOR_ELIGIBLE' : 'REVIEW_YELLOW';

      const hhadMarketTop = hhadProb ? hhadLabel(ordered(hhadProb)[0][0]) : null;
      const hhadMarketTopProb = hhadProb ? ordered(hhadProb)[0][1] : null;
      const hhadPoissonTop = poisson?.top1 || null;
      const marketPoissonConflict = !!hhadMarketTop && !!hhadPoissonTop && hhadMarketTop !== hhadPoissonTop;
      let handicapPick = hhadMarketTop || 'PASS';
      if (poisson && hhadMarketTop === hhadPoissonTop) handicapPick = hhadMarketTop!;
      else if (marketPoissonConflict) handicapPick = 'PASS';
      const exactMarginRisk = Math.abs(Number(handicap || 0)) === 1 && deepAbs != null && Math.abs(Number(handicap)) - deepAbs >= .25 && Number(hhadProb?.draw || 0) >= .25;
      if (exactMarginRisk) handicapPick = 'PASS';
      const handicapSupport = Number(!!pRaw) + Number(asiaLatest.length >= 3) + Number(!!hhadProb) + Number(!!poisson && !marketPoissonConflict);
      const handicapLight = handicapPick === 'PASS' ? 'RED' : handicapSupport >= 3 && !marketPoissonConflict ? 'GREEN' : 'YELLOW';
      const handicapReason = exactMarginRisk ? '官方±1 + Asia4明显浅盘 + HHAD让平去水>=25%，EXACT Margin高边界风险' : marketPoissonConflict ? 'HHAD市场与Poisson Margin冲突，无法安全裁决' : handicapLight === 'GREEN' ? '至少3个核心证据域支持，且无未解决硬冲突' : '方向可形成，但仍有冲突/边界证据，暂不升绿';
      const topSp = had && top1 ? Number(top1 === '主胜' ? had.home_sp : top1 === '平' ? had.draw_sp : had.away_sp) : null;
      const formalHandling = !pRaw ? 'PASS_DATA_INCOMPLETE' : formalEligible ? 'HAD_ANCHOR_ELIGIBLE' : baseLight === 'RED' ? 'NO_ANCHOR_RED' : 'REVIEW_YELLOW';
      const intelSources = [...new Set(intel.map((x: AnyRow) => x.source_code))];
      const sourceStatus: AnyRow = {
        engine: 'v48-restored-frozen-contract', route: pRaw ? 'HAD_FORMAL' : 'DATA_INCOMPLETE',
        p_raw: pRaw, p_final: pRaw, top1_prob: top1Prob, gap,
        base_risk_light: baseLight, final_selection_light: finalLight,
        final_selection_light_label: finalLight === 'GREEN' ? '🟢 正式稳腿' : finalLight === 'RED' ? '🔴 最终淘汰' : finalLight === 'YELLOW' ? '🟡 未达选腿质量' : '⚪ 无正式HAD资格',
        final_selection_reason: finalReason, final_selection_eligible: formalEligible,
        had_candidate_quality_pass: nonRiskQuality, abc_candidate: formalEligible,
        asia4_institutions: asiaLatest.length, deep_gate_median_abs: deepAbs,
        had_source_code: had?.source_code || null, hhad_source_code: hhad?.source_code || null,
        sp_top1: hadTop, top1_sp: topSp, hhad_line: handicap,
        hhad_market_probs: hhadProb, hhad_market_top1: hhadMarketTop, hhad_market_prob: hhadMarketTopProb,
        hhad_poisson_probs: poisson?.probs || null, hhad_poisson_top1: hhadPoissonTop,
        hhad_poisson_top1_prob: poisson?.top1_prob || null, hhad_lambda_home: poisson?.lambda_home || null, hhad_lambda_away: poisson?.lambda_away || null,
        hhad_shadow_status: poisson ? (marketPoissonConflict ? 'POISSON_MARKET_CONFLICT' : 'POISSON_MARKET_ALIGNED') : hhadProb ? 'MARKET_ONLY' : 'UNCONFIRMED',
        hhad_market_poisson_conflict: marketPoissonConflict,
        handicap_decision_engine: 'Handicap Decision Shadow v0.3', handicap_final_pick: handicapPick,
        handicap_light: handicapLight, handicap_light_reason: handicapReason,
        handicap_support_count: handicapSupport, handicap_asia_current_median_abs: deepAbs,
        teacher_post_gate_action: teacherAudit.action, teacher_adjustment: teacherAudit.adjustment,
        teacher_weighted_score: teacherAudit.score, teacher_reproof: reproofDomains >= 1,
        independent_support_domains: reproofDomains, teacher_b_agreement: teacherAudit.agreements.b,
        teacher_c_agreement: teacherAudit.agreements.c, teacher_g_agreement: teacherAudit.agreements.g,
        elo: elo || null, professional_predictions: professional,
        intelligence_rows: intel.length, intelligence_formal_rows: intel.filter((x: AnyRow) => x.affects_formal).length,
        intelligence_sources: intelSources, intelligence_audit_status: intel.length ? 'SHADOW_INTEL_ATTACHED' : 'NO_INTEL_MATCH',
        jiebao_identity_verified: !!jiebaoMap,
        evidence_completeness: { market: !!pRaw && asiaLatest.length >= 3 && !!had, teacher: !!teacher, strength: !!elo, fundamentals: !!poisson, professional: professional.length > 0, intelligence: intel.length > 0 },
        market_timeline: [
          ...(williamCurrent ? [{ source: 'William Hill 欧赔', initial: williamOpening ? `${williamOpening.odds_home}/${williamOpening.odds_draw}/${williamOpening.odds_away}` : null, current: `${williamCurrent.odds_home}/${williamCurrent.odds_draw}/${williamCurrent.odds_away}` }] : []),
          ...asiaLatest.map((x) => ({ source: `${x.institution_name} 亚洲盘`, current: `${x.handicap_line}｜主${x.home_water}/客${x.away_water}` })),
          ...(had ? [{ source: '竞彩HAD SP镜像', current: `${had.home_sp}/${had.draw_sp}/${had.away_sp}` }] : []),
          ...(hhad ? [{ source: `竞彩HHAD SP镜像 ${handicap}`, current: `${hhad.home_sp}/${hhad.draw_sp}/${hhad.away_sp}` }] : []),
        ],
      };
      const pct = top1Prob == null ? '未确认' : `${(top1Prob * 100).toFixed(1)}%`;
      const hps = pRaw ? `FT ${top1} ${pct}；HAD SP ${topSp ?? '未确认'}；HUR ${hur}/DTR ${dtr}/DLR ${dlr}；Deep ${deepAbs == null ? '未确认' : deepAbs.toFixed(2)}；${anchorStatus}；Teacher ${teacherAudit.action} ${teacherAudit.adjustment >= 0 ? '+' : ''}${teacherAudit.adjustment}；FinalLight ${sourceStatus.final_selection_light_label}；让球 ${handicapLight === 'GREEN' ? '🟢' : handicapLight === 'YELLOW' ? '🟡' : '🔴'} ${handicapPick}（${handicapReason}）` : `P_raw未形成；FinalLight ⚪ 无正式HAD资格；让球 ${handicapPick}`;
      const detail: AnyRow = {
        offering_id: o.id, match_no: pad(o.match_no), league: o.league, home_team: o.home_team, away_team: o.away_team,
        kickoff_bjt: iso(o.kickoff_local ? `${o.kickoff_local}+08:00` : null), top1, second_pick: secondPick,
        confidence_label: conf, anchor_status: anchorStatus, hur, dtr, dlr, dq,
        final_handling: formalHandling, official_handicap: handicap, handicap_pick: handicapPick,
        hps, source_status: sourceStatus, frozen_at: freeze.toISOString(),
        freeze_status: 'formal_runtime_restored_v48_frozen_contract', result_verified: false,
        model_revision_id: model.id, model_revision_tag: model.revision_tag,
      };
      details.push(detail);
      if (formalEligible && topSp && top1Prob) formalCandidates.push({ match_no: detail.match_no, league: o.league, top1, p_final: top1Prob, sp: topSp, deep_abs: deepAbs });
    }

    const abc = recommendations(formalCandidates);
    const dataComplete = details.every((d) => !!d.source_status.p_raw && d.source_status.asia4_institutions >= 3 && !!d.source_status.had_source_code && !!d.source_status.hhad_source_code);
    const formalAllowed = dataComplete;
    const rawSummary = {
      executor: 'hao-model-hourly-executor-v01-v48-restored-frozen-contract', total_matches: details.length,
      p_raw_matches: details.filter((d) => !!d.source_status.p_raw).length,
      formal_had_legs: formalCandidates.length, hhad_decisions: details.length,
      intelligence_rows: details.reduce((v, d) => v + d.source_status.intelligence_rows, 0),
      intelligence_formal_rows: details.reduce((v, d) => v + d.source_status.intelligence_formal_rows, 0),
      jiebao_identity_verified: details.filter((d) => d.source_status.jiebao_identity_verified).length,
      sina_xiaopao_matches: details.filter((d) => d.source_status.intelligence_sources.includes('sina_xiaopao')).length,
      poisson_confirmed: details.filter((d) => !!d.source_status.hhad_poisson_probs).length,
      budget_cap_rmb: 64, recommendations: abc, detail_rows: details,
    };

    if (dryRun) return Response.json({ ok: true, dry_run: true, sale_date: saleDate, data_complete: dataComplete, formal_allowed: formalAllowed, raw_summary: rawSummary });

    const range = `${details[0].match_no}-${details[details.length - 1].match_no}`;
    const runRow = {
      model_name: model.model_name, model_version: model.model_version, pool_date: saleDate, pool_kind: 'HJ',
      pool_label: '当前竞彩销售池', official_range: range, total_matches: details.length, run_time: freeze.toISOString(),
      status: 'formal_runtime_complete_v48_restored_frozen_contract', data_complete: dataComplete, formal_allowed: formalAllowed,
      source_provenance: SOURCE_PROVENANCE, notes: dataComplete ? '正式执行链完整；A/B/C允许合法PASS。' : '执行器已完整运行；上游缺失场次按UNCONFIRMED/PASS处理，未伪造数据。',
      raw_summary: rawSummary, model_revision_id: model.id, model_revision_tag: model.revision_tag,
    };
    const { data: run, error: runError } = await sb.from('hao_console_model_runs').insert(runRow).select('id').single();
    if (runError) throw runError;
    const predictionRows = details.map((d) => ({
      run_id: run.id, model_name: model.model_name, model_version: model.model_version, pool_date: saleDate,
      match_no: d.match_no, league: d.league, home_team: d.home_team, away_team: d.away_team, kickoff_bjt: d.kickoff_bjt,
      top1: d.top1, second_pick: d.second_pick, confidence_label: d.confidence_label, anchor_status: d.anchor_status,
      hur: d.hur, dtr: d.dtr, dlr: d.dlr, strong_conflict: d.source_status.hhad_market_poisson_conflict ? 'HANDICAP_MARKET_CONFLICT' : null,
      top1_rejection: d.source_status.final_selection_eligible ? null : d.source_status.final_selection_reason,
      final_handling: d.final_handling, ticket_pick: d.source_status.final_selection_eligible ? d.top1 : null,
      keep_discard: d.source_status.final_selection_eligible ? 'KEEP' : 'DISCARD', dq: d.dq, hps: d.hps,
      official_handicap: d.official_handicap, handicap_pick: d.handicap_pick, source_status: d.source_status,
      source_provenance: SOURCE_PROVENANCE, frozen_at: d.frozen_at, freeze_status: d.freeze_status,
      result_verified: false, model_revision_id: model.id, model_revision_tag: model.revision_tag,
      semantic_direction: d.top1, ticket_pick_before_gate: d.top1,
      ticket_pick_after_gate: d.source_status.final_selection_eligible ? d.top1 : null,
      direction_consistency_status: d.source_status.had_source_code ? (d.source_status.sp_top1 === d.top1 ? 'ALIGNED' : 'CONFLICT') : 'UNCONFIRMED',
      direction_consistency_reason: d.source_status.had_source_code ? `William Top1=${d.top1}; HAD SP Top1=${d.source_status.sp_top1}` : 'HAD或William未确认',
    }));
    const { error: predictionError } = await sb.from('hao_console_predictions').insert(predictionRows);
    if (predictionError) {
      await sb.from('hao_console_model_runs').update({ status: 'formal_runtime_write_failed_v48', formal_allowed: false, notes: predictionError.message }).eq('id', run.id);
      throw predictionError;
    }
    return Response.json({ ok: true, run_id: run.id, sale_date: saleDate, total_matches: details.length, data_complete: dataComplete, formal_allowed: formalAllowed, formal_had_legs: formalCandidates.length, recommendations: abc });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error), executor: 'v48-restored-frozen-contract' }, { status: 500 });
  }
});
