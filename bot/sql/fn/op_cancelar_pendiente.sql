CREATE OR REPLACE FUNCTION ss.op_cancelar_pendiente(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_kind text;
begin
  update ss.pending_actions x set consumed_at = now(), consumed_message_key = j->>'message_key'
   where x.id = j->>'pa_id' and x.platform = j->>'platform' and x.chat_id = j->>'chat_id'
     and x.consumed_at is null and x.kind <> 'link_code'
  returning x.kind into v_kind;
  return jsonb_build_object('estado', coalesce(v_kind, 'no_encontrado'));
end $function$;
