-- ss_91: arreglos de la revisión adversarial

CREATE OR REPLACE FUNCTION ss.cat_norm(t text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$ select lower(translate(btrim(coalesce(t, '')), 'ÁÉÍÓÚáéíóúÜüÑñ', 'AEIOUaeiouUuNn')) $function$;

CREATE OR REPLACE FUNCTION ss.op_consultar(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  b_ini timestamp := ss.utc_de(j->>'ini');
  b_fin timestamp := ss.utc_de(j->>'fin');
  b_aini timestamp := ss.utc_de(j->>'ant_ini');
  b_afin timestamp := ss.utc_de(j->>'ant_fin');
  v_comp boolean := coalesce((j->>'comparar')::boolean, false) and j->>'ant_ini' is not null;
  v_tot jsonb;
  v_grp jsonb;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;
  with mv as (
    select tx.type, tx.category, coalesce(nullif(tx.store_name, ''), tx.description) as comercio, tx.description,
           ss.fecha_bog(tx.transaction_date) as dia, tx.amount_cop as cop, tx.payment_method,
           case when tx.transaction_date >= b_ini and tx.transaction_date < b_fin then 'act' else 'ant' end as tramo
      from public.transactions tx
     where tx.user_id = v_uid
       and ((tx.transaction_date >= b_ini and tx.transaction_date < b_fin)
            or (v_comp and tx.transaction_date >= b_aini and tx.transaction_date < b_afin))
       and (jsonb_typeof(j->'categorias') is distinct from 'array'
            or ss.cat_norm(tx.category) in (select ss.cat_norm(x) from jsonb_array_elements_text(j->'categorias') x))
       and (j->>'tipo' is null or tx.type = j->>'tipo'))
  select
    (select coalesce(jsonb_agg(jsonb_build_object('tramo', a.tramo, 'tipo', a.type, 'total', a.total, 'n', a.n,
              'con_credito', a.credito)), '[]'::jsonb)
       from (select mv.tramo, mv.type, sum(mv.cop) as total, count(*) as n,
                    sum(mv.cop) filter (where mv.payment_method = 'credito') as credito
               from mv group by 1, 2) a),
    (select coalesce(jsonb_agg(g order by g.total desc nulls last), '[]'::jsonb) from (
       select case j->>'agrupar' when 'categoria' then mv.category when 'comercio' then mv.comercio
                   when 'descripcion' then mv.description when 'dia' then mv.dia::text end as clave,
              mv.type as tipo,
              sum(mv.cop) filter (where mv.tramo = 'act') as total,
              count(*) filter (where mv.tramo = 'act') as n,
              sum(mv.cop) filter (where mv.tramo = 'ant') as total_ant
         from mv where j->>'agrupar' is not null
        group by 1, 2 order by 3 desc nulls last limit 31) g)
  into v_tot, v_grp;
  return jsonb_build_object('ok', true, 'totales', v_tot, 'grupos', v_grp, 'deuda_tarjeta', ss.deuda_tarjeta(v_uid));
end $function$;

CREATE OR REPLACE FUNCTION ss.op_listar(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_items jsonb;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;
  select coalesce(jsonb_agg(x order by x.orden), '[]'::jsonb) into v_items from (
    select tx.id as ref,
           to_char((tx.transaction_date at time zone 'UTC') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') as fecha,
           tx.type as tipo, tx.amount as monto, tx.currency as moneda, tx.amount_cop as cop, tx.category as categoria,
           left(tx.description, 80) as descripcion, tx.store_name as comercio, tx.payment_method as medio,
           row_number() over (order by tx.transaction_date desc, tx.id desc) as orden
      from public.transactions tx
     where tx.user_id = v_uid
       and tx.transaction_date >= ss.utc_de(j->>'ini') and tx.transaction_date < ss.utc_de(j->>'fin')
       and (jsonb_typeof(j->'categorias') is distinct from 'array'
            or ss.cat_norm(tx.category) in (select ss.cat_norm(x) from jsonb_array_elements_text(j->'categorias') x))
       and (j->>'tipo' is null or tx.type = j->>'tipo')
       and (j->>'texto' is null or tx.description ilike '%' || (j->>'texto') || '%' escape '\'
            or tx.store_name ilike '%' || (j->>'texto') || '%' escape '\')
     order by tx.transaction_date desc, tx.id desc
     limit least(greatest(coalesce((j->>'limite')::int, 10), 1), 20)) x;
  return jsonb_build_object('ok', true, 'items', v_items);
end $function$;

CREATE OR REPLACE FUNCTION ss.op_corregir(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  c jsonb := coalesce(j->'cambios', '{}'::jsonb);
  v_n int;
  v_cand jsonb;
  t record;
  n_amount numeric;
  n_currency text;
  n_rate numeric;
  n_cop numeric;
  n_source text;
  n_date timestamp;
  v_pide boolean;
  v_pa text;
  v_desp jsonb;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if j ? 'pa_req' and not exists (select 1 from ss.pending_actions x
       where x.id = j->>'pa_req' and x.consumed_message_key = j->>'message_key') then
    return jsonb_build_object('estado', 'pendiente_no_confirmado');
  end if;
  select count(*), jsonb_agg(jsonb_build_object('ref', x.id, 'fecha', ss.fecha_bog(x.transaction_date),
           'descripcion', x.description, 'cop', x.amount_cop))
    into v_n, v_cand
    from (select tx.id, tx.transaction_date, tx.description, tx.amount_cop
            from public.transactions tx
           where tx.user_id = v_uid and (
                 (j ? 'ref' and tx.id = (j->>'ref')::int)
              or (not j ? 'ref' and j ? 'editado_de' and tx.source_message_key = j->>'editado_de')
              or (not j ? 'ref' and not j ? 'editado_de' and j ? 'sel_ini'
                  and tx.transaction_date >= ss.utc_de(j->>'sel_ini') and tx.transaction_date < ss.utc_de(j->>'sel_fin')
                  and (j->>'sel_texto' is null or tx.description ilike '%' || (j->>'sel_texto') || '%' escape '\'
                       or tx.store_name ilike '%' || (j->>'sel_texto') || '%' escape '\')
                  and (j->>'sel_categoria' is null or ss.cat_norm(tx.category) = ss.cat_norm(j->>'sel_categoria') or ss.cat_norm(tx.category) in (select ss.cat_norm(x) from jsonb_array_elements_text(coalesce(j->'sel_categorias', '[]'::jsonb)) x))))
           order by tx.transaction_date desc, tx.id desc limit 6) x;
  if v_n = 0 then
    return jsonb_build_object('estado', 'no_encontrado');
  end if;
  if v_n > 1 then
    return jsonb_build_object('estado', 'ambiguo', 'candidatos', v_cand);
  end if;
  select tx.* into t from public.transactions tx where tx.user_id = v_uid and tx.id = (v_cand->0->>'ref')::int for update;
  n_amount := coalesce((c->>'monto')::numeric, t.amount);
  n_currency := coalesce(c->>'moneda', t.currency, 'COP');
  if c ? 'monto_cop' then
    n_cop := (c->>'monto_cop')::numeric;
    n_rate := round(n_cop / nullif(n_amount, 0), 6);
    n_source := 'banco';
  elsif n_currency = 'COP' then
    n_rate := 1; n_source := 'cop'; n_cop := n_amount;
  elsif n_currency = t.currency and t.fx_rate is not null then
    n_rate := t.fx_rate; n_source := t.fx_source; n_cop := round(n_amount * n_rate, 2);
  else
    select x.rate, x.source into n_rate, n_source from ss.fx_rates x
     where x.base = n_currency and x.quote = 'COP'
     order by abs(x.rate_date - coalesce(t.fx_date, current_date)) limit 1;
    n_cop := round(n_amount * n_rate, 2);
  end if;
  if n_rate is null then
    return jsonb_build_object('estado', 'tasa_no_disponible');
  end if;
  v_pide := not (j ? 'pa_req') and (
       (c ? 'monto' and t.amount > 0 and (n_amount / t.amount >= 10 or n_amount / t.amount <= 0.1))
    or (c ? 'tipo' and c->>'tipo' <> t.type)
    or t.transaction_date < (now() at time zone 'UTC') - interval '90 days');
  if v_pide then
    v_pa := ss.nuevo_id();
    insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
    values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'tx_update',
            jsonb_build_object('ref', t.id, 'cambios', c,
              'antes', jsonb_build_object('descripcion', t.description, 'cop', t.amount_cop, 'monto', t.amount, 'moneda', t.currency)),
            j->>'message_key', now() + interval '10 minutes');
    return jsonb_build_object('estado', 'requiere_confirmacion', 'pendiente_id', v_pa,
      'antes', jsonb_build_object('monto', t.amount, 'moneda', t.currency, 'cop', t.amount_cop, 'categoria', t.category,
                                  'descripcion', t.description, 'tipo', t.type),
      'cambios', c);
  end if;
  n_date := case when c ? 'fecha'
                 then (((c->>'fecha')::date + time '12:00') at time zone 'America/Bogota') at time zone 'UTC'
                 else t.transaction_date end;
  update public.transactions tx
     set amount = n_amount, currency = n_currency, amount_cop = n_cop, fx_rate = n_rate, fx_source = n_source,
         category = coalesce(c->>'categoria', tx.category),
         description = coalesce(left(c->>'descripcion', 100), tx.description),
         type = coalesce(c->>'tipo', tx.type),
         transaction_date = n_date,
         payment_method = case when c ? 'medio' then nullif(c->>'medio', 'ninguno') else tx.payment_method end,
         fx_date = case when c ? 'fecha' and n_currency = 'COP' then (c->>'fecha')::date else tx.fx_date end
   where tx.id = t.id and tx.user_id = v_uid;
  select jsonb_build_object('ref', tx.id, 'monto', tx.amount, 'moneda', tx.currency, 'cop', tx.amount_cop,
           'categoria', tx.category, 'descripcion', tx.description, 'tipo', tx.type, 'medio', tx.payment_method,
           'fecha', ss.fecha_bog(tx.transaction_date), 'tasa', tx.fx_rate, 'fuente', tx.fx_source)
    into v_desp from public.transactions tx where tx.id = t.id;
  insert into ss.events (user_id, kind, payload)
  values (v_uid, 'tx_update', jsonb_build_object('antes', to_jsonb(t), 'despues', v_desp, 'mk', j->>'message_key'));
  return jsonb_build_object('estado', 'corregido',
    'antes', jsonb_build_object('monto', t.amount, 'moneda', t.currency, 'cop', t.amount_cop, 'categoria', t.category,
                                'descripcion', t.description, 'tipo', t.type, 'fecha', ss.fecha_bog(t.transaction_date)),
    'despues', v_desp);
end $function$;

CREATE OR REPLACE FUNCTION ss.op_preparar_borrado(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_ids int[];
  v_items jsonb;
  v_total numeric;
  v_pa text;
  v_batch uuid;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if to_regprocedure('ss.borrar_movimientos(uuid,integer[],text)') is null then
    return jsonb_build_object('estado', 'no_disponible');
  end if;
  if j ? 'lote_de' then
    select tx.batch_id into v_batch from public.transactions tx where tx.user_id = v_uid and tx.id = (j->>'lote_de')::int;
  end if;
  select array_agg(x.id order by x.id),
         jsonb_agg(jsonb_build_object('ref', x.id, 'descripcion', x.description, 'cop', x.amount_cop, 'monto', x.amount,
                   'moneda', x.currency, 'tipo', x.type, 'fecha', ss.fecha_bog(x.transaction_date)) order by x.id),
         sum(x.amount_cop)
    into v_ids, v_items, v_total
    from (select tx.id, tx.description, tx.amount_cop, tx.amount, tx.currency, tx.type, tx.transaction_date
            from public.transactions tx
           where tx.user_id = v_uid and (
                 tx.id in (select jsonb_array_elements_text(coalesce(j->'refs', '[]'::jsonb))::int)
              or (v_batch is not null and tx.batch_id = v_batch)
              or (j ? 'lote_de' and v_batch is null and tx.id = (j->>'lote_de')::int)
              or (j ? 'sel_ini'
                  and tx.transaction_date >= ss.utc_de(j->>'sel_ini') and tx.transaction_date < ss.utc_de(j->>'sel_fin')
                  and (j->>'sel_texto' is null or tx.description ilike '%' || (j->>'sel_texto') || '%' escape '\'
                       or tx.store_name ilike '%' || (j->>'sel_texto') || '%' escape '\')
                  and (j->>'sel_categoria' is null or ss.cat_norm(tx.category) = ss.cat_norm(j->>'sel_categoria') or ss.cat_norm(tx.category) in (select ss.cat_norm(x) from jsonb_array_elements_text(coalesce(j->'sel_categorias', '[]'::jsonb)) x))))
           order by tx.id limit 21) x;
  if v_ids is null then
    return jsonb_build_object('estado', 'no_encontrado');
  end if;
  if array_length(v_ids, 1) > 20 then
    return jsonb_build_object('estado', 'demasiados');
  end if;
  update ss.pending_actions set consumed_at = now()
   where platform = j->>'platform' and chat_id = j->>'chat_id' and kind = 'delete_confirm' and consumed_at is null;
  v_pa := ss.nuevo_id();
  insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
  values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'delete_confirm',
          jsonb_build_object('ids', to_jsonb(v_ids), 'items', v_items, 'total_cop', v_total),
          j->>'message_key', now() + interval '10 minutes');
  return jsonb_build_object('estado', 'preparado', 'pendiente_id', v_pa, 'items', v_items, 'total_cop', v_total,
                            'n', array_length(v_ids, 1));
end $function$;

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
                and uc.user_id = v_ex and uc.verified_at is null)
       and not exists (select 1 from public.user_channels o where o.user_id = v_ex and o.verified_at is not null)
       and not exists (select 1 from ss.events e join public.user_channels uc2 on uc2.channel_id = (e.payload->>'channel_id')::int
                        where e.kind = 'alerta_seguridad' and uc2.platform = v_pl and uc2.chat_id = v_chat) then
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
  if exists (select 1 from public.user_channels uc where uc.platform = v_pl and uc.chat_id = v_chat and uc.verified_at is not null) then
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
  values (v_uid, v_pl, v_chat, now(), true, now(), now())
  on conflict (platform, chat_id) do update set user_id = excluded.user_id, verified_at = now(), is_primary = true,
     last_inbound_at = now(), blocked_at = null
  where public.user_channels.verified_at is null;
  update ss.chat_memory set session_id = 'u:' || v_uid::text where session_id = 'c:' || v_pl || ':' || v_chat;
  update ss.pending_actions set user_id = v_uid
   where platform = v_pl and chat_id = v_chat and user_id is null and consumed_at is null;
  insert into ss.events (user_id, kind, payload) values (v_uid, 'cuenta_creada', jsonb_build_object('platform', v_pl));
  return jsonb_build_object('estado', 'creada', 'nombre', left(v_nombre, 40));
end $function$;

CREATE OR REPLACE FUNCTION ss.op_pago_tarjeta(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_deuda numeric;
  v_monto numeric := (j->>'monto')::numeric;
  v_int numeric := coalesce((j->>'intereses')::numeric, 0);
  v_abono numeric;
  v_cub numeric;
  v_exc numeric;
  v_items jsonb := '[]'::jsonb;
  v_reg jsonb;
  v_pa text;
  v_sin_medio numeric := 0;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_monto is null or v_monto <= 0 or v_int < 0 or v_int >= v_monto then
    raise exception 'op_pago_tarjeta: montos invalidos';
  end if;
  v_deuda := ss.deuda_tarjeta(v_uid);
  v_abono := v_monto - v_int;
  if v_deuda >= v_abono - 1000 then
    v_cub := v_abono; v_exc := 0;
  else
    v_cub := greatest(v_deuda, 0); v_exc := v_abono - v_cub;
  end if;
  if v_cub > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('idx', 1, 'type', 'transfer', 'amount', v_cub, 'currency', 'COP',
      'category', 'Pago de Tarjeta', 'description', 'Pago tarjeta de crédito', 'fecha_local', j->>'fecha_local',
      'payment_method', j->>'medio'));
  end if;
  if v_int > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('idx', 2, 'type', 'expense', 'amount', v_int, 'currency', 'COP',
      'category', 'Deudas y Préstamos', 'description', 'Intereses y cuota de manejo de la tarjeta', 'fecha_local', j->>'fecha_local',
      'payment_method', j->>'medio'));
  end if;
  if jsonb_array_length(v_items) > 0 then
    v_reg := ss.op_registrar(j || jsonb_build_object('items', v_items));
    if not coalesce((v_reg->>'ok')::boolean, false) then
      return jsonb_build_object('estado', 'no_guardado', 'motivo', v_reg->>'motivo', 'registro', v_reg);
    end if;
  end if;
  if v_exc > 0 then
    select coalesce(sum(tx.amount_cop), 0) into v_sin_medio from public.transactions tx
     where tx.user_id = v_uid and tx.type = 'expense' and tx.payment_method is null
       and tx.transaction_date > (now() at time zone 'UTC') - interval '60 days';
  end if;
  if v_exc > 0 then
    v_pa := ss.nuevo_id();
    insert into ss.pending_actions (id, user_id, platform, chat_id, kind, payload, created_message_key, expires_at)
    values (v_pa, v_uid, j->>'platform', j->>'chat_id', 'tx_confirm',
            jsonb_build_object('motivo', 'exceso_tarjeta', 'items', jsonb_build_array(jsonb_build_object(
              'idx', 1, 'type', 'expense', 'amount', v_exc, 'currency', 'COP', 'category', 'Deudas y Préstamos',
              'description', 'Compras con tarjeta que no estaban anotadas', 'fecha_local', j->>'fecha_local'))),
            j->>'message_key', now() + interval '30 minutes');
  end if;
  return jsonb_build_object('estado', case when v_exc > 0 then 'excede' else 'abonado' end,
    'pagado', v_monto, 'abono', v_cub, 'intereses', v_int, 'exceso', v_exc,
    'deuda_antes', v_deuda, 'deuda_despues', greatest(v_deuda - v_cub, 0),
    'pendiente_id', v_pa, 'registro', v_reg,
    'guardado', coalesce(jsonb_array_length(v_reg->'guardados'), 0) > 0,
    'posibles_ya_anotadas', case when v_sin_medio > 0 then least(v_sin_medio, v_exc) end);
end $function$;

CREATE OR REPLACE FUNCTION ss.op_confirmar_pendiente(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_cid int;
  v_kind text;
  v_payload jsonb;
  u_consumed timestamptz;
  u_expires timestamptz;
  u_mk text;
  v_items jsonb;
  v_r jsonb;
  v_excl int[];
begin
  select y.user_id, y.channel_id into v_uid, v_cid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update ss.pending_actions x set consumed_at = now(), consumed_message_key = j->>'message_key'
   where x.id = j->>'pa_id' and x.platform = j->>'platform' and x.chat_id = j->>'chat_id'
     and (x.user_id = v_uid or (x.user_id is null and x.kind = 'receipt_draft'))
     and x.consumed_at is null and x.expires_at > now() and x.created_message_key <> j->>'message_key'
     and x.kind in ('delete_confirm', 'tx_confirm', 'tx_update', 'receipt_draft', 'link_notice')
  returning x.kind, x.payload into v_kind, v_payload;
  if v_kind is null then
    select x.consumed_at, x.expires_at, x.created_message_key into u_consumed, u_expires, u_mk
      from ss.pending_actions x where x.id = j->>'pa_id' and x.platform = j->>'platform' and x.chat_id = j->>'chat_id';
    return jsonb_build_object('estado', case when u_mk is null then 'no_encontrado'
                                             when u_mk = j->>'message_key' then 'mismo_mensaje'
                                             when u_consumed is not null then 'ya_usado'
                                             when u_expires <= now() then 'expirado'
                                             else 'no_encontrado' end);
  end if;
  if v_kind = 'delete_confirm' then
    return jsonb_build_object('estado', 'delete_confirm')
        || ss.borrar_movimientos(v_uid, array(select jsonb_array_elements_text(v_payload->'ids')::int), j->>'message_key');
  elsif v_kind = 'link_notice' then
    return jsonb_build_object('estado', 'link_notice')
        || ss.desvincular_canal(v_uid, v_cid, (v_payload->>'channel_id')::int);
  elsif v_kind = 'tx_confirm' then
    v_r := ss.op_registrar(j || jsonb_build_object('items', v_payload->'items', 'pa_req', j->>'pa_id'));
    if jsonb_array_length(coalesce(v_r->'sin_tasa', '[]'::jsonb)) > 0 and jsonb_array_length(coalesce(v_r->'guardados', '[]'::jsonb)) = 0 then
      update ss.pending_actions set consumed_at = null, consumed_message_key = null where id = j->>'pa_id';
      return jsonb_build_object('estado', 'tasa_no_disponible', 'moneda', coalesce(v_payload->>'moneda', v_payload#>>'{items,0,currency}'));
    end if;
    return jsonb_build_object('estado', 'tx_confirm', 'registro', v_r, 'motivo', v_payload->>'motivo');
  elsif v_kind = 'tx_update' then
    v_r := ss.op_corregir(j || jsonb_build_object('ref', (v_payload->>'ref')::int, 'cambios', v_payload->'cambios',
                                                  'pa_req', j->>'pa_id'));
    return jsonb_build_object('estado', 'tx_update', 'correccion', v_r);
  end if;
  -- receipt_draft: los montos salen del borrador guardado, nunca del modelo
  v_excl := array(select jsonb_array_elements_text(coalesce(j->'excluir', '[]'::jsonb))::int);
  if coalesce((j->>'usar_total_impreso')::boolean, false) then
    v_items := jsonb_build_array(jsonb_build_object('idx', 1, 'type', 'expense', 'amount', (v_payload->>'total')::numeric,
      'currency', coalesce(v_payload->>'moneda', 'COP'),
      'category', coalesce(v_payload->>'categoria_principal', 'Alimentación'),
      'description', left('Compra en ' || coalesce(v_payload->>'tienda', 'tienda'), 100),
      'store_name', v_payload->>'tienda', 'fecha_local', v_payload->>'fecha_ok', 'payment_method', nullif(j->>'medio', '')));
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'idx', e.ord, 'type', 'expense', 'amount', (e.it->>'precio')::numeric,
             'currency', coalesce(v_payload->>'moneda', 'COP'),
             'category', coalesce((select cb->>'categoria' from jsonb_array_elements(coalesce(j->'cambios', '[]'::jsonb)) cb
                                   where (cb->>'item')::int = e.ord limit 1), e.it->>'categoria'),
             'description', e.it->>'producto', 'store_name', v_payload->>'tienda', 'product_name', e.it->>'producto',
             'fecha_local', v_payload->>'fecha_ok', 'payment_method', nullif(j->>'medio', '')) order by e.ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) with ordinality as e(it, ord)
     where not (e.ord::int = any(v_excl));
  end if;
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('estado', 'receipt_draft', 'registro', jsonb_build_object('ok', false, 'motivo', 'sin_items'));
  end if;
  v_r := ss.op_registrar(j || jsonb_build_object('items', v_items, 'pa_req', j->>'pa_id'));
  if jsonb_array_length(coalesce(v_r->'sin_tasa', '[]'::jsonb)) > 0 and jsonb_array_length(coalesce(v_r->'guardados', '[]'::jsonb)) = 0 then
    update ss.pending_actions set consumed_at = null, consumed_message_key = null where id = j->>'pa_id';
    return jsonb_build_object('estado', 'tasa_no_disponible', 'moneda', coalesce(v_payload->>'moneda', v_payload#>>'{items,0,currency}'));
  end if;
  return jsonb_build_object('estado', 'receipt_draft', 'registro', v_r, 'tienda', v_payload->>'tienda',
                            'excluidos', to_jsonb(v_excl));
end $function$;

CREATE OR REPLACE FUNCTION ss.guardar_tasas(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare n int;
begin
  insert into ss.fx_rates (base, quote, rate_date, rate, source)
  select r.base, 'COP', r.rate_date, r.rate, r.source
  from jsonb_to_recordset(coalesce(p->'tasas', '[]'::jsonb)) as r(base text, rate_date date, rate numeric, source text)
  where r.base ~ '^[A-Z]{3}$' and r.rate > 0 and r.rate_date is not null
  on conflict (base, quote, rate_date) do update set rate = excluded.rate, source = excluded.source, fetched_at = now()
    where ss.fx_rates.source <> 'trm_datos_gov' and excluded.source = 'trm_datos_gov';
  get diagnostics n = row_count;
  return jsonb_build_object('guardadas', n);
end $function$;

CREATE OR REPLACE FUNCTION ss.tx_fill_amount_cop()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(new.currency, 'COP') = 'COP' then
    if tg_op = 'INSERT' or new.amount_cop is null or new.amount <> old.amount or new.currency <> old.currency then
      new.amount_cop := new.amount;
      new.fx_rate := 1;
      new.fx_source := 'cop';
      new.fx_date := coalesce(new.fx_date, ss.fecha_bog(new.transaction_date));
    end if;
  elsif new.amount_cop is null and new.amount is not null then
    select x.rate, x.rate_date, x.source into new.fx_rate, new.fx_date, new.fx_source
      from ss.fx_rates x where x.base = new.currency and x.quote = 'COP'
     order by abs(x.rate_date - ss.fecha_bog(coalesce(new.transaction_date, now() at time zone 'UTC'))) limit 1;
    if new.fx_rate is not null then new.amount_cop := round(new.amount * new.fx_rate, 2); end if;
  elsif tg_op <> 'INSERT' then
    if new.amount <> old.amount and new.fx_rate is not null
       and coalesce(new.amount_cop, -1) = coalesce(old.amount_cop, -1) then
      new.amount_cop := round(new.amount * new.fx_rate, 2);
    end if;
  end if;
  return new;
end $function$;
