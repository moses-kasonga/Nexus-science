-- Masquage logique des conversations et de l'historique par utilisateur.
-- SECURITY INVOKER : les politiques RLS existantes restent appliquées.
-- Les messages originaux ne sont jamais modifiés ni supprimés.

create or replace function public.hide_feedback_conversation(p_root_message_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  with recursive thread_messages(id) as (
    select root_message.id
    from public.feedback_messages as root_message
    where root_message.id = p_root_message_id
      and root_message.reply_to_id is null

    union

    select child_message.id
    from public.feedback_messages as child_message
    join thread_messages as parent_message
      on child_message.reply_to_id = parent_message.id
  )
  insert into public.feedback_message_deletions (message_id, user_id)
  select thread_messages.id, (select auth.uid())
  from thread_messages
  on conflict (message_id, user_id) do nothing;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function public.hide_all_feedback_history()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  insert into public.feedback_message_deletions (message_id, user_id)
  select message_row.id, (select auth.uid())
  from public.feedback_messages as message_row
  on conflict (message_id, user_id) do nothing;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

-- Les RPC sont réservées aux utilisateurs authentifiés.
revoke all on function public.hide_feedback_conversation(uuid) from public, anon;
revoke all on function public.hide_all_feedback_history() from public, anon;
grant execute on function public.hide_feedback_conversation(uuid) to authenticated;
grant execute on function public.hide_all_feedback_history() to authenticated;
