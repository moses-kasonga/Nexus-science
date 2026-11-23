-- NEXUS SCIENCE staging: invitation email validation and private lesson asset path integrity.
-- Also remove unused mutation paths for lesson metadata/storage objects and published homepage content.

begin;

-- 1) Repair invitation email validation.
-- The previous regex used a double-escaped dot and rejected ordinary addresses.
create or replace function public.create_teacher_invitation(p_email text)
returns table(invitation_id uuid, raw_token text, email text, expires_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'Réservé aux administrateurs';
  end if;

  if v_email is null
     or length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_email, 0)
  );

  update public.teacher_invitations ti
     set revoked_at = pg_catalog.now()
   where lower(ti.email) = v_email
     and ti.used_at is null
     and ti.revoked_at is null
     and ti.expires_at > pg_catalog.now();

  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

  insert into public.teacher_invitations (email, token_hash, expires_at, created_by)
  values (
    v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires,
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_token, v_email, v_expires;
end;
$function$;

-- 2) Enforce the application file layout and actual allowed type/size ranges
-- represented by the platform UI and Storage bucket limits.
alter table public.lesson_assets
  drop constraint if exists lesson_assets_object_path_course_lesson_check,
  drop constraint if exists lesson_assets_type_mime_size_check;

alter table public.lesson_assets
  add constraint lesson_assets_object_path_course_lesson_check
  check (
    length(object_path) <= 1024
    and object_path like course_id::text || '/' || lesson_id::text || '/%'
  ),
  add constraint lesson_assets_type_mime_size_check
  check (
    (asset_type = 'image'
      and mime_type in ('image/jpeg','image/png','image/webp','image/avif')
      and file_size between 1 and 5242880)
    or
    (asset_type = 'pdf'
      and mime_type = 'application/pdf'
      and file_size between 1 and 20971520)
    or
    (asset_type = 'video'
      and mime_type in ('video/mp4','video/webm')
      and file_size between 1 and 52428800)
  );

-- 3) Teachers have no application use case for editing metadata rows after upload.
-- Remove the broad update policy and privilege, preserving select/insert/delete.
drop policy if exists lesson_assets_teacher_update on public.lesson_assets;
revoke update on table public.lesson_assets from authenticated;

-- 4) Storage upload now requires a real lesson matching both path segments.
-- This prevents course-only folders and mismatched course/lesson prefixes.
drop policy if exists lesson_assets_storage_teacher_insert on storage.objects;
create policy lesson_assets_storage_teacher_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'lesson-assets'
  and exists (
    select 1
    from public.lessons l
    where l.course_id::text = (storage.foldername(name))[1]
      and l.id::text = (storage.foldername(name))[2]
  )
  and (
    public.is_admin()
    or exists (
      select 1
      from public.lessons l
      join public.course_teachers ct on ct.course_id = l.course_id
      join public.profiles teacher_profile on teacher_profile.id = ct.teacher_id
      where l.course_id::text = (storage.foldername(name))[1]
        and l.id::text = (storage.foldername(name))[2]
        and ct.teacher_id = auth.uid()
        and teacher_profile.role = 'teacher'
    )
  )
);

drop policy if exists lesson_assets_storage_teacher_delete on storage.objects;
create policy lesson_assets_storage_teacher_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'lesson-assets'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.lessons l
      join public.course_teachers ct on ct.course_id = l.course_id
      join public.profiles teacher_profile on teacher_profile.id = ct.teacher_id
      where l.course_id::text = (storage.foldername(name))[1]
        and l.id::text = (storage.foldername(name))[2]
        and ct.teacher_id = auth.uid()
        and teacher_profile.role = 'teacher'
    )
  )
);

-- The frontend only uploads with upsert=false; renaming/overwriting objects is not used.
drop policy if exists lesson_assets_storage_teacher_update on storage.objects;

-- 5) The published homepage is read-only for browser clients.
-- The SECURITY DEFINER publisher remains the only exposed write path.
revoke insert, update, delete, truncate, references, trigger
on table public.homepage_content_published
from anon, authenticated;
grant select on table public.homepage_content_published to anon, authenticated;

commit;