-- Likes on post comments. Same rules as post likes:
-- anyone can see them; signed-in members can like or unlike, only as themselves.

create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_likes_user_id_idx on public.comment_likes (user_id);

revoke all on public.comment_likes from anon, authenticated;
grant select on public.comment_likes to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;

alter table public.comment_likes enable row level security;

create policy "Anyone can read comment likes" on public.comment_likes
  for select to anon, authenticated using (true);
create policy "Members like comments as themselves" on public.comment_likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Members remove their own comment likes" on public.comment_likes
  for delete to authenticated using ((select auth.uid()) = user_id);
