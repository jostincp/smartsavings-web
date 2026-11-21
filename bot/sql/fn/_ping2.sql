CREATE OR REPLACE FUNCTION ss._ping2(x integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
begin
  return x + 1;
end $function$;
