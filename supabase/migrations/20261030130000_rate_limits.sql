-- Basic spam protection: limit how often one member can post, comment, start threads and reply.
-- Usage: enforce_rate_limit('<max rows>', '<time window>')

create function public.enforce_rate_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  per interval := tg_argv[1]::interval;
  recent integer;
begin
  execute format('select count(*) from %I.%I where author_id = $1 and created_at > now() - $2',
                 tg_table_schema, tg_table_name)
    into recent
    using new.author_id, per;
  if recent >= max_rows then
    raise exception 'You''re posting too quickly. Please wait a few minutes and try again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rate_limit() from public, anon, authenticated;

create trigger posts_rate_limit before insert on public.posts
  for each row execute function public.enforce_rate_limit('5', '5 minutes');

create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.enforce_rate_limit('20', '5 minutes');

create trigger threads_rate_limit before insert on public.threads
  for each row execute function public.enforce_rate_limit('3', '10 minutes');

create trigger replies_rate_limit before insert on public.replies
  for each row execute function public.enforce_rate_limit('20', '5 minutes');
