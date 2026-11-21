-- SmartSavings Conversacional · funciones que BORRAN datos (requieren aprobación)
-- Pegar completo en Supabase → SQL Editor → Run. Es idempotente (create or replace).
-- Solo crea funciones; no borra nada al ejecutarse.

-- 1. Borrado confirmado de movimientos (lo llama ss.op_confirmar_pendiente tras un «sí» en un mensaje posterior)
create or replace function ss.borrar_movimientos(p_uid uuid, p_ids int[], p_mk text) returns jsonb language plpgsql as $f$
declare
  v_borr jsonb;
  v_total numeric;
  v_batches uuid[];
  v_rest numeric;
begin
  select array_agg(distinct tx.batch_id) filter (where tx.batch_id is not null) into v_batches
    from public.transactions tx where tx.user_id = p_uid and tx.id = any(p_ids);
  with d as (
    delete from public.transactions tx where tx.user_id = p_uid and tx.id = any(p_ids)
    returning tx.*),
  a as (
    insert into ss.events (user_id, kind, payload)
    select p_uid, 'tx_delete', jsonb_build_object('tx', to_jsonb(d), 'mk', p_mk) from d
    returning 1)
  select jsonb_agg(jsonb_build_object('ref', d.id, 'descripcion', d.description, 'cop', d.amount_cop) order by d.id),
         sum(d.amount_cop)
    into v_borr, v_total from d;
  select sum(tx.amount_cop) into v_rest from public.transactions tx
   where tx.user_id = p_uid and tx.batch_id = any(coalesce(v_batches, '{}'::uuid[]));
  return jsonb_build_object('borrados', coalesce(v_borr, '[]'::jsonb), 'total_borrado_cop', v_total,
                            'lote_restante_cop', v_rest, 'n', coalesce(jsonb_array_length(v_borr), 0));
end $f$;

-- 2. Mantenimiento diario (lo llama «Reloj Mantenimiento» a las 06:05 y 12:05)
create or replace function ss.mantenimiento() returns jsonb language plpgsql as $f$
declare a int; b int; c int; d int; e int; f int; g int;
begin
  delete from ss.chat_memory where session_id like 'x:%';                       -- «olvida la conversación» y memorias de vinculación
  get diagnostics g = row_count;
  delete from ss.chat_memory where created_at < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from ss.chat_memory m
   using (select id, row_number() over (partition by session_id order by id desc) as rn from ss.chat_memory) x
   where m.id = x.id and x.rn > 40;
  get diagnostics b = row_count;
  update ss.processed_messages set status = 'failed', finished_at = now()
   where status = 'processing' and received_at < now() - interval '10 minutes';
  get diagnostics c = row_count;
  delete from ss.processed_messages where received_at < now() - interval '30 days';
  get diagnostics d = row_count;
  delete from ss.pending_actions where coalesce(consumed_at, expires_at) < now() - interval '7 days';
  get diagnostics e = row_count;
  delete from ss.events where created_at < now() - interval '180 days' and kind not like 'tx_%';
  get diagnostics f = row_count;
  return jsonb_build_object('olvidados', g, 'memoria_vieja', a, 'memoria_exceso', b, 'colgados', c,
                            'mensajes_viejos', d, 'pendientes_viejos', e, 'eventos_viejos', f);
end $f$;

-- 3. Limpieza de las cuentas de prueba (solo chats 'qa-…' del chat del editor). Uso: select ss.limpiar_qa();
create or replace function ss.limpiar_qa() returns jsonb language plpgsql as $f$
declare v_users uuid[]; n_tx int; n_us int;
begin
  select array_agg(distinct uc.user_id) into v_users from public.user_channels uc
   where uc.chat_id like 'qa-%'
     and not exists (select 1 from public.user_channels o where o.user_id = uc.user_id and o.chat_id not like 'qa-%');
  delete from public.transactions where user_id = any(coalesce(v_users, '{}'::uuid[]));
  get diagnostics n_tx = row_count;
  delete from public.users where user_id = any(coalesce(v_users, '{}'::uuid[]));   -- cascade: user_channels, pending_actions
  get diagnostics n_us = row_count;
  delete from ss.chat_memory where session_id like 'c:%:qa-%' or session_id = any(select 'u:' || u::text from unnest(coalesce(v_users, '{}'::uuid[])) u);
  delete from ss.pending_actions where chat_id like 'qa-%';
  delete from ss.processed_messages where chat_id like 'qa-%';
  delete from ss.events where user_id = any(coalesce(v_users, '{}'::uuid[])) or payload->>'chat' like '%:qa-%';
  return jsonb_build_object('usuarios', n_us, 'movimientos', n_tx);
end $f$;

-- 4. Funciones de prueba que quedaron al diagnosticar la herramienta de migraciones
drop function if exists ss._p3();
drop function if exists ss._p4();
drop function if exists ss._p5(timestamp);
drop function if exists ss._p6(numeric, numeric);
drop function if exists ss._ping();
drop function if exists ss._ping2(int);
