-- Photos on posts: one optional image per post, stored in Supabase Storage.
-- A post now needs text, a photo, or both.

-- ---------- Posts columns ----------
-- Store the file path (not a full URL) and require it to be in the author's own folder.

alter table public.posts
  add column image_path text;

alter table public.posts
  add constraint posts_image_path_check
    check (image_path is null or image_path ~ ('^' || author_id::text || '/[A-Za-z0-9_.-]{1,100}$'));

-- Allow photo-only posts: text may be empty when there is an image
alter table public.posts drop constraint posts_body_check;
alter table public.posts
  add constraint posts_body_check
    check (char_length(body) <= 500 and (char_length(trim(body)) >= 1 or image_path is not null));

-- ---------- Storage bucket ----------
-- Public so photos load without signing in; 3 MB limit (uploads are shrunk first); images only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Members upload post photos to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members see post photos in their own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete post photos in their own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
