CREATE OR REPLACE FUNCTION ss.op_crear_cuenta(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_pl text := j->>'platform';
  v_chat text := j->>'chat_id';
  v_email text := lower(btrim(j->>'email'));
  v_nombre text := nullif(btrim(j->>'nombre'), '');
  v_ex uuid;
  v_uid uuid;
  v_n int;
begin
  if (select y.user_id from ss.yo(v_pl, v_chat) y) is not null then
    return jsonb_build_object('estado', 'ya_vinculado');
  end if;
  select count(*) into v_n from ss.events e
   where e.kind = 'alta_intento' and e.payload->>'chat' = v_pl || ':' || v_chat and e.created_at > now() - interval '1 hour';
  if v_n >= 5 then
    return jsonb_build_object('estado', 'limite_intentos');
  end if;
  insert into ss.events (kind, payload) values ('alta_intento', jsonb_build_object('chat', v_pl || ':' || v_chat));
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$' or length(v_email) > 254 then
    return jsonb_build_object('estado', 'correo_invalido');
  end if;
  select u.user_id into v_ex from public.users u where lower(btrim(u.email)) = v_email order by u.created_at limit 1;
  if v_ex is not null then
    -- Cuenta creada por los flujos viejos desde este mismo chat: se verifica el chat directamente
    if exists (select 1 from public.user_channels uc where uc.platform = v_pl and uc.chat_id = v_chat
                and uc.user_id = v_ex and uc.verified_at is null) then
      update public.user_channels set verified_at = now(), last_inbound_at = now()
       where platform = v_pl and chat_id = v_chat and user_id = v_ex;
      update ss.chat_memory set session_id = 'u:' || v_ex::text where session_id = 'c:' || v_pl || ':' || v_chat;
      return jsonb_build_object('estado', 'recuperada', 'nombre', (select u.name from public.users u where u.user_id = v_ex));
    end if;
    return jsonb_build_object('estado', 'correo_existente',
      'codigo', ss.op_solicitar_codigo(j || jsonb_build_object('email', v_email)));
  end if;
  if v_nombre is null then
    return jsonb_build_object('estado', 'falta_nombre');
  end if;
  if exists (select 1 from public.user_channels uc where uc.platform = v_pl and uc.chat_id = v_chat) then
    return jsonb_build_object('estado', 'chat_en_uso');
  end if;
  insert into public.users (email, name, phone, created_at, updated_at)
  values (v_email, left(v_nombre, 40), case when v_pl = 'whatsapp' and v_chat !~ '^qa-' then v_chat end, now(), now())
  on conflict (email) do nothing
  returning user_id into v_uid;
  if v_uid is null then
    return jsonb_build_object('estado', 'no_creada');
  end if;
  insert into public.user_channels (user_id, platform, chat_id, verified_at, is_primary, created_at, last_inbound_at)
  values (v_uid, v_pl, v_chat, now(), true, now(), now());
  update ss.chat_memory set session_id = 'u:' || v_uid::text where session_id = 'c:' || v_pl || ':' || v_chat;
  update ss.pending_actions set user_id = v_uid
   where platform = v_pl and chat_id = v_chat and user_id is null and consumed_at is null;
  insert into ss.events (user_id, kind, payload) values (v_uid, 'cuenta_creada', jsonb_build_object('platform', v_pl));
  return jsonb_build_object('estado', 'creada', 'nombre', left(v_nombre, 40));
end $function$;
