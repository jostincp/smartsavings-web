CREATE OR REPLACE FUNCTION ss.falla_envio(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  insert into ss.events (user_id, kind, payload)
  values ((select y.user_id from ss.yo(p->>'platform', p->>'chat_id') y), 'envio_fallido',
          jsonb_build_object('platform', p->>'platform', 'codigo', p->>'codigo',
                             'detalle', left(p->>'detalle', 300), 'mk', p->>'message_key'));
  if p->>'codigo' = '403' and p->>'platform' = 'telegram' then
    update public.user_channels set blocked_at = now()
     where platform = 'telegram' and chat_id = p->>'chat_id';
  end if;
  return jsonb_build_object('ok', true);
end $function$;
