-- Suppression individuelle des messages de feedback : le contenu partagé reste intact.
create table if not exists public.feedback_message_deletions (
  message_id uuid not null references public.feedback_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists feedback_message_deletions_user_idx
  on public.feedback_message_deletions(user_id, deleted_at desc);

alter table public.feedback_message_deletions enable row level security;

drop policy if exists feedback_message_deletions_read_own on public.feedback_message_deletions;
create policy feedback_message_deletions_read_own
  on public.feedback_message_deletions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists feedback_message_deletions_insert_own on public.feedback_message_deletions;
create policy feedback_message_deletions_insert_own
  on public.feedback_message_deletions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.feedback_messages message
      where message.id = message_id
        and (message.student_id = auth.uid() or (select public.current_user_is_admin()))
    )
  );

grant select, insert on public.feedback_message_deletions to authenticated;
revoke update, delete on public.feedback_message_deletions from anon, authenticated;

-- Un message masqué par un participant reste visible à l'autre participant.
drop policy if exists feedback_messages_read_own_or_admin on public.feedback_messages;
create policy feedback_messages_read_own_or_admin
  on public.feedback_messages for select to authenticated
  using (
    (student_id = auth.uid() or (select public.current_user_is_admin()))
    and not exists (
      select 1 from public.feedback_message_deletions deletion
      where deletion.message_id = feedback_messages.id
        and deletion.user_id = auth.uid()
    )
  );
