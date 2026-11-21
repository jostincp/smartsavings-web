CREATE OR REPLACE FUNCTION ss.op_canal_principal(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid; v_cid int;
  d_id int; d_pl text; d_vent boolean;
  a_id int; a_pl text; a_chat text;
begin
  select y.user_id, y.channel_id into v_uid, v_cid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  select uc.channel_id, uc.platform, (uc.platform = 'telegram' or coalesce(uc.last_inbound_at > now() - interval '23 hours', false))
    into d_id, d_pl, d_vent
    from public.user_channels uc
   where uc.user_id = v_uid and uc.verified_at is not null and uc.blocked_at is null
     and case when j->>'plataforma' = 'este' then uc.channel_id = v_cid else uc.platform = j->>'plataforma' end
   order by (uc.channel_id = v_cid) desc, uc.last_inbound_at desc nulls last
   limit 1;
  if d_id is null then
    return jsonb_build_object('estado', 'canal_no_vinculado', 'pedido', j->>'plataforma');
  end if;
  select uc.channel_id, uc.platform, uc.chat_id into a_id, a_pl, a_chat
    from public.user_channels uc where uc.user_id = v_uid and uc.is_primary order by uc.channel_id limit 1;
  if a_id = d_id then
    return jsonb_build_object('estado', 'ya_era', 'principal', d_pl, 'en_ventana', d_vent);
  end if;
  update public.user_channels set is_primary = false where user_id = v_uid and channel_id <> d_id and is_primary;
  update public.user_channels set is_primary = true where channel_id = d_id;
  insert into ss.events (user_id, kind, payload)
  values (v_uid, 'canal_principal', jsonb_build_object('antes', a_pl, 'ahora', d_pl));
  return jsonb_build_object('estado', 'ok', 'principal', d_pl, 'en_ventana', d_vent,
    'anterior', case when a_id is not null and a_id <> v_cid
                     then jsonb_build_object('platform', a_pl, 'chat_id', a_chat) end,
    'anterior_platform', a_pl);
end $function$;
