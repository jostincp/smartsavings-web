CREATE OR REPLACE FUNCTION ss.op_confirmar_pendiente(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_cid int;
  v_kind text;
  v_payload jsonb;
  u_consumed timestamptz;
  u_expires timestamptz;
  u_mk text;
  v_items jsonb;
  v_r jsonb;
  v_excl int[];
begin
  select y.user_id, y.channel_id into v_uid, v_cid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update ss.pending_actions x set consumed_at = now(), consumed_message_key = j->>'message_key'
   where x.id = j->>'pa_id' and x.platform = j->>'platform' and x.chat_id = j->>'chat_id'
     and (x.user_id = v_uid or (x.user_id is null and x.kind = 'receipt_draft'))
     and x.consumed_at is null and x.expires_at > now() and x.created_message_key <> j->>'message_key'
     and x.kind in ('delete_confirm', 'tx_confirm', 'tx_update', 'receipt_draft', 'link_notice')
  returning x.kind, x.payload into v_kind, v_payload;
  if v_kind is null then
    select x.consumed_at, x.expires_at, x.created_message_key into u_consumed, u_expires, u_mk
      from ss.pending_actions x where x.id = j->>'pa_id' and x.platform = j->>'platform' and x.chat_id = j->>'chat_id';
    return jsonb_build_object('estado', case when u_mk is null then 'no_encontrado'
                                             when u_mk = j->>'message_key' then 'mismo_mensaje'
                                             when u_consumed is not null then 'ya_usado'
                                             when u_expires <= now() then 'expirado'
                                             else 'no_encontrado' end);
  end if;
  if v_kind = 'delete_confirm' then
    return jsonb_build_object('estado', 'delete_confirm')
        || ss.borrar_movimientos(v_uid, array(select jsonb_array_elements_text(v_payload->'ids')::int), j->>'message_key');
  elsif v_kind = 'link_notice' then
    return jsonb_build_object('estado', 'link_notice')
        || ss.desvincular_canal(v_uid, v_cid, (v_payload->>'channel_id')::int);
  elsif v_kind = 'tx_confirm' then
    v_r := ss.op_registrar(j || jsonb_build_object('items', v_payload->'items', 'pa_req', j->>'pa_id'));
    return jsonb_build_object('estado', 'tx_confirm', 'registro', v_r, 'motivo', v_payload->>'motivo');
  elsif v_kind = 'tx_update' then
    v_r := ss.op_corregir(j || jsonb_build_object('ref', (v_payload->>'ref')::int, 'cambios', v_payload->'cambios',
                                                  'pa_req', j->>'pa_id'));
    return jsonb_build_object('estado', 'tx_update', 'correccion', v_r);
  end if;
  -- receipt_draft: los montos salen del borrador guardado, nunca del modelo
  v_excl := array(select jsonb_array_elements_text(coalesce(j->'excluir', '[]'::jsonb))::int);
  if coalesce((j->>'usar_total_impreso')::boolean, false) then
    v_items := jsonb_build_array(jsonb_build_object('idx', 1, 'type', 'expense', 'amount', (v_payload->>'total')::numeric,
      'currency', coalesce(v_payload->>'moneda', 'COP'),
      'category', coalesce(v_payload->>'categoria_principal', 'Alimentación'),
      'description', left('Compra en ' || coalesce(v_payload->>'tienda', 'tienda'), 100),
      'store_name', v_payload->>'tienda', 'fecha_local', v_payload->>'fecha_ok'));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'idx', e.ord, 'type', 'expense', 'amount', (e.it->>'precio')::numeric,
             'currency', coalesce(v_payload->>'moneda', 'COP'),
             'category', coalesce((select cb->>'categoria' from jsonb_array_elements(coalesce(j->'cambios', '[]'::jsonb)) cb
                                   where (cb->>'item')::int = e.ord limit 1), e.it->>'categoria'),
             'description', e.it->>'producto', 'store_name', v_payload->>'tienda', 'product_name', e.it->>'producto',
             'fecha_local', v_payload->>'fecha_ok') order by e.ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) with ordinality as e(it, ord)
     where not (e.ord::int = any(v_excl));
  end if;
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('estado', 'receipt_draft', 'registro', jsonb_build_object('ok', false, 'motivo', 'sin_items'));
  end if;
  v_r := ss.op_registrar(j || jsonb_build_object('items', v_items, 'pa_req', j->>'pa_id'));
  return jsonb_build_object('estado', 'receipt_draft', 'registro', v_r, 'tienda', v_payload->>'tienda',
                            'excluidos', to_jsonb(v_excl));
end $function$;
