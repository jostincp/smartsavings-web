CREATE OR REPLACE FUNCTION ss.ejecutar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  s jsonb;
  res jsonb := '[]'::jsonb;
  base jsonb;
  j jsonb;
  r jsonb;
  v_op text;
  v_n int;
begin
  base := jsonb_build_object('platform', p->>'platform', 'chat_id', p->>'chat_id',
                             'message_key', p->>'message_key', 'raw', left(coalesce(p->>'raw', ''), 500));
  if coalesce(p->>'platform', '') not in ('whatsapp', 'telegram') or coalesce(p->>'chat_id', '') = ''
     or coalesce(p->>'message_key', '') = '' then
    raise exception 'ss.ejecutar: faltan datos del turno';
  end if;
  for s in select x from jsonb_array_elements(coalesce(p->'pasos', '[]'::jsonb)) as t(x) loop
    v_op := s->>'op';
    v_n := (s->>'n')::int;
    -- los campos de confianza van al final y pisan cualquier homónimo
    j := coalesce(s->'args', '{}'::jsonb) || jsonb_build_object('n', v_n) || base;
    r := case v_op
      when 'registrar' then ss.op_registrar(j)
      when 'crear_cuenta' then ss.op_crear_cuenta(j)
      when 'solicitar_codigo' then ss.op_solicitar_codigo(j)
      when 'verificar_codigo' then ss.op_verificar_codigo(j)
      when 'consultar' then ss.op_consultar(j)
      when 'listar' then ss.op_listar(j)
      when 'corregir' then ss.op_corregir(j)
      when 'preparar_borrado' then ss.op_preparar_borrado(j)
      when 'confirmar_pendiente' then ss.op_confirmar_pendiente(j)
      when 'cancelar_pendiente' then ss.op_cancelar_pendiente(j)
      when 'crear_pendiente_tx' then ss.op_crear_pendiente_tx(j)
      when 'canal_principal' then ss.op_canal_principal(j)
      when 'preferencias' then ss.op_preferencias(j)
      when 'olvidar_conversacion' then ss.op_olvidar(j)
      when 'avisar_equipo' then ss.op_avisar_equipo(j)
      when 'convertir' then ss.op_convertir(j)
      when 'pago_tarjeta' then ss.op_pago_tarjeta(j)
      else null end;
    if r is null then
      raise exception 'ss.ejecutar: operacion desconocida %', v_op;
    end if;
    res := res || jsonb_build_array(jsonb_build_object('n', v_n, 'op', v_op, 'r', r));
  end loop;
  return jsonb_build_object('ok', true, 'resultados', res);
end $function$;
