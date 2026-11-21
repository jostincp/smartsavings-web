\set ON_ERROR_STOP 1
insert into public.users (user_id, email, name) values ('00000000-0000-0000-0000-00000000000b','b@mail.com','B');
insert into public.user_channels (user_id, platform, chat_id, verified_at, is_primary) values ('00000000-0000-0000-0000-00000000000b','telegram','222', now(), true);
insert into public.transactions (user_id, channel_id, type, amount, currency, category, description, transaction_date)
values ('00000000-0000-0000-0000-00000000000b', 1, 'expense', 80000, 'COP', 'Supermercados', 'Mercado D1', '2026-10-05 17:00'),
       ('00000000-0000-0000-0000-00000000000b', 1, 'expense', 50000, 'COP', 'Alimentación', 'Fruver', '2026-10-06 17:00'),
       ('00000000-0000-0000-0000-00000000000b', 1, 'expense', 120000, 'COP', 'Ropa', 'Camisa', '2026-10-06 17:00'),
       ('00000000-0000-0000-0000-00000000000b', 1, 'expense', 20, 'USD', 'Otros', 'Viejo en USD', '2026-10-06 17:00');
\echo '--- categorías (esperado mercado 130000, ropa 1)'
select ss.op_consultar('{"platform":"telegram","chat_id":"222","ini":"2026-10-01","fin":"2026-10-10","tipo":"expense","categorias":["Alimentación","mercado","supermercado","supermercados"]}')->'totales' as mercado;
select jsonb_array_length(ss.op_listar('{"platform":"telegram","chat_id":"222","ini":"2026-10-01","fin":"2026-10-10","limite":10,"categorias":["Ropa y Calzado","ropa","calzado","ropa y zapatos"]}')->'items') as ropa_listada;
\echo '--- fila vieja USD sin tasa: amount_cop'
select amount_cop from public.transactions where description='Viejo en USD';
\echo '--- factura USD sin tasa: no se consume'
select ss.borrador_factura('{"platform":"telegram","chat_id":"222","message_key":"tg:222:10","factura":{"es_factura":true,"legible":true,"tienda":"Walmart","fecha":"2026-10-07","fecha_ok":"2026-10-07","moneda":"USD","total":30,"suma":30,"cuadra":true,"items":[{"producto":"Shampoo","precio":12,"categoria":"Cuidado Personal"},{"producto":"Snacks","precio":18,"categoria":"Alimentación"}],"categoria_principal":"Alimentación"}}')->>'borrador_id' as b \gset
select ss.ejecutar(jsonb_build_object('platform','telegram','chat_id','222','message_key','tg:222:11','pasos',jsonb_build_array(jsonb_build_object('n',1,'op','confirmar_pendiente','args',jsonb_build_object('pa_id',:'b')))))->'resultados'->0->'r' as r;
select consumed_at is not null as borrador_consumido from ss.pending_actions where id = :'b';
\echo '--- con tasa y medio crédito: se guarda con payment_method'
select ss.guardar_tasas('{"tasas":[{"base":"USD","rate_date":"2026-10-07","rate":3900,"source":"trm_datos_gov"}]}');
select ss.ejecutar(jsonb_build_object('platform','telegram','chat_id','222','message_key','tg:222:12','pasos',jsonb_build_array(jsonb_build_object('n',1,'op','confirmar_pendiente','args',jsonb_build_object('pa_id',:'b','medio','credito')))))->'resultados'->0->'r'->'registro'->'guardados' as g;
select description, amount_cop, payment_method from public.transactions where source_message_key='tg:222:12';
\echo '--- pago tarjeta: deuda 117000 (factura a crédito); pago 200000 → excede, posibles_ya_anotadas'
select ((ss.ejecutar('{"platform":"telegram","chat_id":"222","message_key":"tg:222:13","pasos":[{"n":1,"op":"pago_tarjeta","args":{"monto":200000,"fecha_local":"2026-10-09"}}]}'::jsonb)->'resultados'->0->'r') - 'registro'::text) as r;
\echo '--- preparar borrado con categoría vieja'
select ss.op_preparar_borrado('{"platform":"telegram","chat_id":"222","message_key":"tg:222:14","sel_ini":"2026-10-01","sel_fin":"2026-10-10","sel_categoria":"Ropa y Calzado","sel_categorias":["Ropa y Calzado","ropa"]}')->>'n' as n_borrar;
\echo '--- chat huérfano crea cuenta propia'
insert into public.user_channels (user_id, platform, chat_id, verified_at, is_primary) values ('00000000-0000-0000-0000-00000000000b','telegram','777', null, false);
select ss.op_crear_cuenta('{"platform":"telegram","chat_id":"777","email":"nueva@mail.com","nombre":"Ana"}') as r;
select u.email, uc.verified_at is not null as v from public.user_channels uc join public.users u using (user_id) where chat_id='777';
