CREATE OR REPLACE FUNCTION ss._p4()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    new.amount_cop := new.amount;
  end if;
  return new;
end $function$;
