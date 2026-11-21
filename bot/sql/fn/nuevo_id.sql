CREATE OR REPLACE FUNCTION ss.nuevo_id()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  a text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  b bytea := extensions.gen_random_bytes(10);
  r text := '';
  i int;
begin
  for i in 0..9 loop
    r := r || substr(a, (get_byte(b, i) % 62) + 1, 1);
  end loop;
  return r;
end $function$;
