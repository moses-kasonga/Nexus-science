-- Quota quotidien d'utilisation de l'assistant MOÏSE, par utilisateur (jour UTC).
-- Appelé par le proxy serveur avec le jeton de l'utilisateur : auth.uid() identifie le compte.

create table if not exists public.moise_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  message_count integer not null default 0 check (message_count >= 0),
  primary key (user_id, day)
);

alter table public.moise_usage enable row level security;
-- Aucune politique : la table n'est lisible ni modifiable directement, seulement via la fonction ci-dessous.
revoke all on public.moise_usage from anon, authenticated;

create or replace function public.consume_moise_quota(p_limit integer default 50)
returns table (is_allowed boolean, used_today integer, remaining_today integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_day date := (now() at time zone 'utc')::date;
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
    select message_count into v_count from public.moise_usage where user_id = v_uid and day = v_day;
    return query select false, coalesce(v_count, 0), 0;
  else
    return query select true, v_count, v_limit - v_count;
  end if;
end;
$$;

revoke execute on function public.consume_moise_quota(integer) from public, anon;
grant execute on function public.consume_moise_quota(integer) to authenticated;
