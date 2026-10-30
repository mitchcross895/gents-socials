-- Support loading posts and threads a page at a time.
-- Threads keep their own reply count and last-activity time, so the forum can be
-- sorted and paged by the database without loading every reply.

alter table public.threads
  add column reply_count integer not null default 0 check (reply_count >= 0),
  add column last_activity_at timestamptz not null default now();

update public.threads t set
  reply_count = (select count(*) from public.replies r where r.thread_id = t.id),
  last_activity_at = coalesce((select max(r.created_at) from public.replies r where r.thread_id = t.id), t.created_at);

-- Members can't set the counters themselves: only these columns can be inserted
revoke insert on public.threads from authenticated;
grant insert (category, title, body) on public.threads to authenticated;

-- Keeps reply_count and last_activity_at up to date. Runs as the owner because
-- repliers aren't allowed to update other members' threads.
create function public.update_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.threads
      set reply_count = reply_count + 1,
          last_activity_at = greatest(last_activity_at, new.created_at)
      where id = new.thread_id;
  else
    update public.threads t
      set reply_count = greatest(t.reply_count - 1, 0),
          last_activity_at = coalesce(
            (select max(r.created_at) from public.replies r where r.thread_id = old.thread_id),
            t.created_at)
      where t.id = old.thread_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.update_thread_activity() from public, anon, authenticated;

create trigger replies_update_thread_activity
  after insert or delete on public.replies
  for each row execute function public.update_thread_activity();

create index threads_last_activity_idx on public.threads (last_activity_at desc);
create index threads_category_activity_idx on public.threads (category, last_activity_at desc);
create index threads_reply_count_idx on public.threads (reply_count desc);
create index threads_author_created_idx on public.threads (author_id, created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);

-- Profile totals, counted by the database since only one page of posts is loaded at a time
create function public.profile_stats(uid uuid)
returns table (posts bigint, threads bigint, likes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.posts where author_id = uid),
    (select count(*) from public.threads where author_id = uid),
    (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id where p.author_id = uid);
$$;

revoke execute on function public.profile_stats(uuid) from public;
grant execute on function public.profile_stats(uuid) to anon, authenticated;
