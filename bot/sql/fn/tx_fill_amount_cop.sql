CREATE OR REPLACE FUNCTION ss.tx_fill_amount_cop()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.currency, 'COP') = 'COP' then
    if tg_op = 'INSERT' or new.amount_cop is null or new.amount <> old.amount or new.currency <> old.currency then
      new.amount_cop := new.amount;
      new.fx_rate := 1;
      new.fx_source := 'cop';
      new.fx_date := coalesce(new.fx_date, ss.fecha_bog(new.transaction_date));
    end if;
  elsif tg_op <> 'INSERT' then
    if new.amount <> old.amount and new.fx_rate is not null
       and coalesce(new.amount_cop, -1) = coalesce(old.amount_cop, -1) then
      new.amount_cop := round(new.amount * new.fx_rate, 2);
    end if;
  end if;
  return new;
end $function$;
