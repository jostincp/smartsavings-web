CREATE OR REPLACE FUNCTION ss.falla_proactiva(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  update ss.events
     set status = 'fallido',
         payload = payload || jsonb_build_object('error', left(p->>'detalle', 300), 'codigo', p->>'codigo')
   where id = (p->>'evento_id')::bigint;
  if p->>'codigo' = '403' then
    update public.user_channels set blocked_at = now() where platform = 'telegram' and chat_id = p->>'chat_id';
  end if;
  return jsonb_build_object('ok', true);
end $function$;
