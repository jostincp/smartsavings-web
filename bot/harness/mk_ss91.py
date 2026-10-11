# Genera ss_91_revision.sql a partir de las definiciones de producción, aplicando los arreglos de la revisión.
import sys, re
D = sys.argv[1] + '/fn/'
def leer(n): return open(D + n + '.sql').read()
def rep(s, a, b, n=1):
    if s.count(a) != n: raise SystemExit('no calza (%d): %s' % (s.count(a), a[:70]))
    return s.replace(a, b)
out = ["-- ss_91: arreglos de la revisión adversarial \n",
"""CREATE OR REPLACE FUNCTION ss.cat_norm(t text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$ select lower(translate(btrim(coalesce(t, '')), 'ÁÉÍÓÚáéíóúÜüÑñ', 'AEIOUaeiouUuNn')) $function$;
"""]
CATS = "(select ss.cat_norm(x) from jsonb_array_elements_text(j->'categorias') x)"
# 1) Categorías sin distinguir mayúsculas ni tildes (filas de los flujos viejos)
for f in ['op_consultar', 'op_listar']:
    s = rep(leer(f), "or tx.category in (select jsonb_array_elements_text(j->'categorias')))", "or ss.cat_norm(tx.category) in " + CATS + ")")
    out.append(s)
SEL = "(j->>'sel_categoria' is null or tx.category = j->>'sel_categoria')"
SEL2 = ("(j->>'sel_categoria' is null or ss.cat_norm(tx.category) = ss.cat_norm(j->>'sel_categoria')"
        " or ss.cat_norm(tx.category) in (select ss.cat_norm(x) from jsonb_array_elements_text(coalesce(j->'sel_categorias', '[]'::jsonb)) x))")
out.append(rep(leer('op_corregir'), SEL, SEL2))
s = rep(leer('op_preparar_borrado'), SEL, SEL2)
# 2) Sin la función de borrado instalada no se prepara nada (evita un «sí» que tumbe el turno)
s = rep(s, "  if j ? 'lote_de' then", "  if to_regprocedure('ss.borrar_movimientos(uuid,integer[],text)') is null then\n    return jsonb_build_object('estado', 'no_disponible');\n  end if;\n  if j ? 'lote_de' then")
out.append(s)
# 3) Crear cuenta: «recuperada» solo para cuentas viejas sin ningún canal verificado y canales nunca desvinculados
s = leer('op_crear_cuenta')
s = rep(s, """                and uc.user_id = v_ex and uc.verified_at is null) then""",
"""                and uc.user_id = v_ex and uc.verified_at is null)
       and not exists (select 1 from public.user_channels o where o.user_id = v_ex and o.verified_at is not null)
       and not exists (select 1 from ss.events e join public.user_channels uc2 on uc2.channel_id = (e.payload->>'channel_id')::int
                        where e.kind = 'alerta_seguridad' and uc2.platform = v_pl and uc2.chat_id = v_chat) then""")
s = rep(s, "  if exists (select 1 from public.user_channels uc where uc.platform = v_pl and uc.chat_id = v_chat) then",
           "  if exists (select 1 from public.user_channels uc where uc.platform = v_pl and uc.chat_id = v_chat and uc.verified_at is not null) then")
s = rep(s, """  values (v_uid, v_pl, v_chat, now(), true, now(), now());""",
"""  values (v_uid, v_pl, v_chat, now(), true, now(), now())
  on conflict (platform, chat_id) do update set user_id = excluded.user_id, verified_at = now(), is_primary = true,
     last_inbound_at = now(), blocked_at = null
  where public.user_channels.verified_at is null;""")
out.append(s)
# 4) Pago de tarjeta: no seguir si no se guardó; avisar si hay gastos sin medio que podrían ser esas compras
s = leer('op_pago_tarjeta')
s = rep(s, "  v_pa text;\n", "  v_pa text;\n  v_sin_medio numeric := 0;\n")
s = rep(s, """    v_reg := ss.op_registrar(j || jsonb_build_object('items', v_items));
  end if;""", """    v_reg := ss.op_registrar(j || jsonb_build_object('items', v_items));
    if not coalesce((v_reg->>'ok')::boolean, false) then
      return jsonb_build_object('estado', 'no_guardado', 'motivo', v_reg->>'motivo', 'registro', v_reg);
    end if;
  end if;
  if v_exc > 0 then
    select coalesce(sum(tx.amount_cop), 0) into v_sin_medio from public.transactions tx
     where tx.user_id = v_uid and tx.type = 'expense' and tx.payment_method is null
       and tx.transaction_date > (now() at time zone 'UTC') - interval '60 days';
  end if;""")
s = rep(s, "'pendiente_id', v_pa, 'registro', v_reg);", "'pendiente_id', v_pa, 'registro', v_reg,\n    'guardado', coalesce(jsonb_array_length(v_reg->'guardados'), 0) > 0,\n    'posibles_ya_anotadas', case when v_sin_medio > 0 then least(v_sin_medio, v_exc) end);")
out.append(s)
# 5) Confirmar: el medio de pago viaja a la factura; si falta la tasa, el pendiente no se consume
s = leer('op_confirmar_pendiente')
s = rep(s, "'store_name', v_payload->>'tienda', 'fecha_local', v_payload->>'fecha_ok'));",
           "'store_name', v_payload->>'tienda', 'fecha_local', v_payload->>'fecha_ok', 'payment_method', nullif(j->>'medio', '')));")
s = rep(s, "             'fecha_local', v_payload->>'fecha_ok') order by e.ord), '[]'::jsonb)",
           "             'fecha_local', v_payload->>'fecha_ok', 'payment_method', nullif(j->>'medio', '')) order by e.ord), '[]'::jsonb)")
SINT = """  if jsonb_array_length(coalesce(v_r->'sin_tasa', '[]'::jsonb)) > 0 and jsonb_array_length(coalesce(v_r->'guardados', '[]'::jsonb)) = 0 then
    update ss.pending_actions set consumed_at = null, consumed_message_key = null where id = j->>'pa_id';
    return jsonb_build_object('estado', 'tasa_no_disponible', 'moneda', coalesce(v_payload->>'moneda', v_payload#>>'{items,0,currency}'));
  end if;
"""
s = rep(s, "    v_r := ss.op_registrar(j || jsonb_build_object('items', v_payload->'items', 'pa_req', j->>'pa_id'));\n",
           "    v_r := ss.op_registrar(j || jsonb_build_object('items', v_payload->'items', 'pa_req', j->>'pa_id'));\n" + SINT.replace('  ', '    ', 1).replace('\n  ', '\n    '))
s = rep(s, "  v_r := ss.op_registrar(j || jsonb_build_object('items', v_items, 'pa_req', j->>'pa_id'));\n",
           "  v_r := ss.op_registrar(j || jsonb_build_object('items', v_items, 'pa_req', j->>'pa_id'));\n" + SINT)
out.append(s)
# 6) La TRM oficial reemplaza la tasa de respaldo del mismo día
out.append(rep(leer('guardar_tasas'), "  on conflict (base, quote, rate_date) do nothing;",
  "  on conflict (base, quote, rate_date) do update set rate = excluded.rate, source = excluded.source, fetched_at = now()\n    where ss.fx_rates.source <> 'trm_datos_gov' and excluded.source = 'trm_datos_gov';"))
# 7) Filas en moneda extranjera sin amount_cop (flujos viejos): se convierten con la tasa más cercana
out.append(rep(leer('tx_fill_amount_cop'), "  elsif tg_op <> 'INSERT' then", """  elsif new.amount_cop is null and new.amount is not null then
    select x.rate, x.rate_date, x.source into new.fx_rate, new.fx_date, new.fx_source
      from ss.fx_rates x where x.base = new.currency and x.quote = 'COP'
     order by abs(x.rate_date - ss.fecha_bog(coalesce(new.transaction_date, now() at time zone 'UTC'))) limit 1;
    if new.fx_rate is not null then new.amount_cop := round(new.amount * new.fx_rate, 2); end if;
  elsif tg_op <> 'INSERT' then"""))
open(sys.argv[1] + '/ss_91_revision.sql', 'w').write('\n'.join(out))
print('ok', len(out))
