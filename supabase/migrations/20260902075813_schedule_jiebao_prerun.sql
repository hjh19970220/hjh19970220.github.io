select cron.schedule(
  'hao_jiebao_prerun_v01',
  '47 * * * *',
  $$
  select net.http_get(
    url := 'https://tqlibowvnwfkaseqqvvp.supabase.co/functions/v1/hao-jiebao-live-v01',
    headers := jsonb_build_object(
      'x-hao-internal-key',
      (
        select secret_value
        from public.hao_internal_secrets_v01
        where secret_name = 'cron_internal_v01'
      )
    ),
    timeout_milliseconds := 60000
  )
  where extract(
    hour from ((now() at time zone 'Asia/Shanghai') + interval '13 minutes')
  )::int in (12, 14, 16, 18, 20, 21, 22);
  $$
);
