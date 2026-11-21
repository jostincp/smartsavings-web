CREATE OR REPLACE FUNCTION ss.op_verificar_codigo(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_pl text := j->>'platform';
  v_chat text := j->>'chat_id';
  v_pa record;
  v_ok boolean;
  v_cid int;
  v_av text;
  u_attempts int;
  u_expires timestamptz;
  u_consumed timestamptz;
  u_entregado boolean;
begin
  select pa.id, pa.user_id, pa.code_hash, pa.attempts, pa.payload into v_pa
    from ss.pending_actions pa
   where pa.platform = v_pl and pa.chat_id = v_chat and pa.kind = 'link_code' and pa.consumed_at is null
     and pa.expires_at > now() and pa.attempts < 5 and coalesce((pa.payload->>'entregado')::boolean, false)
   order by pa.created_at desc limit 1 for update;
  if not found then
    select pa.attempts, pa.expires_at, pa.consumed_at, coalesce((pa.payload->>'entregado')::boolean, false)
      into u_attempts, u_expires, u_consumed, u_entregado
      from ss.pending_actions pa where pa.platform = v_pl and pa.chat_id = v_chat and pa.kind = 'link_code'
     order by pa.created_at desc limit 1;
    return jsonb_build_object('estado', case
        when u_expires is null or u_consumed is not null then 'sin_solicitud'
        when u_attempts >= 5 then 'bloqueado'
        when u_expires <= now() then 'expirado'
        when not u_entregado then 'no_entregado'
        else 'sin_solicitud' end);
  end if;
  v_ok := v_pa.code_hash = extensions.crypt(coalesce(j->>'codigo', ''), v_pa.code_hash);
  update ss.pending_actions
     set attempts = attempts + 1,
         consumed_at = case when v_ok then now() end,
         consumed_message_key = case when v_ok then j->>'message_key' end
   where id = v_pa.id;
  if not v_ok then
    return jsonb_build_object('estado', 'incorrecto', 'intentos_restantes', greatest(0, 4 - v_pa.attempts));
  end if;
  if (select y.user_id from ss.yo(v_pl, v_chat) y) is not null then
    return jsonb_build_object('estado', 'chat_en_otra_cuenta');
  end if;
  insert into public.user_channels (user_id, platform, chat_id, verified_at, is_primary, created_at, last_inbound_at)
  values (v_pa.user_id, v_pl, v_chat, now(), false, now(), now())
  on conflict (platform, chat_id) do update
     set user_id = excluded.user_id, verified_at = now(), is_primary = false, last_inbound_at = now()
   where public.user_channels.verified_at is null
  returning channel_id into v_cid;
  if v_cid is null then
    return jsonb_build_object('estado', 'chat_en_otra_cuenta');
  end if;
  v_av := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
  values (v_av, v_pa.user_id, v_pa.payload->>'dest_platform', v_pa.payload->>'dest_chat_id', 'link_notice',
          jsonb_build_object('channel_id', v_cid, 'plataforma', v_pl), j->>'message_key', now() + interval '24 hours');
  update ss.chat_memory set session_id = 'x:' || session_id where session_id = 'c:' || v_pl || ':' || v_chat;
  update ss.pending_actions set user_id = v_pa.user_id
   where platform = v_pl and chat_id = v_chat and user_id is null and consumed_at is null;
  insert into ss.events (user_id, kind, payload)
  values (v_pa.user_id, 'canal_vinculado', jsonb_build_object('platform', v_pl, 'channel_id', v_cid));
  return jsonb_build_object('estado', 'vinculado',
    'nombre', (select u.name from public.users u where u.user_id = v_pa.user_id),
    'canal_principal', (select uc.platform from public.user_channels uc where uc.user_id = v_pa.user_id and uc.is_primary limit 1),
    'aviso', jsonb_build_object('id', v_av, 'platform', v_pa.payload->>'dest_platform', 'chat_id', v_pa.payload->>'dest_chat_id'));
end $function$;
