# NEXUS SCIENCE — Backend security hardening plan

**Status:** prepared only; not executed on Supabase.
**Repository:** moses-kasonga/Nexus-science
**Target branch:** security/backend-hardening-2026-11-16
**Supabase project:** zggyzsnracscupaigjcs
**Production / main / MOÏSE:** out of scope and untouched.

## 1. Summary

This branch contains a proposed SQL migration. It is not applied to any database and does not change Auth settings.

| Finding before | Proposed after | Expected effect |
|---|---|---|
| publish_homepage_content() uses search_path=public | search_path='' and all object references schema-qualified | Reduce object-shadowing risk; preserve admin gate and singleton publication |
| prevent_role_change() uses search_path=public | search_path='' | Reduce search-path risk; preserve trigger and exact role-change guard |
| public.teaches_student(uuid) callable as an exposed RPC | Move helper to private.teaches_student(uuid); policy calls private function | Keep teacher profile RLS while removing public RPC surface, provided private is not API-exposed |
| anon/authenticated have table and column INSERT grants on profiles | Revoke both table-level and column-level INSERT | Prevent direct profile insertion through Data API; preserve Auth trigger path |
| leaked-password protection disabled | No Auth setting change in this branch | Free plan cannot enable this feature; Pro or above required |

## 2. Files in this branch

- `supabase/migrations/20261116230000_backend_security_hardening.sql` — proposed transactional migration.
- `docs/security/backend-hardening-plan.md` — this plan, dependencies, risks and validation plan.

No existing application TypeScript file is changed. No existing migration is edited.

## 3. SQL design notes

### 3.1 publish_homepage_content()

The function retains its signature, SECURITY DEFINER mode, administrator check, draft lookup, missing-draft error, singleton upsert, publisher identity and publication timestamp. It uses an empty search_path and explicit references to `public.is_admin()`, `public.homepage_content_drafts`, `public.homepage_content_published`, `auth.uid()` and `pg_catalog.now()`.

The existing EXECUTE restriction is retained: PUBLIC revoked, authenticated granted.

### 3.2 prevent_role_change()

The function retains its signature, SECURITY DEFINER mode, body logic and trigger binding. `CREATE OR REPLACE FUNCTION` preserves the function OID, so the existing `profiles_prevent_role_change` trigger remains attached. The only intended behavior change is search_path hardening.

### 3.3 teaches_student(uuid)

The live database dependency scan found the policy `profiles_select_my_students` as the dependent object. The repository contains no direct application RPC call to the public function.

The migration creates `private.teaches_student(uuid)`, preserving the boolean predicate and auth.uid() relationship check, grants schema USAGE and function EXECUTE to authenticated for policy evaluation, replaces the policy to call the private function, and then drops the public function.

**Mandatory preflight:** confirm in Supabase Dashboard > Integrations > Data API that `private` is NOT in the exposed schemas list. This configuration is not versioned in the repository and could not be read by the available project metadata API. If private is exposed, do not apply this migration until it is removed from the exposed schema list. Granting EXECUTE to authenticated is needed for RLS evaluation; it does not by itself hide a function from PostgREST. The API schema allowlist is what prevents direct RPC routing.

This blocks ordinary PostgREST RPC access only. It does not prevent a user with direct database SQL access from calling the function; application users should not receive direct database credentials.

### 3.4 profiles INSERT grants

Live database inspection found:
- `handle_new_user()` is SECURITY DEFINER, owned by postgres, and is attached to `auth.users` INSERT.
- It inserts into `public.profiles` using a fixed `role='student'`.
- It does not depend on anon/authenticated INSERT privileges; it executes with the function owner's privileges.
- The catalog scan found no other public function inserting into `public.profiles`.
- Repository searches found no frontend `supabase.from('profiles').insert/upsert` call.
- The admin approval function updates an existing profile's role; it does not insert a profile.
- The migration revokes table-level AND per-column INSERT from anon and authenticated, but leaves postgres and service_role untouched.

External scripts or untracked services outside this repository were not inspectable. Confirm no such client uses direct profile INSERT before applying.

## 4. Password breach protection

The Supabase organization owning project `zggyzsnracscupaigjcs` is currently on the **Free** plan. Supabase's current Password Security documentation says leaked-password protection is available on Pro and above.

The feature uses the Have I Been Pwned Pwned Passwords API to reject known compromised passwords. Once enabled on an eligible plan, it affects:
- new password sign-ups;
- password changes and password-reset flows that set a new password.

Users with existing passwords are not automatically forced to change them merely because the setting is enabled. Existing passwords are evaluated when they set a new one; users may receive a password validation error if the chosen replacement has appeared in known leaks. Existing users can still sign in with their current password under the documented password-strength behavior.

No Auth setting or subscription plan is changed in this branch. If the organization later upgrades to Pro, enable the feature separately in Auth settings after testing signup, change-password and recovery UX.

Documentation: https://supabase.com/docs/guides/auth/password-security

## 5. Risks and rollback considerations

| Change | Regression risk | Main risk / mitigation |
|---|---|---|
| publish function search_path | Low | Test admin and non-admin publication; preserve exact function signature and grants |
| role trigger search_path | Low | Verify trigger remains attached and both admin/non-admin behavior is unchanged |
| private schema helper | Medium | RLS evaluation requires schema USAGE and function EXECUTE; private must be excluded from Data API exposed schemas; test actual teacher/student RLS |
| revoke profile INSERT | Low–medium | Auth trigger runs as postgres owner; check any untracked service or manual client INSERT before rollout |
| leaked-password protection | Medium (future Auth change) | Rejects compromised chosen passwords; upgrade plan and separately test UX |

The migration is transactional. If a migration fails before COMMIT, PostgreSQL rolls back the transaction. A post-deployment rollback should be a separately reviewed migration restoring the old policy/function location and INSERT grants; do not use ad-hoc rollback in production.

## 6. Validation plan (not run against production)

### Static checks completed

- [x] Confirmed project identity and current PostgreSQL version.
- [x] Confirmed organization plan is Free.
- [x] Confirmed private schema does not currently exist.
- [x] Confirmed anon/authenticated have no CREATE privilege on public.
- [x] Confirmed Auth trigger `on_auth_user_created` calls `public.handle_new_user()`.
- [x] Confirmed `handle_new_user()` is SECURITY DEFINER and owned by postgres.
- [x] Confirmed only catalog dependency of public.teaches_student(uuid) is the profile SELECT policy.
- [x] Confirmed repository helper `publishHomepageDraft()` calls `supabase.rpc("publish_homepage_content")`; signature and RPC remain unchanged.
- [x] Confirmed the teacher policy is the only repository reference found for teaches_student.
- [x] No live SQL DDL, DML, migration, Auth setting, account or role changes were made.

### Tests required in a disposable Supabase development branch

1. Apply migration to a disposable branch/database only after confirming private is not Data API-exposed.
2. Check function settings: both hardened functions and private.teaches_student have empty search_path.
3. Check trigger catalog: profiles_prevent_role_change still points to public.prevent_role_change.
4. As student: own profile SELECT; other profile denied; direct role UPDATE denied.
5. As teacher: own profile and assigned-student profile SELECT; unrelated student denied.
6. Call `/rest/v1/rpc/teaches_student` with authenticated token: must be unavailable because private is not exposed; verify no public function remains.
7. Verify RLS policy can still invoke private.teaches_student and assigned student remains visible.
8. As non-admin: publish RPC denied.
9. As admin: publish a known disposable draft; verify singleton published row, publisher UID and timestamp; then reset disposable branch.
10. Auth signup: create disposable Auth user; verify trigger inserts a student profile despite anon/authenticated INSERT revocation.
11. Try direct INSERT into profiles as anon and authenticated; both must fail.
12. Confirm service_role and postgres server-side workflows still work as intended.
13. Run Supabase security advisors and application smoke tests.

### Test results

No migration was applied to production or to a development database. No DDL/DML test was executed against Supabase. Static checks above are the only completed tests. All behavioral tests in the disposable branch remain **NOT RUN**.

## 7. Before/after comparison

| Surface | Before | Proposed after |
|---|---|---|
| Homepage publisher | search_path public | empty search_path, schema-qualified references |
| Role guard | search_path public | empty search_path; trigger unchanged |
| Teacher relationship helper | public RPC | private helper called by RLS |
| Teacher profile policy | public.teaches_student(id) | private.teaches_student(id), same predicate |
| Profile direct INSERT | grants exist for anon/authenticated; RLS has no INSERT policy | grants removed; Auth trigger still inserts as postgres definer |
| Leaked password protection | disabled; Free plan | unchanged; requires Pro+ |

## 8. Approval gates before any rollout

1. Confirm `private` is not in the Data API exposed schemas.
2. Confirm there are no external integrations or manual processes that directly insert into `public.profiles`.
3. Run the full disposable-branch validation matrix.
4. Review the migration diff and test evidence.
5. Obtain explicit authorization before applying anything to the production Supabase project or merging a PR.
