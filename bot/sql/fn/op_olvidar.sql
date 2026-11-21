CREATE OR REPLACE FUNCTION ss.op_olvidar(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_uid uuid; v_n int;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  update ss.chat_memory set session_id = 'x:' || session_id
   where session_id = coalesce('u:' || v_uid::text, 'c:' || (j->>'platform') || ':' || (j->>'chat_id'));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'olvidados', v_n);
end $function$;
