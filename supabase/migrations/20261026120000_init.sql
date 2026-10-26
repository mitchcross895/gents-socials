-- Gents Socials: initial schema
-- Tables for profiles, posts, likes, comments, forum threads and replies,
-- with row-level security so anyone can read and members can only write as themselves.

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  handle text not null unique check (handle ~ '^[a-z0-9_]{1,20}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  color text not null default '#9a6b1f'
    check (color in ('#9a6b1f', '#2f6f8f', '#5b7f3a', '#8a4b8f', '#b4492f', '#3d4a5c')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_id_idx on public.posts (author_id);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_id_idx on public.post_likes (user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_post_id_idx on public.comments (post_id);
create index comments_author_id_idx on public.comments (author_id);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category text not null check (category in ('General', 'Style', 'Fitness', 'Career', 'Off-topic')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index threads_author_id_idx on public.threads (author_id);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index replies_thread_id_idx on public.replies (thread_id);
create index replies_author_id_idx on public.replies (author_id);

-- ---------- Privileges (only what the site needs) ----------

revoke all on public.profiles, public.posts, public.post_likes, public.comments, public.threads, public.replies
  from anon, authenticated;

grant select on public.profiles, public.posts, public.post_likes, public.comments, public.threads, public.replies
  to anon, authenticated;

grant update (name, handle, bio, color) on public.profiles to authenticated;

grant insert, delete on public.posts, public.post_likes, public.comments, public.threads, public.replies
  to authenticated;

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.threads enable row level security;
alter table public.replies enable row level security;

create policy "Anyone can read profiles" on public.profiles
  for select to anon, authenticated using (true);
create policy "Members update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Anyone can read posts" on public.posts
  for select to anon, authenticated using (true);
create policy "Members create their own posts" on public.posts
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Members delete their own posts" on public.posts
  for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Anyone can read likes" on public.post_likes
  for select to anon, authenticated using (true);
create policy "Members like as themselves" on public.post_likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Members remove their own likes" on public.post_likes
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Anyone can read comments" on public.comments
  for select to anon, authenticated using (true);
create policy "Members create their own comments" on public.comments
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Members delete their own comments" on public.comments
  for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Anyone can read threads" on public.threads
  for select to anon, authenticated using (true);
create policy "Members create their own threads" on public.threads
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Members delete their own threads" on public.threads
  for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Anyone can read replies" on public.replies
  for select to anon, authenticated using (true);
create policy "Members create their own replies" on public.replies
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "Members delete their own replies" on public.replies
  for delete to authenticated using ((select auth.uid()) = author_id);

-- ---------- Create a profile automatically on sign-up ----------
-- Uses the name/handle passed in sign-up metadata; adds digits if the handle is taken.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), ''),
    '[^a-zA-Z0-9_]', '', 'g'));
  base := left(nullif(base, ''), 15);
  if base is null then
    base := 'member';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    candidate := base || (floor(random() * 10000))::int::text;
  end loop;

  insert into public.profiles (id, name, handle)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), candidate), 40),
    candidate
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
