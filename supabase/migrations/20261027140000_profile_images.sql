-- Profile pictures and banners, stored in Supabase Storage.
-- Each member can only write inside a folder named after their own user id.

-- ---------- Profile columns ----------
-- Store the file path (not a full URL) and require it to be in the member's own folder,
-- so a profile can't point at someone else's file or an outside site.

alter table public.profiles
  add column avatar_path text
    check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_.-]{1,100}$')),
  add column banner_path text
    check (banner_path is null or banner_path ~ ('^' || id::text || '/[A-Za-z0-9_.-]{1,100}$'));

grant update (avatar_path, banner_path) on public.profiles to authenticated;

-- ---------- Storage bucket ----------
-- Public so images load without signing in; 2 MB limit; images only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Members upload images to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members see files in their own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete images in their own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
