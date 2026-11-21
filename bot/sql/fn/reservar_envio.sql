CREATE OR REPLACE FUNCTION ss.reservar_envio(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_id bigint; v_status text;
begin
  insert into ss.events (user_id, kind, ref_date, status, payload)
  values ((p->>'user_id')::uuid, 'proactivo_' || (p->>'tipo'), (p->>'fecha_local')::date,
          case when coalesce((p->>'omitir')::boolean, false) then 'omitido'
               when p->>'modo' = 'simulado' then 'simulado' else 'reservado' end,
          jsonb_build_object('platform', p->>'platform', 'modo', p->>'modo', 'texto', p->>'texto_memoria',
                             'motivo', p->>'motivo', 'via', p->>'via'))
  on conflict (user_id, kind, ref_date) where kind like 'proactivo_%' do nothing
  returning id, status into v_id, v_status;
  return jsonb_build_object('evento_id', v_id, 'estado', coalesce(v_status, 'ya_enviado'));
end $function$;
