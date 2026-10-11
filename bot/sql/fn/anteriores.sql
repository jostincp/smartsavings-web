CREATE OR REPLACE FUNCTION ss.anteriores(p jsonb)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  select count(*)::int from ss.processed_messages m
  where m.platform = p->>'platform' and m.chat_id = p->>'chat_id' and m.status = 'processing'
    and m.received_at < (select x.received_at from ss.processed_messages x
                         where x.platform = p->>'platform' and x.message_id = p->>'message_key')
    and m.received_at > now() - interval '2 minutes'
$function$;
