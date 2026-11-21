CREATE OR REPLACE FUNCTION ss._p6(a numeric, b numeric)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
begin
  return a is distinct from b;
end $function$;
