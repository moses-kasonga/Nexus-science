-- Préférence linguistique persistante par compte.
alter table public.profiles
  add column if not exists preferred_language text not null default 'fr'
  check (preferred_language in ('fr', 'en', 'pt', 'es'));

