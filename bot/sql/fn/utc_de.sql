CREATE OR REPLACE FUNCTION ss.utc_de(d text)
 RETURNS timestamp without time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when d is null then null else ((d::date)::timestamp at time zone 'America/Bogota') at time zone 'UTC' end
$function$;
