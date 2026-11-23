-- Harden the NEXUS -> MOÏSE daily quota and homepage publishing RPC.
-- The quota limit is a server-side policy, not a caller-controlled RPC argument.
-- Current free-tier policy: 10 messages per UTC calendar day per authenticated user.

begin;

drop function if exists public.consume_moise_quota(integer);

create or replace function public.consume_moise_quota()
returns table (is_allowed boolean, used_today integer, remaining_today integer)
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 10;
  v_day date := (pg_catalog.now() at time zone 'utc')::date;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  insert into public.moise_usage as u (user_id, day, message_count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update
    set message_count = u.message_count + 1
    where u.message_count < v_limit
  returning u.message_count into v_count;

  if v_count is null then
    select u.message_count
      into v_count
    from public.moise_usage as u
    where u.user_id = v_uid
      and u.day = v_day;

    return query select false, coalesce(v_count, 0), 0;
  else
    return query select true, v_count, v_limit - v_count;
  end if;
end;
$function$;

revoke all on function public.consume_moise_quota() from public, anon;
grant execute on function public.consume_moise_quota() to authenticated, service_role;

-- All referenced objects are schema-qualified; an empty search_path avoids
-- future object-shadowing risks for this SECURITY DEFINER publisher.
create or replace function public.publish_homepage_content()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_content jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.'
      using errcode = '42501';
  end if;

  select d.content
    into v_content
  from public.homepage_content_drafts d
  where d.id = 'singleton'
  for share;

  if v_content is null then
    raise exception 'Aucun brouillon de page d’accueil à publier.'
      using errcode = 'P0002';
  end if;

  insert into public.homepage_content_published
    (id, content, published_by, published_at)
  values
    ('singleton', v_content, auth.uid(), pg_catalog.now())
  on conflict (id) do update
    set content = excluded.content,
        published_by = excluded.published_by,
        published_at = excluded.published_at;
end;
$function$;

revoke all on function public.publish_homepage_content() from public, anon;
grant execute on function public.publish_homepage_content() to authenticated, service_role;

commit;