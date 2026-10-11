CREATE OR REPLACE FUNCTION ss.desvincular_canal(p_uid uuid, p_cid_actual integer, p_channel integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_pl text; v_prim boolean;
begin
  if p_channel is null or p_channel = p_cid_actual then
    return jsonb_build_object('desvinculado', null, 'motivo', 'es_este_canal');
  end if;
  select uc.platform, coalesce(uc.is_primary, false) into v_pl, v_prim
    from public.user_channels uc where uc.user_id = p_uid and uc.channel_id = p_channel and uc.verified_at is not null;
  if v_pl is null then
    return jsonb_build_object('desvinculado', null, 'motivo', 'no_encontrado');
  end if;
  -- se quita la verificación (no se borra la fila: puede tener movimientos asociados)
  update public.user_channels set verified_at = null, is_primary = false where channel_id = p_channel;
  if v_prim then
    update public.user_channels set is_primary = true where channel_id = p_cid_actual;
  end if;
  update ss.pending_actions set consumed_at = now()
   where user_id = p_uid and consumed_at is null and kind in ('link_code', 'link_notice')
     and platform = v_pl and chat_id = (select uc.chat_id from public.user_channels uc where uc.channel_id = p_channel);
  insert into ss.events (user_id, kind, payload)
  values (p_uid, 'alerta_seguridad', jsonb_build_object('resumen', 'La persona dijo «no fui yo»: se desvinculó un canal ' || v_pl,
                                                        'channel_id', p_channel));
  return jsonb_build_object('desvinculado', v_pl, 'era_principal', v_prim,
    'admin_chat_id', (select c.v #>> '{}' from ss.config c where c.k = 'admin_chat_id'));
end $function$;
