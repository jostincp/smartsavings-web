CREATE OR REPLACE FUNCTION ss.entrada(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_rec timestamptz;
begin
  insert into ss.processed_messages (platform, message_id, chat_id, execution_id)
  values (p->>'platform', p->>'message_key', p->>'chat_id', p->>'execution_id')
  on conflict (platform, message_id) do nothing
  returning received_at into v_rec;
  if v_rec is null then
    return jsonb_build_object('nuevo', false, 'anteriores', 0);
  end if;
  return jsonb_build_object('nuevo', true, 'anteriores', ss.anteriores(p));
end $function$;
