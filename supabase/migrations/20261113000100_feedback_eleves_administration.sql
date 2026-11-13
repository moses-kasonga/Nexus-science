-- Messages de feedback entre les élèves et l'administration.
create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('student','admin')),
  subject text not null check (char_length(btrim(subject)) between 3 and 160),
  body text not null check (char_length(btrim(body)) between 3 and 10000),
  reply_to_id uuid references public.feedback_messages(id) on delete cascade,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feedback_messages_student_created_idx
  on public.feedback_messages(student_id, created_at desc);
create index if not exists feedback_messages_thread_idx
  on public.feedback_messages(reply_to_id, created_at);

alter table public.feedback_messages enable row level security;

drop policy if exists feedback_messages_read_own_or_admin on public.feedback_messages;
create policy feedback_messages_read_own_or_admin
  on public.feedback_messages for select to authenticated
  using (student_id = auth.uid() or (select public.current_user_is_admin()));

drop policy if exists feedback_messages_student_insert on public.feedback_messages;
create policy feedback_messages_student_insert
  on public.feedback_messages for insert to authenticated
  with check (
    student_id = auth.uid()
    and sender_id = auth.uid()
    and sender_role = 'student'
    and reply_to_id is null
    and email_sent_at is null
  );

grant select, insert on public.feedback_messages to authenticated;
revoke update, delete on public.feedback_messages from anon, authenticated;
