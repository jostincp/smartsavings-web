CREATE OR REPLACE FUNCTION ss.compuerta(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object('anteriores', ss.anteriores(p))
$function$;
