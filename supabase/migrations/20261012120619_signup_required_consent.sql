-- Existing accounts are exempt from this new-signup requirement; never invent consent.
create table private.signup_existing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.signup_existing_accounts enable row level security;
revoke all on private.signup_existing_accounts from public, anon, authenticated;
insert into private.signup_existing_accounts(user_id) select id from auth.users;

create table private.signup_policy_versions (
  version text primary key,
  published boolean not null default false
);
alter table private.signup_policy_versions enable row level security;
revoke all on private.signup_policy_versions from public, anon, authenticated;
insert into private.signup_policy_versions(version,published) values ('2026-10-12',true);

create table public.signup_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  policy_version text not null references private.signup_policy_versions(version),
  accepted_at timestamptz not null default now()
);
create index signup_consents_policy_version_idx on public.signup_consents(policy_version);
alter table public.signup_consents enable row level security;
revoke all on public.signup_consents from public, anon, authenticated;
grant select on public.signup_consents to authenticated;
create policy signup_consents_read_own on public.signup_consents for select to authenticated
using (user_id = (select auth.uid()));

create function public.has_signup_consent()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from private.signup_existing_accounts where user_id=auth.uid())
    or exists(select 1 from public.signup_consents where user_id=auth.uid())
  )
$$;
revoke all on function public.has_signup_consent() from public,anon;
grant execute on function public.has_signup_consent() to authenticated;

create function public.accept_signup_consents(p_policy_version text,p_terms boolean,p_privacy boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
  ) then raise exception 'Verified account required' using errcode='42501'; end if;
  if p_terms is distinct from true or p_privacy is distinct from true then
    raise exception 'Both required consents are required' using errcode='22023'; end if;
  if p_policy_version is distinct from '2026-10-12' or not exists (
    select 1 from private.signup_policy_versions where version=p_policy_version and published
  ) then raise exception 'Policy unavailable or outdated' using errcode='PT409'; end if;
  if not exists(select 1 from auth.identities where user_id=auth.uid() and provider='google') then
    raise exception 'Google registration required' using errcode='42501'; end if;
  insert into public.signup_consents(user_id,policy_version) values(auth.uid(),p_policy_version)
  on conflict(user_id) do nothing;
end $$;
revoke all on function public.accept_signup_consents(text,boolean,boolean) from public,anon;
grant execute on function public.accept_signup_consents(text,boolean,boolean) to authenticated;

create or replace function public.ensure_my_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user auth.users;
  v_profile public.profiles;
  v_name text;
begin
  if not public.has_signup_consent() then
    raise exception 'Signup consent required' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = auth.uid();
  if not found or v_user.email_confirmed_at is null then
    raise exception 'Verified email required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid())
     and not exists (select 1 from auth.identities where user_id = auth.uid() and provider = 'google') then
    raise exception 'Google registration required' using errcode = '42501';
  end if;
  v_name := left(coalesce(nullif(btrim(v_user.raw_user_meta_data->>'name'), ''),
    nullif(split_part(v_user.email, '@', 1), ''), '회원'), 50);
  insert into public.profiles(id, name, role, status)
  values (v_user.id, v_name, 'coach', 'active')
  on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = v_user.id;
  return v_profile;
end;
$$;
revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;

