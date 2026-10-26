-- The sign-up trigger function runs with elevated privileges (security definer).
-- It only needs to run as a trigger, so nobody should be able to call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
