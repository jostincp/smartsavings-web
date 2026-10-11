CREATE OR REPLACE FUNCTION ss._p5(t timestamp without time zone)
 RETURNS date
 LANGUAGE plpgsql
AS $function$
begin
  return ((coalesce(t, now() at time zone 'UTC') at time zone 'UTC') at time zone 'America/Bogota')::date;
end $function$;
