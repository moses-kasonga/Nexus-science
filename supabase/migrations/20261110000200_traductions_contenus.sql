-- Cache des traductions des cours et leçons de NEXUS SCIENCE.
-- Les textes sources restent dans courses et lessons ; cette table ne stocke que les versions traduites.

create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('course', 'lesson')),
  entity_id uuid not null,
  source_hash text not null,
  source_language text not null check (source_language in ('fr', 'en', 'pt', 'es')),
  target_language text not null check (target_language in ('fr', 'en', 'pt', 'es')),
  translated_content jsonb not null,
  provider text not null default 'libretranslate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_translations_not_same_language check (source_language <> target_language),
  constraint content_translations_unique_version unique (entity_type, entity_id, source_hash, target_language)
);

create index if not exists content_translations_lookup_idx
  on public.content_translations (entity_type, entity_id, target_language);

alter table public.content_translations enable row level security;
revoke all on public.content_translations from anon, authenticated;
grant select on public.content_translations to anon, authenticated;

create policy content_translations_public_courses
on public.content_translations
for select to anon
using (
  entity_type = 'course'
  and exists (
    select 1 from public.courses c
    where c.id = content_translations.entity_id and c.published = true
  )
);

create policy content_translations_authenticated_courses
on public.content_translations
for select to authenticated
using (
  entity_type = 'course'
  and exists (
    select 1 from public.courses c
    where c.id = content_translations.entity_id
      and (c.published = true or public.has_course_access(c.id))
  )
);

create policy content_translations_authenticated_lessons
on public.content_translations
for select to authenticated
using (
  entity_type = 'lesson'
  and exists (
    select 1 from public.lessons l
    where l.id = content_translations.entity_id
      and l.published = true
      and public.has_course_access(l.course_id)
  )
);
