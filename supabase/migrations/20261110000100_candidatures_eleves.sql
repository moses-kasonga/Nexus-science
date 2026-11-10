-- Dossier de candidature des futurs élèves NEXUS SCIENCE.
-- Cette migration est versionnée dans Git ; elle n'est PAS appliquée au projet Supabase.
create table if not exists public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  phone text not null,
  birth_date date,
  nationality text not null,
  country_of_residence text not null,
  city text not null,
  education_level text not null,
  desired_program text not null,
  motivation text not null,
  status text not null default 'submitted'
    check (status in ('submitted','under_review','accepted','rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidate_applications_status_created_idx
  on public.candidate_applications(status, created_at desc);

alter table public.candidate_applications enable row level security;
revoke all on table public.candidate_applications from anon, authenticated;
grant select on table public.candidate_applications to authenticated;

drop policy if exists candidate_applications_select_own on public.candidate_applications;
create policy candidate_applications_select_own
  on public.candidate_applications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists candidate_applications_admin_select on public.candidate_applications;
create policy candidate_applications_admin_select
  on public.candidate_applications for select to authenticated
  using (public.is_admin());

-- L'envoi passe par une fonction dédiée : aucun candidat ne peut choisir son statut.
create or replace function public.submit_candidate_application(
  p_phone text,
  p_birth_date date,
  p_nationality text,
  p_country_of_residence text,
  p_city text,
  p_education_level text,
  p_desired_program text,
  p_motivation text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if nullif(btrim(p_phone), '') is null
    or nullif(btrim(p_nationality), '') is null
    or nullif(btrim(p_country_of_residence), '') is null
    or nullif(btrim(p_city), '') is null
    or nullif(btrim(p_education_level), '') is null
    or nullif(btrim(p_desired_program), '') is null
    or nullif(btrim(p_motivation), '') is null then
    raise exception 'Veuillez compléter tous les champs obligatoires';
  end if;
  if length(p_motivation) < 40 then
    raise exception 'La motivation doit contenir au moins 40 caractères';
  end if;

  insert into public.candidate_applications (
    user_id, phone, birth_date, nationality, country_of_residence,
    city, education_level, desired_program, motivation, status, updated_at
  ) values (
    auth.uid(), left(btrim(p_phone), 40), p_birth_date,
    left(btrim(p_nationality), 100), left(btrim(p_country_of_residence), 100),
    left(btrim(p_city), 120), left(btrim(p_education_level), 120),
    left(btrim(p_desired_program), 160), left(btrim(p_motivation), 5000),
    'submitted', now()
  )
  on conflict (user_id) do update set
    phone = excluded.phone,
    birth_date = excluded.birth_date,
    nationality = excluded.nationality,
    country_of_residence = excluded.country_of_residence,
    city = excluded.city,
    education_level = excluded.education_level,
    desired_program = excluded.desired_program,
    motivation = excluded.motivation,
    status = 'submitted',
    review_note = null,
    reviewed_by = null,
    reviewed_at = null,
    updated_at = now()
  where public.candidate_applications.status = 'rejected'
  returning id into v_id;

  if v_id is null then
    raise exception 'Votre dossier existe déjà et est en cours de traitement. Contactez l’administration pour toute modification.';
  end if;
  return v_id;
end;
$$;

create or replace function public.review_candidate_application(
  p_application_id uuid,
  p_status text,
  p_review_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if p_status not in ('under_review','accepted','rejected') then
    raise exception 'Statut de traitement invalide';
  end if;
  update public.candidate_applications
  set status = p_status,
      review_note = left(nullif(btrim(p_review_note), ''), 2000),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_application_id and status in ('submitted','under_review');
  if not found then
    raise exception 'Dossier introuvable ou déjà traité';
  end if;
end;
$$;

revoke all on function public.submit_candidate_application(text,date,text,text,text,text,text,text) from public, anon;
grant execute on function public.submit_candidate_application(text,date,text,text,text,text,text,text) to authenticated;
revoke all on function public.review_candidate_application(uuid,text,text) from public, anon;
grant execute on function public.review_candidate_application(uuid,text,text) to authenticated;
