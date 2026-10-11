-- Preserve identities from posts created before multi-user sessions were added.
insert into public.checkpoint_users (username,display_name)
select distinct username,username from public.checkpoint_posts on conflict do nothing;

