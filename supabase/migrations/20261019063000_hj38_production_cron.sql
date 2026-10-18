do $$
begin
  if not exists (select 1 from cron.job where jobname='hj38-official-collector-sg') then
    perform cron.schedule('hj38-official-collector-sg','1,16,31,46 4-13 * * *',
      $job$select net.http_post(url := 'https://zssourkgabcxibggwhqm.supabase.co/functions/v1/hj38-official-collector-v1', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$job$);
  end if;
  if not exists (select 1 from cron.job where jobname='hj38-pool-collector-sg') then
    perform cron.schedule('hj38-pool-collector-sg','3,18,33,48 4-13 * * *',
      $job$select net.http_post(url := 'https://zssourkgabcxibggwhqm.supabase.co/functions/v1/hj38-pool-collector-v1', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000);$job$);
  end if;
  if not exists (select 1 from cron.job where jobname='hj38-market-collector-sg') then
    perform cron.schedule('hj38-market-collector-sg','6,21,36,51 4-13 * * *',
      $job$select net.http_post(url := 'https://zssourkgabcxibggwhqm.supabase.co/functions/v1/hj38-market-collector-v1', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 90000);$job$);
  end if;
  if not exists (select 1 from cron.job where jobname='hj38-model-v87-sg') then
    perform cron.schedule('hj38-model-v87-sg','9,24,39,54 4-13 * * *',
      $job$select net.http_post(url := 'https://zssourkgabcxibggwhqm.supabase.co/functions/v1/hao-model-hourly-executor-v01', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 90000);$job$);
  end if;
end $$;
