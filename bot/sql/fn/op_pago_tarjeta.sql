CREATE OR REPLACE FUNCTION ss.op_pago_tarjeta(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_deuda numeric;
  v_monto numeric := (j->>'monto')::numeric;
  v_int numeric := coalesce((j->>'intereses')::numeric, 0);
  v_abono numeric;
  v_cub numeric;
  v_exc numeric;
  v_items jsonb := '[]'::jsonb;
  v_reg jsonb;
  v_pa text;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_monto is null or v_monto <= 0 or v_int < 0 or v_int >= v_monto then
    raise exception 'op_pago_tarjeta: montos invalidos';
  end if;
  v_deuda := ss.deuda_tarjeta(v_uid);
  v_abono := v_monto - v_int;
  if v_deuda >= v_abono - 1000 then
    v_cub := v_abono; v_exc := 0;
  else
    v_cub := greatest(v_deuda, 0); v_exc := v_abono - v_cub;
  end if;
  if v_cub > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('idx', 1, 'type', 'transfer', 'amount', v_cub, 'currency', 'COP',
      'category', 'Pago de Tarjeta', 'description', 'Pago tarjeta de crédito', 'fecha_local', j->>'fecha_local',
      'payment_method', j->>'medio'));
  end if;
  if v_int > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('idx', 2, 'type', 'expense', 'amount', v_int, 'currency', 'COP',
      'category', 'Deudas y Préstamos', 'description', 'Intereses y cuota de manejo de la tarjeta', 'fecha_local', j->>'fecha_local',
      'payment_method', j->>'medio'));
  end if;
  if jsonb_array_length(v_items) > 0 then
    v_reg := ss.op_registrar(j || jsonb_build_object('items', v_items));
  end if;
  if v_exc > 0 then
    v_pa := ss.nuevo_id();
    insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
    values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'tx_confirm',
            jsonb_build_object('motivo', 'exceso_tarjeta', 'items', jsonb_build_array(jsonb_build_object(
              'idx', 1, 'type', 'expense', 'amount', v_exc, 'currency', 'COP', 'category', 'Deudas y Préstamos',
              'description', 'Compras con tarjeta que no estaban anotadas', 'fecha_local', j->>'fecha_local'))),
            j->>'message_key', now() + interval '30 minutes');
  end if;
  return jsonb_build_object('estado', case when v_exc > 0 then 'excede' else 'abonado' end,
    'pagado', v_monto, 'abono', v_cub, 'intereses', v_int, 'exceso', v_exc,
    'deuda_antes', v_deuda, 'deuda_despues', greatest(v_deuda - v_cub, 0),
    'pendiente_id', v_pa, 'registro', v_reg);
end $function$;
