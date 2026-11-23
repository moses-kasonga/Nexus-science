-- Keep the existing authorization semantics while evaluating auth.uid() once per statement.
DROP POLICY IF EXISTS feedback_message_deletions_insert_own ON public.feedback_message_deletions;
CREATE POLICY feedback_message_deletions_insert_own
ON public.feedback_message_deletions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.feedback_messages AS message
    WHERE message.id = feedback_message_deletions.message_id
      AND (
        message.student_id = (SELECT auth.uid())
        OR (SELECT public.current_user_is_admin())
      )
  )
);

DROP POLICY IF EXISTS feedback_message_deletions_read_own ON public.feedback_message_deletions;
CREATE POLICY feedback_message_deletions_read_own
ON public.feedback_message_deletions
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS feedback_messages_read_own_or_admin ON public.feedback_messages;
CREATE POLICY feedback_messages_read_own_or_admin
ON public.feedback_messages
FOR SELECT TO authenticated
USING (
  (
    student_id = (SELECT auth.uid())
    OR (SELECT public.current_user_is_admin())
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.feedback_message_deletions AS deletion
    WHERE deletion.message_id = feedback_messages.id
      AND deletion.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS feedback_messages_student_insert ON public.feedback_messages;
CREATE POLICY feedback_messages_student_insert
ON public.feedback_messages
FOR INSERT TO authenticated
WITH CHECK (
  student_id = (SELECT auth.uid())
  AND sender_id = (SELECT auth.uid())
  AND sender_role = 'student'
  AND reply_to_id IS NULL
  AND email_sent_at IS NULL
);

-- Cover the two foreign keys identified by the performance advisor.
CREATE INDEX IF NOT EXISTS candidate_application_internal_notes_created_by_idx
  ON public.candidate_application_internal_notes (created_by);

CREATE INDEX IF NOT EXISTS feedback_messages_sender_id_idx
  ON public.feedback_messages (sender_id);
