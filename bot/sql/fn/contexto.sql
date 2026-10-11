CREATE OR REPLACE FUNCTION ss.contexto(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_pl text := p->>'platform';
  v_chat text := p->>'chat_id';
  v_uid uuid;
  v_cid int;
  v_sid text;
  v_entregas jsonb := '[]'::jsonb;
  v_pa record;
  v_cod text;
begin
  select y.user_id, y.channel_id into v_uid, v_cid from ss.yo(v_pl, v_chat) y;
  if v_cid is not null and coalesce((p->>'real')::boolean, false) then
    update public.user_channels set last_inbound_at = now(), blocked_at = null where channel_id = v_cid;
  end if;
  v_sid := coalesce('u:' || v_uid::text, 'c:' || v_pl || ':' || v_chat);

  -- Entrega diferida: este chat es el destino de un código que no se pudo mandar (WhatsApp fuera de ventana)
  if v_cid is not null then
    for v_pa in
      select pa.id, pa.chat_id, pa.payload from ss.pending_actions pa
       where pa.kind = 'link_code' and pa.consumed_at is null and pa.expires_at > now()
         and pa.payload->>'dest_platform' = v_pl and pa.payload->>'dest_chat_id' = v_chat
         and coalesce((pa.payload->>'entregado')::boolean, false) = false
       for update
    loop
      v_cod := ss.codigo6(v_pa.chat_id);
      update ss.pending_actions
         set code_hash = extensions.crypt(v_cod, extensions.gen_salt('bf')),
             payload = payload || '{"entregado": true}'::jsonb,
             expires_at = now() + interval '10 minutes'
       where id = v_pa.id;
      v_entregas := v_entregas || jsonb_build_array(jsonb_build_object('para', v_pa.payload->>'plataforma_nueva', 'codigo', v_cod));
    end loop;
  end if;

  return jsonb_build_object(
    'registrado', v_uid is not null,
    'nombre', (select u.name from public.users u where u.user_id = v_uid),
    'prefs', (select u.notify_prefs from public.users u where u.user_id = v_uid),
    'canales', (select coalesce(jsonb_agg(jsonb_build_object(
          'platform', uc.platform, 'principal', coalesce(uc.is_primary, false),
          'en_ventana', uc.platform = 'telegram' or coalesce(uc.last_inbound_at > now() - interval '23 hours', false),
          'es_este', uc.channel_id = v_cid) order by uc.is_primary desc nulls last, uc.channel_id), '[]'::jsonb)
       from public.user_channels uc where uc.user_id = v_uid and uc.verified_at is not null),
    'ultimos', (select coalesce(jsonb_agg(x order by x.orden), '[]'::jsonb) from (
       select tx.id as ref,
              coalesce((select min(t2.id) from public.transactions t2 where t2.user_id = tx.user_id and t2.batch_id = tx.batch_id), tx.id) as lote,
              tx.source_message_key as mk,
              to_char((tx.transaction_date at time zone 'UTC') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as fecha,
              tx.type as tipo, tx.amount as monto, tx.currency as moneda, tx.amount_cop as cop, tx.category as categoria,
              left(tx.description, 60) as descripcion, tx.store_name as comercio, tx.payment_method as medio,
              floor(extract(epoch from (now() at time zone 'UTC') - tx.created_at) / 60)::int as hace_min,
              row_number() over (order by tx.created_at desc, tx.id desc) as orden
         from public.transactions tx where tx.user_id = v_uid
        order by tx.created_at desc, tx.id desc limit 8) x),
    'pendientes', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', pa.id, 'kind', pa.kind, 'payload', pa.payload - 'email', 'creado_en', pa.created_message_key,
          'vence_min', ceil(extract(epoch from pa.expires_at - now()) / 60)::int) order by pa.created_at), '[]'::jsonb)
       from ss.pending_actions pa
      where pa.platform = v_pl and pa.chat_id = v_chat and pa.consumed_at is null
        and pa.expires_at > now() and pa.kind <> 'link_code'),
    'vinculacion', (select jsonb_build_object(
          'entregado', coalesce((pa.payload->>'entregado')::boolean, false), 'destino', pa.payload->>'dest_platform',
          'intentos_restantes', 5 - pa.attempts, 'vence_min', ceil(extract(epoch from pa.expires_at - now()) / 60)::int)
       from ss.pending_actions pa
      where pa.platform = v_pl and pa.chat_id = v_chat and pa.kind = 'link_code'
        and pa.consumed_at is null and pa.expires_at > now()
      order by pa.created_at desc limit 1),
    'codigos_a_entregar', v_entregas,
    'ultimo_proactivo', (select jsonb_build_object('tipo', e.kind, 'hace_min', floor(extract(epoch from now() - e.created_at) / 60)::int,
          'texto', e.payload->>'texto')
       from ss.events e where e.user_id = v_uid and e.kind like 'proactivo_%' and e.status = 'enviado'
        and e.created_at > now() - interval '6 hours' order by e.created_at desc limit 1),
    'avisos_sin_entregar', (select count(*)::int from ss.events e where e.user_id = v_uid and e.kind like 'proactivo_%'
        and e.status in ('omitido', 'fallido') and e.created_at > now() - interval '3 days'),
    'historial', (select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content, 'mk', m.message_key,
          'hechos', m.hechos, 'hace_min', floor(extract(epoch from now() - m.created_at) / 60)::int) order by m.id), '[]'::jsonb)
       from (select * from ss.chat_memory cm where cm.session_id = v_sid order by cm.id desc limit 16) m),
    'minutos_desde_ultimo', (select floor(extract(epoch from now() - max(cm.created_at)) / 60)::int
       from ss.chat_memory cm where cm.session_id = v_sid and cm.role = 'persona'),
    'movimientos_editados', case when p->>'editado_de' is null then null else
       (select jsonb_agg(jsonb_build_object('ref', tx.id, 'monto', tx.amount, 'descripcion', tx.description))
          from public.transactions tx where tx.user_id = v_uid and tx.source_message_key = p->>'editado_de') end,
    'tasas', (select coalesce(jsonb_object_agg(x.base, jsonb_build_object('fecha', x.rate_date, 'tasa', x.rate)), '{}'::jsonb)
       from (select distinct on (fr.base) fr.base, fr.rate_date, fr.rate from ss.fx_rates fr order by fr.base, fr.rate_date desc) x),
    'deuda_tarjeta', case when v_uid is null then null else ss.deuda_tarjeta(v_uid) end,
    'config', (select coalesce(jsonb_object_agg(c.k, c.v), '{}'::jsonb) from ss.config c),
    'ahora', to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS')
  );
end $function$;
