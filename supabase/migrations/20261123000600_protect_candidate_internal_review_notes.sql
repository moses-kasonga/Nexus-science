-- NEXUS SCIENCE: protect internal candidate-review notes and tighten admission workflow.
-- Applied to staging only; keep in the security remediation branch for review.

begin;

create table if not exists public.candidate_application_internal_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.candidate_applications(id) on delete cascade,
  decision_status text not null
    check (decision_status in ('under_review', 'accepted')),
  note text not null
    check (length(btrim(note)) > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists candidate_app_internal_notes_latest_idx
  on public.candidate_application_internal_notes(application_id, created_at desc);

alter table public.candidate_application_internal_notes enable row level security;
revoke all on table public.candidate_application_internal_notes from public, anon, authenticated;
grant select on table public.candidate_application_internal_notes to authenticated;

drop policy if exists candidate_app_internal_notes_admin_select
  on public.candidate_application_internal_notes;
create policy candidate_app_internal_notes_admin_select
  on public.candidate_application_internal_notes
  for select to authenticated
  using (public.is_admin());

-- Preserve legacy notes as private administrative history where their status
-- indicates that the admin UI treated them as internal. Keep rejection reasons
-- in candidate_applications.review_note because the applicant is allowed to see them.
insert into public.candidate_application_internal_notes
  (application_id, decision_status, note, created_by, created_at)
select ca.id, ca.status, ca.review_note, ca.reviewed_by,
       coalesce(ca.reviewed_at, ca.updated_at, ca.created_at)
from public.candidate_applications ca
where ca.status in ('under_review', 'accepted')
  and nullif(btrim(ca.review_note), '') is not null;

update public.candidate_applications
set review_note = null
where status in ('under_review', 'accepted')
  and review_note is not null;

-- Applicant accounts must be student profiles. Inputs are normalized and
-- validated server-side; rejected applications may be resubmitted atomically.
create or replace function public.submit_candidate_application(
  p_phone text,
  p_birth_date date,
  p_nationality text,
  p_country_of_residence text,
  p_city text,
  p_education_level text,
  p_desired_program text,
  p_motivation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_motivation text := btrim(coalesce(p_motivation, ''));
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'student'
  ) then
    raise exception 'Seuls les comptes élèves peuvent déposer un dossier candidat';
  end if;

  if nullif(btrim(p_phone), '') is null
     or nullif(btrim(p_nationality), '') is null
     or nullif(btrim(p_country_of_residence), '') is null
     or nullif(btrim(p_city), '') is null
     or nullif(btrim(p_education_level), '') is null
     or nullif(btrim(p_desired_program), '') is null
     or length(v_motivation) < 40 then
    raise exception 'Veuillez compléter les champs obligatoires ; la motivation doit contenir au moins 40 caractères';
  end if;

  if p_birth_date is not null and p_birth_date > current_date then
    raise exception 'La date de naissance ne peut pas être dans le futur';
  end if;

  insert into public.candidate_applications (
    user_id, phone, birth_date, nationality, country_of_residence,
    city, education_level, desired_program, motivation, status, updated_at
  ) values (
    auth.uid(), left(btrim(p_phone), 40), p_birth_date,
    left(btrim(p_nationality), 100), left(btrim(p_country_of_residence), 100),
    left(btrim(p_city), 120), left(btrim(p_education_level), 120),
    left(btrim(p_desired_program), 160), left(v_motivation, 5000),
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
$function$;

-- Serialize review transitions and split public rejection feedback from
-- private administrative notes. Only submitted/under_review cases can transition.
create or replace function public.review_candidate_application(
  p_application_id uuid,
  p_status text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_application public.candidate_applications%rowtype;
  v_note text := left(nullif(btrim(p_review_note), ''), 2000);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;

  if p_status is null or p_status not in ('under_review', 'accepted', 'rejected') then
    raise exception 'Statut de traitement invalide';
  end if;

  select *
    into v_application
  from public.candidate_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Dossier introuvable';
  end if;

  if v_application.status not in ('submitted', 'under_review') then
    raise exception 'Dossier déjà traité ou en attente de nouvelle soumission';
  end if;

  update public.candidate_applications
     set status = p_status,
         review_note = case when p_status = 'rejected' then v_note else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   where id = p_application_id;

  if p_status in ('under_review', 'accepted') and v_note is not null then
    insert into public.candidate_application_internal_notes
      (application_id, decision_status, note, created_by)
    values
      (p_application_id, p_status, v_note, auth.uid());
  end if;
end;
$function$;

commit;