# Isolated Gmail SMTP test

This function is intentionally separate from `send-feedback-reply`.

## Safety properties

- Requires a valid Supabase user JWT and an authenticated profile with `role = 'admin'`.
- Sends exactly one test email to the configured `SMTP_USER` address; the request cannot choose a recipient.
- Does not read or write `feedback_messages`.
- Does not send messages to students.
- Uses the existing SMTP secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `FEEDBACK_FROM_EMAIL`.

## Deploy only this function

From the repository root, with Supabase CLI authenticated to the intended project:

```sh
supabase functions deploy test-gmail-smtp --project-ref zggyzsnracscupaigjcs
```

Do not deploy `send-feedback-reply` as part of this test.

## Invoke

Invoke `test-gmail-smtp` while signed in as a NEXUS SCIENCE administrator. The function requires the user's access token. A successful response confirms SMTP verification and that Gmail accepted the test message for delivery to `SMTP_USER`.

Check the inbox (and Spam) of `nexus.science.contact@gmail.com`. A successful SMTP response means Gmail accepted the message; it does not guarantee inbox placement.

## Logs and cleanup

Inspect the Edge Function logs for `test-gmail-smtp` if the call fails. After a successful test, the function can be deleted from the Supabase project and this test-only branch can be closed or removed. Keep the SMTP secrets; they are also needed by the separate feedback-reply function.
