CREATE OR REPLACE FUNCTION ss.deuda_tarjeta(p_uid uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(sum(t.amount_cop) filter (where t.type = 'expense' and t.payment_method = 'credito'), 0)
       - coalesce(sum(t.amount_cop) filter (where t.type = 'transfer' and t.category = 'Pago de Tarjeta'), 0)
  from public.transactions t where t.user_id = p_uid
$function$;
