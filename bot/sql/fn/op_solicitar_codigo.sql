CREATE OR REPLACE FUNCTION ss.op_solicitar_codigo(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_pl text := j->>'platform';
  v_chat text := j->>'chat_id';
  v_email text;
  v_cta uuid;
  d_platform text;
  d_chat text;
  d_alc boolean;
  v_por_chat int;
  v_por_cuenta int;
  v_ultimo timestamptz;
  v_cod text;
  v_id text;
begin
  if (select y.user_id from ss.yo(v_pl, v_chat) y) is not null then
    return jsonb_build_object('estado', 'ya_vinculado');
  end if;
  v_email := lower(btrim(coalesce(j->>'email', (select pa.payload->>'email' from ss.pending_actions pa
     where pa.platform = v_pl and pa.chat_id = v_chat and pa.kind = 'link_code' order by pa.created_at desc limit 1))));
  select u.user_id into v_cta from public.users u where lower(btrim(u.email)) = v_email order by u.created_at limit 1;
  if v_cta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  select uc.platform, uc.chat_id, (uc.platform = 'telegram' or coalesce(uc.last_inbound_at > now() - interval '23 hours', false))
    into d_platform, d_chat, d_alc
    from public.user_channels uc
   where uc.user_id = v_cta and uc.verified_at is not null and uc.blocked_at is null
     and not (uc.platform = v_pl and uc.chat_id = v_chat)
   order by (uc.platform = 'telegram' or coalesce(uc.last_inbound_at > now() - interval '23 hours', false)) desc,
            uc.is_primary desc nulls last, uc.last_inbound_at desc nulls last
   limit 1;
  if d_chat is null then
    return jsonb_build_object('estado', 'sin_canal_destino');
  end if;
  select count(*) filter (where pa.created_at > now() - interval '1 hour'), max(pa.created_at)
    into v_por_chat, v_ultimo
    from ss.pending_actions pa where pa.kind = 'link_code' and pa.platform = v_pl and pa.chat_id = v_chat;
  select count(*) into v_por_cuenta from ss.pending_actions pa
   where pa.kind = 'link_code' and pa.user_id = v_cta and pa.created_at > now() - interval '1 day';
  if v_ultimo > now() - interval '60 seconds' then
    return jsonb_build_object('estado', 'espera', 'canal_destino', d_platform);
  end if;
  if v_por_chat >= 3 or v_por_cuenta >= 5 then
    return jsonb_build_object('estado', 'limite_intentos');
  end if;
  update ss.pending_actions set consumed_at = now()
   where kind = 'link_code' and platform = v_pl and chat_id = v_chat and consumed_at is null;
  v_cod := ss.codigo6(v_chat);
  v_id := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, code_hash, created_message_key, expires_at)
  values (v_id, v_cta, v_pl, v_chat, 'link_code',
          jsonb_build_object('email', v_email, 'dest_platform', d_platform, 'dest_chat_id', d_chat,
                             'entregado', d_alc, 'plataforma_nueva', v_pl),
          extensions.crypt(v_cod, extensions.gen_salt('bf')), j->>'message_key',
          now() + case when d_alc then interval '10 minutes' else interval '24 hours' end);
  return jsonb_build_object(
    'estado', case when d_alc then 'codigo_enviado' else 'canal_fuera_de_ventana' end,
    'canal_destino', d_platform, 'expira_min', 10,
    'envio', case when d_alc then jsonb_build_object('platform', d_platform, 'chat_id', d_chat, 'codigo', v_cod) end);
end $function$;
