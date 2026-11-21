CREATE OR REPLACE FUNCTION ss.destinatarios(p jsonb)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  lim as (select ss.utc_de(hoy.d::text) as ini, ss.utc_de((hoy.d + 1)::text) as fin,
                 ss.utc_de(hoy.d::text) + interval '14 hours' as tarde from hoy),
  dst as (
    select distinct on (u.user_id) u.user_id, btrim(split_part(coalesce(u.name, ''), ' ', 1)) as nombre,
           uc.platform, uc.chat_id, uc.last_inbound_at
      from public.users u join public.user_channels uc on uc.user_id = u.user_id, hoy
     where uc.is_primary and uc.verified_at is not null and uc.blocked_at is null
       and coalesce((u.notify_prefs->>(p->>'tipo'))::boolean, true)
       and (coalesce((p->>'prueba')::boolean, false) = (uc.chat_id like 'qa-%'))
       and not exists (select 1 from ss.events e where e.user_id = u.user_id
                        and e.kind = 'proactivo_' || (p->>'tipo') and e.ref_date = hoy.d)
       and (select count(*) from (select e.status from ss.events e where e.user_id = u.user_id
              and e.kind like 'proactivo_%' order by e.created_at desc limit 3) z where z.status = 'fallido') < 3
     order by u.user_id, uc.last_inbound_at desc nulls last, uc.channel_id),
  g as (select tx.user_id, tx.category, sum(tx.amount_cop) as total, count(*) as n
          from public.transactions tx, lim
         where tx.type = 'expense' and tx.transaction_date >= lim.ini and tx.transaction_date < lim.fin
           and tx.user_id in (select dst.user_id from dst)
         group by 1, 2),
  act as (select tx.user_id, max(tx.created_at) as ultimo, count(*) filter (where tx.created_at >= lim.tarde) as desde_tarde
            from public.transactions tx, lim
           where tx.created_at >= lim.ini and tx.user_id in (select dst.user_id from dst) group by 1)
  select jsonb_build_object(
           'user_id', dst.user_id, 'nombre', dst.nombre, 'platform', dst.platform, 'chat_id', dst.chat_id,
           'fecha_local', hoy.d,
           'en_ventana', dst.platform = 'telegram' or coalesce(dst.last_inbound_at > now() - interval '23 hours', false),
           'total_hoy', (select sum(g.total) from g where g.user_id = dst.user_id),
           'n_hoy', (select sum(g.n) from g where g.user_id = dst.user_id)::int,
           'top3', (select jsonb_agg(jsonb_build_object('categoria', x.category, 'total', x.total) order by x.total desc)
                      from (select g.category, g.total from g where g.user_id = dst.user_id order by g.total desc limit 3) x),
           'anoto_desde_tarde', coalesce((select act.desde_tarde from act where act.user_id = dst.user_id), 0) > 0)
    from dst, hoy
   where (p->>'tipo') <> 'resumen' or exists (select 1 from g where g.user_id = dst.user_id)
$function$;
