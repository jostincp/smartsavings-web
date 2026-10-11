CREATE OR REPLACE FUNCTION ss.cerrar_turno(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_sid text := ss.sesion(p->>'platform', p->>'chat_id');
  n int := 0;
begin
  if coalesce(p->>'persona', '') <> '' then
    insert into ss.chat_memory (session_id, role, content, message_key)
    values (v_sid, 'persona', left(p->>'persona', 1200), p->>'message_key');
    n := n + 1;
  end if;
  if coalesce(p->>'sami', '') <> '' then
    insert into ss.chat_memory (session_id, role, content, message_key, hechos)
    values (v_sid, 'sami', left(p->>'sami', 2000), p->>'message_key', p->'hechos');
    n := n + 1;
  end if;
  if coalesce(p->>'verificador', '') <> '' then
    insert into ss.events (user_id, kind, payload)
    values ((select y.user_id from ss.yo(p->>'platform', p->>'chat_id') y), 'verificador_reemplazo',
            jsonb_build_object('motivo', left(p->>'verificador', 200), 'mk', p->>'message_key'));
  end if;
  update ss.processed_messages
     set status = case when p->>'status' = 'failed' then 'failed' else 'done' end, finished_at = now()
   where platform = p->>'platform' and message_id = p->>'message_key';
  return jsonb_build_object('guardados', n);
end $function$;
