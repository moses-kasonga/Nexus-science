-- Least privilege for per-user Feedback message hiding.
-- Revoke both table-level and column-level grants. RLS remains enabled and
-- the existing policies are unchanged.

revoke all privileges
  on table public.feedback_message_deletions
  from public, anon, authenticated;

revoke all privileges (message_id, user_id, deleted_at)
  on table public.feedback_message_deletions
  from public, anon, authenticated;

grant select, insert
  on table public.feedback_message_deletions
  to authenticated;

-- Verify effective privileges. PUBLIC grants are inherited by every role,
-- including anon and authenticated, so these checks also detect PUBLIC access.
-- This avoids parsing PostgreSQL ACL arrays directly.
do $$
declare
  v_table regclass := 'public.feedback_message_deletions'::regclass;
  v_privilege text;
  v_column text;
begin
  foreach v_privilege in array array[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ] loop
    if has_table_privilege('anon', v_table, v_privilege) then
      raise exception 'anon retains effective % privilege on feedback_message_deletions', v_privilege;
    end if;

    if has_table_privilege('authenticated', v_table, v_privilege)
       <> (v_privilege in ('SELECT', 'INSERT')) then
      raise exception 'authenticated has unexpected effective % privilege on feedback_message_deletions', v_privilege;
    end if;
  end loop;

  foreach v_column in array array['message_id', 'user_id', 'deleted_at'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_column_privilege('anon', v_table, v_column, v_privilege) then
        raise exception 'anon retains effective % privilege on column %', v_privilege, v_column;
      end if;

      if v_privilege in ('UPDATE', 'REFERENCES')
         and has_column_privilege('authenticated', v_table, v_column, v_privilege) then
        raise exception 'authenticated retains effective % privilege on column %', v_privilege, v_column;
      end if;
    end loop;
  end loop;
end
$$;

-- Expected effective table privileges:
-- anon:          none
-- authenticated: SELECT, INSERT only
-- PUBLIC:        no effective access (covered by the role checks above)
