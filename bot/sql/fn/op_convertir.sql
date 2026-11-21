CREATE OR REPLACE FUNCTION ss.op_convertir(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_rate numeric; v_date date; v_src text; v_monto numeric := (j->>'monto')::numeric;
begin
  select x.rate, x.rate_date, x.source into v_rate, v_date, v_src from ss.fx_rates x
   where x.base = j->>'moneda' and x.quote = 'COP'
   order by abs(x.rate_date - coalesce((j->>'fecha')::date, (now() at time zone 'America/Bogota')::date)) limit 1;
  return jsonb_build_object('monto', v_monto, 'moneda', j->>'moneda', 'tasa', v_rate, 'fecha_tasa', v_date,
                            'fuente', v_src, 'resultado_cop', round(v_monto * v_rate, 0));
end $function$;
