-- WSL ("Window Shopping Life"): a blog that only chosen members can write.
-- Everyone can read published articles. Writers are listed in blog_authors, which is
-- managed from the SQL Editor only, e.g.:
--   insert into public.blog_authors (user_id)
--   select id from public.profiles where handle in ('handle_one', 'handle_two');

create table public.blog_authors (
  user_id uuid primary key references public.profiles (id) on delete cascade
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 150),
  summary text not null default '' check (char_length(summary) <= 300),
  body text not null default '' check (char_length(body) <= 100000),
  -- First picture in the article, shown on the article list
  cover_path text check (cover_path is null or cover_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,100}$'),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index articles_created_at_idx on public.articles (created_at desc);
create index articles_author_id_idx on public.articles (author_id);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create trigger articles_touch_updated_at before update on public.articles
  for each row execute function public.touch_updated_at();

-- True when the signed-in member is a blog writer
create function public.is_blog_author()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.blog_authors where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_blog_author() from public;
grant execute on function public.is_blog_author() to anon, authenticated;

alter table public.blog_authors enable row level security;
alter table public.articles enable row level security;

revoke all on public.blog_authors, public.articles from anon, authenticated;
grant select on public.blog_authors, public.articles to anon, authenticated;
grant insert (title, summary, body, cover_path, published) on public.articles to authenticated;
grant update (title, summary, body, cover_path, published) on public.articles to authenticated;
grant delete on public.articles to authenticated;

-- The page uses this list to decide who sees the "New article" button
create policy "Anyone can see who writes the blog" on public.blog_authors
  for select to anon, authenticated using (true);

-- Writers can also see drafts, including each other's
create policy "Published articles are public; writers see drafts" on public.articles
  for select to anon, authenticated using (published or (select public.is_blog_author()));

create policy "Writers create their own articles" on public.articles
  for insert to authenticated
  with check ((select auth.uid()) = author_id and (select public.is_blog_author()));

create policy "Writers edit their own articles" on public.articles
  for update to authenticated
  using ((select auth.uid()) = author_id and (select public.is_blog_author()))
  with check ((select auth.uid()) = author_id and (select public.is_blog_author()));

create policy "Writers delete their own articles" on public.articles
  for delete to authenticated
  using ((select auth.uid()) = author_id and (select public.is_blog_author()));

-- Pictures for articles. Public to read; writers upload to a folder named after their user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Writers upload blog pictures to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.is_blog_author()));

create policy "Writers see blog pictures in their own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Writers delete blog pictures in their own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
