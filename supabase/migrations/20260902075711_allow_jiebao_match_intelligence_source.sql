alter table public.hao_match_intelligence_v01
  drop constraint if exists hao_match_intelligence_v01_source_code_check;

alter table public.hao_match_intelligence_v01
  add constraint hao_match_intelligence_v01_source_code_check
  check (
    source_code = any (
      array[
        'fotmob'::text,
        '7m'::text,
        'sina_xiaopao'::text,
        'dongqiudi'::text,
        'jiebao'::text
      ]
    )
  );
