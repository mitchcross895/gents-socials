-- Discussion under WSL articles. Anyone can read it; signed-in members can comment on
-- published articles. Commenters can delete their own comments, and an article's writer
-- can delete any comment on their article.

create table public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index article_comments_article_id_idx on public.article_comments (article_id, created_at);
create index article_comments_author_id_idx on public.article_comments (author_id, created_at);

alter table public.article_comments enable row level security;

revoke all on public.article_comments from anon, authenticated;
grant select on public.article_comments to anon, authenticated;
grant insert (article_id, body) on public.article_comments to authenticated;
grant delete on public.article_comments to authenticated;

-- The articles check runs with the reader's own access, so comments on drafts
-- are only visible to the writers
create policy "Comments are visible with their article" on public.article_comments
  for select to anon, authenticated
  using (exists (select 1 from public.articles a where a.id = article_id));

create policy "Members comment on published articles" on public.article_comments
  for insert to authenticated
  with check ((select auth.uid()) = author_id
              and exists (select 1 from public.articles a where a.id = article_id and a.published));

create policy "Commenters and the article's writer can delete comments" on public.article_comments
  for delete to authenticated
  using ((select auth.uid()) = author_id
         or exists (select 1 from public.articles a where a.id = article_id and a.author_id = (select auth.uid())));

create trigger article_comments_rate_limit before insert on public.article_comments
  for each row execute function public.enforce_rate_limit('20', '5 minutes');
