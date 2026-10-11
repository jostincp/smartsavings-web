CREATE OR REPLACE FUNCTION ss.op_registrar(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_uid uuid;
  v_cid int;
  it record;
  v_row record;
  v_rate numeric;
  v_rdate date;
  v_src text;
  v_fecha date;
  v_dkey text;
  v_batch uuid;
  v_n int;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  guardados jsonb := '[]'::jsonb;
  sin_tasa jsonb := '[]'::jsonb;
  tasa_lejana jsonb := '[]'::jsonb;
  v_nuevos int := 0;
begin
  select y.user_id, y.channel_id into v_uid, v_cid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta', 'guardados', '[]'::jsonb);
  end if;
  if j ? 'pa_req' and not exists (select 1 from ss.pending_actions x
       where x.id = j->>'pa_req' and x.consumed_message_key = j->>'message_key') then
    return jsonb_build_object('ok', false, 'motivo', 'pendiente_no_confirmado', 'guardados', '[]'::jsonb);
  end if;
  select count(*) into v_n from public.transactions tx
   where tx.user_id = v_uid and tx.created_at > (now() at time zone 'UTC') - interval '1 day';
  if v_n >= 300 then
    return jsonb_build_object('ok', false, 'motivo', 'limite_diario', 'guardados', '[]'::jsonb);
  end if;
  v_batch := md5((j->>'message_key') || ':' || (j->>'n'))::uuid;
  for it in
    select * from jsonb_to_recordset(coalesce(j->'items', '[]'::jsonb)) as r(
      idx int, type text, amount numeric, currency text, category text, description text,
      store_name text, product_name text, fecha_local date, payment_method text)
  loop
    if it.amount is null or it.amount <= 0 or it.amount > 1000000000 or coalesce(it.type, '') not in ('income','expense','transfer') then
      raise exception 'op_registrar: item invalido %', it.idx;
    end if;
    v_fecha := coalesce(it.fecha_local, v_hoy);
    if coalesce(it.currency, 'COP') = 'COP' then
      v_rate := 1; v_rdate := v_fecha; v_src := 'cop';
    else
      v_rate := null; v_rdate := null; v_src := null;
      select x.rate, x.rate_date, x.source into v_rate, v_rdate, v_src
        from ss.fx_rates x where x.base = it.currency and x.quote = 'COP'
       order by abs(x.rate_date - v_fecha), x.rate_date desc limit 1;
      if v_rate is null then
        sin_tasa := sin_tasa || to_jsonb(it.idx);
        continue;
      end if;
      if abs(v_rdate - v_fecha) > 4 then
        tasa_lejana := tasa_lejana || to_jsonb(it.idx);
      end if;
    end if;
    v_dkey := md5(concat_ws('|', j->>'message_key', j->>'n', it.idx, it.type, it.amount, it.currency,
                            it.category, lower(it.description), v_fecha));
    insert into public.transactions (user_id, channel_id, type, amount, currency, amount_cop, fx_rate, fx_date, fx_source,
           category, description, store_name, product_name, raw_message, transaction_date, created_at,
           source_message_key, batch_id, dedupe_key, payment_method)
    values (v_uid, v_cid, it.type, it.amount, coalesce(it.currency, 'COP'), round(it.amount * v_rate, 2), v_rate, v_rdate, v_src,
           it.category, left(it.description, 100), left(it.store_name, 60), left(it.product_name, 60), left(j->>'raw', 500),
           case when it.fecha_local is null or it.fecha_local = v_hoy then now() at time zone 'UTC'
                else ((it.fecha_local + time '12:00') at time zone 'America/Bogota') at time zone 'UTC' end,
           now() at time zone 'UTC', j->>'message_key', v_batch, v_dkey, it.payment_method)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning id, type, amount, currency, amount_cop, fx_rate, fx_date, category, description, payment_method into v_row;
    if not found then
      select tx.id, tx.type, tx.amount, tx.currency, tx.amount_cop, tx.fx_rate, tx.fx_date, tx.category, tx.description, tx.payment_method
        into v_row from public.transactions tx where tx.user_id = v_uid and tx.dedupe_key = v_dkey;
    else
      v_nuevos := v_nuevos + 1;
      insert into ss.events (user_id, kind, payload)
      values (v_uid, 'tx_insert', jsonb_build_object('tx', to_jsonb(v_row), 'mk', j->>'message_key'));
    end if;
    guardados := guardados || jsonb_build_array(jsonb_build_object(
       'idx', it.idx, 'ref', v_row.id, 'tipo', v_row.type, 'monto', v_row.amount, 'moneda', v_row.currency,
       'cop', v_row.amount_cop, 'tasa', v_row.fx_rate, 'fecha_tasa', v_row.fx_date, 'fuente', v_src,
       'categoria', v_row.category, 'descripcion', v_row.description, 'medio', v_row.payment_method, 'fecha', v_fecha));
  end loop;
  return jsonb_build_object('ok', true, 'guardados', guardados, 'nuevos', v_nuevos, 'sin_tasa', sin_tasa,
    'tasa_lejana', tasa_lejana,
    'lote', (select min(tx.id) from public.transactions tx where tx.user_id = v_uid and tx.batch_id = v_batch));
end $function$;
