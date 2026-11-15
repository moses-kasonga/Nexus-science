-- Statistiques agrégées NEXUS SCIENCE accessibles à MOÏSE uniquement aux administrateurs.
-- Aucun profil, e-mail ou identifiant individuel n'est exposé.

create or replace function public.moise_nexus_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentification requise';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Réservé aux administrateurs';
  end if;

  return jsonb_build_object(
    'students', (select count(*)::integer from public.profiles where role = 'student'),
    'teachers', (select count(*)::integer from public.profiles where role = 'teacher'),
    'users', (select count(*)::integer from public.profiles),
    'published_courses', (select count(*)::integer from public.courses where published = true),
    'active_enrollments', (select count(*)::integer from public.enrollments where status = 'active'),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.moise_nexus_admin_stats() from public, anon;
grant execute on function public.moise_nexus_admin_stats() to authenticated;
