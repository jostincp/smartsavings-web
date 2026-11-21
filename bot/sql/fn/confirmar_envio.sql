CREATE OR REPLACE FUNCTION ss.confirmar_envio(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_uid uuid; v_texto text;
begin
  update ss.events set status = 'enviado' where id = (p->>'evento_id')::bigint and status = 'reservado'
  returning user_id, payload->>'texto' into v_uid, v_texto;
  if v_uid is not null and coalesce(v_texto, '') <> '' then
    insert into ss.chat_memory (session_id, role, content, hechos)
    values ('u:' || v_uid::text, 'sami', v_texto, jsonb_build_object('proactivo', p->>'tipo'));
  end if;
  return jsonb_build_object('ok', v_uid is not null);
end $function$;
