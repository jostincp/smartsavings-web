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
            or tx.category in (select jsonb_array_elements_text(j->'categorias')))
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
