CREATE OR REPLACE FUNCTION ss._ping()
 RETURNS text
 LANGUAGE sql
AS $function$ select 'ok'::text $function$;
