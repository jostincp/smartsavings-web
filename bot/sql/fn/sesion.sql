CREATE OR REPLACE FUNCTION ss.sesion(p_platform text, p_chat text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce('u:' || (select y.user_id::text from ss.yo(p_platform, p_chat) y), 'c:' || p_platform || ':' || p_chat)
$function$;
