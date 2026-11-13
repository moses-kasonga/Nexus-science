# Send feedback replies through Gmail SMTP

The `send-feedback-reply` Edge Function sends the administrator's reply to the student's registered email address and includes a link to the student's NEXUS SCIENCE area. The email is a notification only: students must sign in at `/espace-etudiant` to continue the conversation. Replies sent directly to Gmail are not imported into the platform.

## Required Supabase Edge Function secrets

Configure these in **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `nexus.science.contact@gmail.com` |
| `SMTP_PASS` | Google App Password for the dedicated NEXUS SCIENCE Gmail account |
| `FEEDBACK_FROM_EMAIL` | `nexus.science.contact@gmail.com` |
| `APP_ORIGIN` | `https://nexus-science-rho.vercel.app` (base URL used in student emails) |\n| `APP_ALLOWED_ORIGINS` | `https://nexus-science-rho.vercel.app,https://nexus-science-git-feature-moise-assi-1f3adb-mkasongajunior-6102.vercel.app` (comma-separated exact browser origins allowed to invoke the function) |

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions automatically. Do not add or expose the service-role key in the frontend.

When entering the Google App Password, remove the display spaces if Google shows it in groups. Never commit it to Git, put it in frontend environment variables, or share it in chat.

## Deploy

From the repository root, after confirming the target Supabase project:

```sh
supabase link --project-ref zggyzsnracscupaigjcs
supabase functions deploy send-feedback-reply
```

Do not deploy this function to the shared project until the SMTP secrets have been configured and the deployment is explicitly approved.

## Validation checklist

1. Confirm the secrets are present without displaying their values.
2. Deploy the function to the intended Supabase project.
3. Sign in to NEXUS SCIENCE with an administrator account.
4. Reply to a test feedback message belonging to a test student whose email you can access.
5. Confirm the email arrives from **NEXUS SCIENCE | NO REPLY**, contains the administrator's actual reply, and links to `/espace-etudiant`.
6. Sign in as the test student and confirm the reply appears in the conversation history.
7. Reply from the student area and confirm the new message appears in the admin feedback inbox.

Gmail SMTP on port 465 has been demonstrated with Supabase Edge Functions, but outbound SMTP behavior can vary by runtime/network. If the connection times out, do not assume the app password is wrong; inspect the Edge Function logs before changing credentials or code.
