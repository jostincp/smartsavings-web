CREATE OR REPLACE FUNCTION ss._p3()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return 1;
end $function$;
