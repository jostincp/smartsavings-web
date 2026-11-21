CREATE OR REPLACE FUNCTION ss.fecha_bog(t timestamp without time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ((coalesce(t, now() at time zone 'UTC') at time zone 'UTC') at time zone 'America/Bogota')::date
$function$;
