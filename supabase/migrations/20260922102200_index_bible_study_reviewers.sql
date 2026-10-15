-- Cover the two auth.users foreign keys introduced by Bible Study review
-- provenance. Partial indexes keep null draft rows out of the index.
create index if not exists bible_study_revisions_scripture_verified_by_idx
  on public.bible_study_revisions(scripture_verified_by)
  where scripture_verified_by is not null;

create index if not exists bible_study_revisions_approved_by_idx
  on public.bible_study_revisions(approved_by)
  where approved_by is not null;
