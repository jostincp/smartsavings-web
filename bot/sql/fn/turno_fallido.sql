CREATE OR REPLACE FUNCTION ss.turno_fallido(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare r jsonb;
begin
  with u as (
    update ss.processed_messages set status = 'failed', finished_at = now()
     where execution_id = p->>'execution_id' and status = 'processing'
     returning platform, chat_id, message_id)
  select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) into r from u;
  return jsonb_build_object('chats', r,
    'admin_chat_id', (select c.v #>> '{}' from ss.config c where c.k = 'admin_chat_id'));
end $function$;
