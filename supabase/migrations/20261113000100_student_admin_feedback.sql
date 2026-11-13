-- NEXUS SCIENCE: feedback interne entre élèves et administration.
-- Les réponses restent dans la plateforme : aucune notification e-mail n'est envoyée.

begin;

create table if not exists public.student_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general'
    check (category in ('general','course','technical','suggestion','other')),
  subject text not null check (char_length(btrim(subject)) between 3 and 140),
  message text not null check (char_length(btrim(message)) between 10 and 5000),
  status text not null default 'pending' check (status in ('pending','replied')),
  response text,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_feedback_reply_consistency check (
    (status = 'pending' and response is null and responded_at is null and responded_by is null)
    or
    (status = 'replied' and response is not null and char_length(btrim(response)) > 0 and responded_at is not null and responded_by is not null)
  )
);

create index if not exists student_feedback_student_created_idx
  on public.student_feedback (student_id, created_at desc);
create index if not exists student_feedback_status_created_idx
  on public.student_feedback (status, created_at desc);

alter table public.student_feedback enable row level security;

drop policy if exists student_feedback_read_own on public.student_feedback;
create policy student_feedback_read_own
  on public.student_feedback for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists student_feedback_insert_own on public.student_feedback;
create policy student_feedback_insert_own
  on public.student_feedback for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'student'
    )
    and status = 'pending'
    and response is null
    and responded_by is null
    and responded_at is null
  );

drop policy if exists student_feedback_admin_read on public.student_feedback;
create policy student_feedback_admin_read
  on public.student_feedback for select to authenticated
  using ((select public.is_admin()));

drop policy if exists student_feedback_admin_reply on public.student_feedback;
create policy student_feedback_admin_reply
  on public.student_feedback for update to authenticated
  using ((select public.is_admin()))
  with check (
    (select public.is_admin())
    and status = 'replied'
    and response is not null
    and char_length(btrim(response)) > 0
    and responded_by = (select auth.uid())
    and responded_at is not null
  );

-- L'administrateur ne peut modifier que les colonnes de réponse, pas le message original.
revoke update on public.student_feedback from authenticated;
grant update (status, response, responded_by, responded_at, updated_at)
  on public.student_feedback to authenticated;
grant select, insert on public.student_feedback to authenticated;

commit;
