-- Ressources pédagogiques privées attachées aux leçons (images, vidéos et PDF).
begin;

alter table public.lessons drop constraint if exists lessons_id_course_id_key;
alter table public.lessons add constraint lessons_id_course_id_key unique (id, course_id);

create table if not exists public.lesson_assets (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  asset_type text not null check (asset_type in ('image','video','pdf')),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  caption text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lesson_assets_lesson_course_fk foreign key (lesson_id, course_id)
    references public.lessons(id, course_id) deferrable initially deferred
);

create index if not exists lesson_assets_lesson_idx on public.lesson_assets(lesson_id, created_at);

alter table public.lesson_assets enable row level security;
revoke all on public.lesson_assets from anon, authenticated;
grant select, insert, update, delete on public.lesson_assets to authenticated;

drop policy if exists lesson_assets_read_course_access on public.lesson_assets;
create policy lesson_assets_read_course_access on public.lesson_assets
for select to authenticated using (
  public.is_admin()
  or public.is_course_teacher(course_id)
  or exists (
    select 1 from public.lessons l
    where l.id = lesson_assets.lesson_id and l.course_id = lesson_assets.course_id
      and l.published = true and public.has_course_access(lesson_assets.course_id)
  )
);

drop policy if exists lesson_assets_teacher_insert on public.lesson_assets;
create policy lesson_assets_teacher_insert on public.lesson_assets
for insert to authenticated with check (
  created_by = auth.uid()
  and (public.is_admin() or public.is_assigned_teacher(course_id))
  and exists (select 1 from public.lessons l where l.id = lesson_assets.lesson_id and l.course_id = lesson_assets.course_id)
);

drop policy if exists lesson_assets_teacher_update on public.lesson_assets;
create policy lesson_assets_teacher_update on public.lesson_assets
for update to authenticated using (public.is_admin() or public.is_assigned_teacher(course_id))
with check (public.is_admin() or public.is_assigned_teacher(course_id));

drop policy if exists lesson_assets_teacher_delete on public.lesson_assets;
create policy lesson_assets_teacher_delete on public.lesson_assets
for delete to authenticated using (public.is_admin() or public.is_assigned_teacher(course_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-assets','lesson-assets',false,52428800,
  array['image/jpeg','image/png','image/webp','image/avif','application/pdf','video/mp4','video/webm'])
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lesson_assets_storage_teacher_insert on storage.objects;
create policy lesson_assets_storage_teacher_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'lesson-assets'
  and (public.is_admin() or public.is_assigned_teacher((storage.foldername(name))[1]::uuid))
);

drop policy if exists lesson_assets_storage_read_access on storage.objects;
create policy lesson_assets_storage_read_access on storage.objects
for select to authenticated using (
  bucket_id = 'lesson-assets'
  and exists (
    select 1 from public.lesson_assets la
    join public.lessons l on l.id = la.lesson_id and l.course_id = la.course_id
    where la.object_path = name
      and (public.is_admin() or public.is_course_teacher(la.course_id)
        or (l.published = true and public.has_course_access(la.course_id)))
  )
);

drop policy if exists lesson_assets_storage_teacher_update on storage.objects;
create policy lesson_assets_storage_teacher_update on storage.objects
for update to authenticated using (
  bucket_id = 'lesson-assets'
  and (public.is_admin() or public.is_assigned_teacher((storage.foldername(name))[1]::uuid))
) with check (
  bucket_id = 'lesson-assets'
  and (public.is_admin() or public.is_assigned_teacher((storage.foldername(name))[1]::uuid))
);

drop policy if exists lesson_assets_storage_teacher_delete on storage.objects;
create policy lesson_assets_storage_teacher_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'lesson-assets'
  and (public.is_admin() or public.is_assigned_teacher((storage.foldername(name))[1]::uuid))
);

commit;
