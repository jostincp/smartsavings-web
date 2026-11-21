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
                  and (j->>'sel_categoria' is null or tx.category = j->>'sel_categoria')))
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
