create or replace function ninety_core.settle_hj38_predictions()
returns integer
language plpgsql
security definer
set search_path = ninety_core, public
as $$
declare updated_count integer;
begin
  with verified as (
    select distinct on (p.id)
      p.id,
      (s.payload->>'home_score')::integer as home_score,
      (s.payload->>'away_score')::integer as away_score,
      s.source_name
    from ninety_core.hao_console_predictions p
    join ninety_core.match_pool m
      on m.match_date=p.pool_date
     and lpad(m.match_no,3,'0')=lpad(p.match_no,3,'0')
     and trim(m.home_team)=trim(p.home_team)
     and trim(m.away_team)=trim(p.away_team)
    join ninety_core.source_state s
      on s.match_key=m.match_key
     and s.field_key='result'
     and s.quality='verified'
    where p.result_verified=false
      and p.frozen_at<p.kickoff_bjt
      and s.payload->>'home_score' ~ '^\d+$'
      and s.payload->>'away_score' ~ '^\d+$'
    order by p.id,s.observed_at desc
  )
  update ninety_core.hao_console_predictions p
     set result_home=v.home_score,
         result_away=v.away_score,
         result_1x2=case when v.home_score>v.away_score then '主胜' when v.home_score=v.away_score then '平' else '客胜' end,
         result_verified=true,
         result_source=v.source_name,
         updated_at=now()
  from verified v
  where p.id=v.id;
  get diagnostics updated_count = row_count;
  return updated_count;
end $$;

revoke all on function ninety_core.settle_hj38_predictions() from public, anon, authenticated;
grant execute on function ninety_core.settle_hj38_predictions() to service_role, postgres;

do $$
begin
  if not exists (select 1 from cron.job where jobname='hj38-result-settlement-sg') then
    perform cron.schedule('hj38-result-settlement-sg','13,28,43,58 * * * *',
      $job$select ninety_core.settle_hj38_predictions();$job$);
  end if;
end $$;
