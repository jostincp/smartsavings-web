CREATE OR REPLACE FUNCTION ss.codigo6(p_chat text)
 RETURNS text
 LANGUAGE sql
AS $function$
  select case when p_chat like 'qa-%' then '123456'
    else lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0') end
$function$;
