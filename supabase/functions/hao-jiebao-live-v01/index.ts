import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FEED_URL = 'https://livestatic.titan007.com/vbsxml/bfdata_ut.js?r=007';
const FEED_REFERER = 'https://live.titan007.com/index2in1.aspx';

async function authorized(req: Request) {
  const supplied = req.headers.get('x-hao-internal-key') || '';
  const { data, error } = await sb
    .from('hao_internal_secrets_v01')
    .select('secret_value')
    .eq('secret_name', 'cron_internal_v01')
    .maybeSingle();
  return !error && !!data?.secret_value && supplied === data.secret_value;
}

function parseRows(js: string) {
  const rows: string[][] = [];
  for (const m of js.matchAll(/A\[\d+\]\s*=\s*"([\s\S]*?)"\.split\(['"]\^['"]\)/g)) {
    rows.push(m[1].replace(/\\"/g, '"').split('^'));
  }
  return rows;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function sourceKickoff(value: string) {
  const p = String(value || '').split(',').map(Number);
  if (p.length < 5 || p.some((v, i) => i < 5 && !Number.isFinite(v))) return null;
  const [year, zeroMonth, day, hour, minute] = p;
  return `${year}-${String(zeroMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`;
}

Deno.serve(async (req: Request) => {
  if (!(await authorized(req))) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED_INTERNAL_CALL' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const requestedDate = url.searchParams.get('date');
    let saleDate = requestedDate;
    if (!saleDate) {
      const { data: health } = await sb
        .from('hao_source_health_v01')
        .select('latest_pool_date')
        .eq('source_code', 'jc_pool_discovery')
        .maybeSingle();
      saleDate = health?.latest_pool_date || null;
    }
    if (!saleDate) throw new Error('CURRENT_SALE_DATE_UNCONFIRMED');

    const { data: offerings, error: offeringError } = await sb
      .from('jc_offerings_2026')
      .select('id,offer_date,weekday_text,match_no,league,home_team,away_team,kickoff_local')
      .eq('offer_date', saleDate)
      .eq('is_world_cup', false)
      .order('match_no');
    if (offeringError) throw offeringError;

    const response = await fetch(FEED_URL, {
      cache: 'no-store',
      headers: {
        'user-agent': 'Mozilla/5.0 HaoJiebaoCollector/1.0',
        referer: FEED_REFERER,
        origin: 'https://live.titan007.com',
        accept: '*/*',
      },
    });
    const feedText = await response.text();
    if (!response.ok || feedText.length < 1000) {
      throw new Error(`JIEBAO_FEED_UNAVAILABLE:${response.status}:${feedText.length}`);
    }
    const feedRows = parseRows(feedText);
    const analysisProbe = url.searchParams.get('analysisProbe');
    if (analysisProbe) {
      const candidates = [
        `https://zq.titan007.com/analysis/${analysisProbe}cn.htm`,
        `https://analysis.titan007.com/${analysisProbe}cn.htm`,
        `https://www.titan007.com/analysis/${analysisProbe}cn.htm`,
      ];
      const results = [];
      for (const candidate of candidates) {
        try {
          const r = await fetch(candidate, {
            redirect: 'follow',
            headers: {
              'user-agent': 'Mozilla/5.0 HaoJiebaoCollector/1.0',
              referer: FEED_REFERER,
              accept: 'text/html,application/xhtml+xml',
            },
          });
          const body = await r.text();
          results.push({ url: candidate, final_url: r.url, http: r.status, bytes: body.length,
            prefix: body.replace(/\s+/g, ' ').slice(0, 1200) });
        } catch (error: any) {
          results.push({ url: candidate, error: String(error?.message || error) });
        }
      }
      return Response.json({ ok: true, status: 'ANALYSIS_PROBE_NO_WRITES', analysisProbe, results });
    }
    const probes: any[] = [];
    for (const offering of offerings || []) {
      const token = `${offering.weekday_text || ''}${String(offering.match_no).padStart(3, '0')}`;
      const row = feedRows.find((fields) => fields.some((v) => String(v).trim() === token));
      probes.push({
        offering_id: offering.id,
        match_no: offering.match_no,
        expected: `${offering.home_team}-${offering.away_team}`,
        token,
        matched: !!row,
        fields: row || null,
      });
    }

    if (url.searchParams.get('probe') === '1') {
      return Response.json({
        ok: true,
        status: 'PROBE_COMPLETE_NO_WRITES',
        sale_date: saleDate,
        feed_http: response.status,
        feed_bytes: feedText.length,
        feed_rows: feedRows.length,
        matched: probes.filter((x: any) => x.matched).length,
        expected: probes.length,
        probes,
      });
    }

    const mapped = probes.filter((x) => x.matched && Array.isArray(x.fields));
    const mappingRows: any[] = [];
    const intelligenceRows: any[] = [];
    const fetchedAt = new Date().toISOString();

    for (const probe of mapped) {
      const offering = (offerings || []).find((x: any) => Number(x.id) === Number(probe.offering_id));
      const f = probe.fields as string[];
      const matchId = String(f[0] || '');
      const kickoff = sourceKickoff(f[12]);
      const sourceHome = String(f[5] || '').trim();
      const sourceAway = String(f[8] || '').trim();
      const sourceLeague = String(f[2] || '').trim();
      const sourceUrl = `https://live.titan007.com/index2in1.aspx#id=${matchId}`;
      const confidence = kickoff ? 0.99 : 0.95;

      mappingRows.push({
        offering_id: offering.id,
        source_code: 'jiebao',
        source_match_id: matchId,
        source_match_url: sourceUrl,
        source_home_team: sourceHome,
        source_away_team: sourceAway,
        source_kickoff: kickoff,
        match_method: 'official_jc_token_plus_kickoff',
        match_confidence: confidence,
        mapping_status: 'verified',
        verified_at: fetchedAt,
        updated_at: fetchedAt,
      });

      const common = {
        pool_kind: 'HJ',
        pool_date: saleDate,
        issue_no: null,
        offering_id: offering.id,
        match_no: String(offering.match_no).padStart(2, '0'),
        league: offering.league,
        home_team: offering.home_team,
        away_team: offering.away_team,
        kickoff_bjt: offering.kickoff_local ? new Date(`${offering.kickoff_local}+08:00`).toISOString() : null,
        source_code: 'jiebao',
        source_url: sourceUrl,
        source_published_at: null,
        fetched_at: fetchedAt,
        match_confidence: 'official_jc_token_plus_kickoff',
        parse_status: 'parsed_live_feed_v1',
        affects_formal: false,
      };
      const facts = [
        {
          key: 'identity',
          category: '比赛身份',
          headline: `捷报身份核验：${sourceHome} vs ${sourceAway}`,
          fact_text: `${probe.token}；${sourceLeague}；捷报比赛ID ${matchId}；开赛 ${kickoff || f[11] || '未确认'}`,
          raw: { token: probe.token, source_home: sourceHome, source_away: sourceAway,
            source_league: sourceLeague, source_kickoff: kickoff, team_ids: [f[38] || null, f[39] || null] },
        },
        {
          key: 'ranking',
          category: '赛前排名',
          headline: `捷报赛前排名：${sourceHome} ${f[22] || '未确认'} / ${sourceAway} ${f[23] || '未确认'}`,
          fact_text: `主队排名 ${f[22] || '未确认'}；客队排名 ${f[23] || '未确认'}`,
          raw: { home_rank: f[22] || null, away_rank: f[23] || null },
        },
        {
          key: 'market_context',
          category: '盘口上下文',
          headline: `捷报即时亚洲盘上下文：${f[29] || '未确认'}`,
          fact_text: `捷报比分源当前亚洲盘字段=${f[29] || '未确认'}；仅作情报审计，不进入豪竞正式概率链。`,
          raw: { asian_line: f[29] || null, total_line: f[46] || null, formal_role: 'shadow_only' },
        },
      ];
      for (const fact of facts) {
        intelligenceRows.push({
          ...common,
          source_item_id: `${matchId}:${fact.key}`,
          category: fact.category,
          team_side: 'match',
          polarity: 'neutral',
          evidence_grade: 'JB-B',
          headline: fact.headline,
          fact_text: fact.fact_text,
          raw: fact.raw,
          fingerprint: await sha256(`jiebao|${saleDate}|${offering.id}|${matchId}|${fact.key}|${fact.fact_text}`),
        });
      }
    }

    let writeError: string | null = null;
    if (mappingRows.length) {
      const { error } = await sb.from('hao_market_match_map_v01').upsert(mappingRows, {
        onConflict: 'offering_id,source_code',
      });
      if (error) writeError = `mapping:${error.message}`;
    }
    if (!writeError && intelligenceRows.length) {
      const { error } = await sb.from('hao_match_intelligence_v01').upsert(intelligenceRows, {
        onConflict: 'fingerprint', ignoreDuplicates: true,
      });
      if (error) writeError = `intelligence:${error.message}`;
    }

    const verified = writeError ? 0 : mapped.length;
    await sb.from('hao_source_health_v01').upsert({
      source_code: 'jiebao',
      source_role: 'match_identity_and_prematch_context',
      status: writeError ? 'error' : verified === (offerings || []).length ? 'ok' : 'partial',
      last_attempt_at: fetchedAt,
      last_success_at: writeError ? null : fetchedAt,
      latest_pool_date: saleDate,
      expected_matches: (offerings || []).length,
      mapped_matches: mapped.length,
      captured_matches: writeError ? 0 : mapped.length,
      verified_matches: verified,
      consecutive_failures: writeError ? 1 : 0,
      last_error: writeError,
      notes: `official JC token + kickoff identity; feed rows=${feedRows.length}; intelligence shadow_only`,
      updated_at: fetchedAt,
    }, { onConflict: 'source_code' });

    if (writeError) throw new Error(writeError);

    return Response.json({
      ok: true,
      status: verified === (offerings || []).length ? 'COMPLETE_V1' : 'PARTIAL_V1',
      sale_date: saleDate,
      feed_http: response.status,
      feed_bytes: feedText.length,
      feed_rows: feedRows.length,
      matched: probes.filter((x: any) => x.matched).length,
      expected: probes.length,
      mappings_written: mappingRows.length,
      intelligence_written_attempted: intelligenceRows.length,
      matches: mapped.map((x) => ({ match_no: x.match_no, source_match_id: x.fields[0],
        source: `${x.fields[5]}-${x.fields[8]}`, token: x.token })),
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});
