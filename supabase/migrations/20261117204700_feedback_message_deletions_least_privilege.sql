-- Least privilege for per-user Feedback message hiding.
-- Revoke both table-level and column-level grants, including grants inherited
-- from PUBLIC. RLS remains enabled and the existing policies are unchanged.

revoke all privileges
  on table public.feedback_message_deletions
  from public, anon, authenticated;

revoke all privileges (message_id, user_id, deleted_at)
  on table public.feedback_message_deletions
  from public, anon, authenticated;

grant select, insert
  on table public.feedback_message_deletions
  to authenticated;

-- Expected effective table privileges:
-- anon:          none
-- authenticated: SELECT, INSERT only
-- PUBLIC:        none
