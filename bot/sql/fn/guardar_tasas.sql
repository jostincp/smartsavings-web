CREATE OR REPLACE FUNCTION ss.guardar_tasas(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare n int;
begin
  insert into ss.fx_rates (base, quote, rate_date, rate, source)
  select r.base, 'COP', r.rate_date, r.rate, r.source
  from jsonb_to_recordset(coalesce(p->'tasas', '[]'::jsonb)) as r(base text, rate_date date, rate numeric, source text)
  where r.base ~ '^[A-Z]{3}$' and r.rate > 0 and r.rate_date is not null
  on conflict (base, quote, rate_date) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('guardadas', n);
end $function$;
