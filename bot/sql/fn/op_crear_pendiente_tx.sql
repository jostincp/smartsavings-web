CREATE OR REPLACE FUNCTION ss.op_crear_pendiente_tx(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_uid uuid; v_pa text;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  v_pa := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
  values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'tx_confirm',
          jsonb_build_object('items', coalesce(j->'items', '[]'::jsonb), 'motivo', j->>'motivo'),
          j->>'message_key', now() + interval '30 minutes');
  return jsonb_build_object('estado', 'pendiente', 'pendiente_id', v_pa, 'items', coalesce(j->'items', '[]'::jsonb),
                            'motivo', j->>'motivo');
end $function$;
