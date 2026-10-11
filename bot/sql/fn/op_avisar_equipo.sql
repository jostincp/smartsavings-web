CREATE OR REPLACE FUNCTION ss.op_avisar_equipo(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_id bigint; v_tipo text := case when j->>'tipo' in ('problema','sugerencia','seguridad') then j->>'tipo' else 'problema' end;
begin
  insert into ss.events (user_id, kind, payload)
  values ((select y.user_id from ss.yo(j->>'platform', j->>'chat_id') y), 'alerta_' || v_tipo,
          jsonb_build_object('resumen', left(j->>'resumen', 300), 'platform', j->>'platform', 'mk', j->>'message_key'))
  returning id into v_id;
  return jsonb_build_object('ticket', 'T-' || v_id, 'tipo', v_tipo,
    'admin_chat_id', (select c.v #>> '{}' from ss.config c where c.k = 'admin_chat_id'));
end $function$;
