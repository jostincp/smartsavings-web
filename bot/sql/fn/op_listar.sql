CREATE OR REPLACE FUNCTION ss.op_listar(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_items jsonb;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;
  select coalesce(jsonb_agg(x order by x.orden), '[]'::jsonb) into v_items from (
    select tx.id as ref,
           to_char((tx.transaction_date at time zone 'UTC') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as fecha,
           tx.type as tipo, tx.amount as monto, tx.currency as moneda, tx.amount_cop as cop, tx.category as categoria,
           left(tx.description, 80) as descripcion, tx.store_name as comercio, tx.payment_method as medio,
           row_number() over (order by tx.transaction_date desc, tx.id desc) as orden
      from public.transactions tx
     where tx.user_id = v_uid
       and tx.transaction_date >= ss.utc_de(j->>'ini') and tx.transaction_date < ss.utc_de(j->>'fin')
       and (jsonb_typeof(j->'categorias') is distinct from 'array'
            or tx.category in (select jsonb_array_elements_text(j->'categorias')))
       and (j->>'tipo' is null or tx.type = j->>'tipo')
       and (j->>'texto' is null or tx.description ilike '%' || (j->>'texto') || '%' escape '\'
            or tx.store_name ilike '%' || (j->>'texto') || '%' escape '\')
     order by tx.transaction_date desc, tx.id desc
     limit least(greatest(coalesce((j->>'limite')::int, 10), 1), 20)) x;
  return jsonb_build_object('ok', true, 'items', v_items);
end $function$;
