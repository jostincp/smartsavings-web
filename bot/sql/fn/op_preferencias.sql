CREATE OR REPLACE FUNCTION ss.op_preferencias(j jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare v_uid uuid; v_name text; v_prefs jsonb;
begin
  select y.user_id into v_uid from ss.yo(j->>'platform', j->>'chat_id') y;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cuenta');
  end if;
  update public.users u
     set notify_prefs = case when jsonb_typeof(j->'prefs') = 'object' then u.notify_prefs || (j->'prefs') else u.notify_prefs end,
         name = coalesce(left(nullif(btrim(j->>'nombre'), ''), 40), u.name),
         updated_at = now()
   where u.user_id = v_uid
  returning u.name, u.notify_prefs into v_name, v_prefs;
  return jsonb_build_object('ok', true, 'nombre', v_name, 'prefs', v_prefs);
end $function$;
