CREATE OR REPLACE FUNCTION ss.borrador_factura(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_id text;
begin
  if not coalesce((p->'factura'->>'legible')::boolean, false)
     or not coalesce((p->'factura'->>'es_factura')::boolean, false) then
    return jsonb_build_object('borrador_id', null);
  end if;
  v_id := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
  values (v_id, (select y.user_id from ss.yo(p->>'platform', p->>'chat_id') y), p->>'platform', p->>'chat_id',
          'receipt_draft', p->'factura', p->>'message_key', now() + interval '24 hours');
  return jsonb_build_object('borrador_id', v_id);
end $function$;
