CREATE OR REPLACE FUNCTION ss.op_preparar_borrado(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_ids int[];
  v_items jsonb;
  v_total numeric;
  v_pa text;
  v_batch uuid;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if j ? 'lote_de' then
    select tx.batch_id into v_batch from public.transactions tx where tx.user_id = v_uid and tx.id = (j->>'lote_de')::int;
  end if;
  select array_agg(x.id order by x.id),
         jsonb_agg(jsonb_build_object('ref', x.id, 'descripcion', x.description, 'cop', x.amount_cop, 'monto', x.amount,
                   'moneda', x.currency, 'tipo', x.type, 'fecha', ss.fecha_bog(x.transaction_date)) order by x.id),
         sum(x.amount_cop)
    into v_ids, v_items, v_total
    from (select tx.id, tx.description, tx.amount_cop, tx.amount, tx.currency, tx.type, tx.transaction_date
            from public.transactions tx
           where tx.user_id = v_uid and (
                 tx.id in (select jsonb_array_elements_text(coalesce(j->'refs', '[]'::jsonb))::int)
              or (v_batch is not null and tx.batch_id = v_batch)
              or (j ? 'lote_de' and v_batch is null and tx.id = (j->>'lote_de')::int)
              or (j ? 'sel_ini'
                  and tx.transaction_date >= ss.utc_de(j->>'sel_ini') and tx.transaction_date < ss.utc_de(j->>'sel_fin')
                  and (j->>'sel_texto' is null or tx.description ilike '%' || (j->>'sel_texto') || '%' escape '\'
                       or tx.store_name ilike '%' || (j->>'sel_texto') || '%' escape '\')
                  and (j->>'sel_categoria' is null or tx.category = j->>'sel_categoria')))
           order by tx.id limit 21) x;
  if v_ids is null then
    return jsonb_build_object('estado', 'no_encontrado');
  end if;
  if array_length(v_ids, 1) > 20 then
    return jsonb_build_object('estado', 'demasiados');
  end if;
  update ss.pending_actions set consumed_at = now()
   where platform = j->>'platform' and chat_id = j->>'chat_id' and kind = 'delete_confirm' and consumed_at is null;
  v_pa := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
  values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'delete_confirm',
          jsonb_build_object('ids', to_jsonb(v_ids), 'items', v_items, 'total_cop', v_total),
          j->>'message_key', now() + interval '10 minutes');
  return jsonb_build_object('estado', 'preparado', 'pendiente_id', v_pa, 'items', v_items, 'total_cop', v_total,
                            'n', array_length(v_ids, 1));
end $function$;
