CREATE OR REPLACE FUNCTION ss.yo(p_platform text, p_chat text, OUT user_id uuid, OUT channel_id integer)
 RETURNS record
 LANGUAGE sql
 STABLE
AS $function$
  select uc.user_id, uc.channel_id from public.user_channels uc
  where uc.platform = p_platform and uc.chat_id = p_chat and uc.verified_at is not null
  order by uc.channel_id limit 1
$function$;
