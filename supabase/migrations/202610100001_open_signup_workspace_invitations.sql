-- An authenticated account is independent of workspace membership. Only an
-- email-bound invitation acceptance grants access to an existing workspace.
alter table public.profiles alter column organization_id drop not null;

create or replace function public.protect_profile_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Profile identity is immutable' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id
     and coalesce(current_setting('app.allow_workspace_switch', true), '') <> 'on' then
    raise exception 'Profile workspace can be changed only by the workspace switcher'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.ensure_my_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user auth.users;
  v_profile public.profiles;
  v_name text;
begin
  select * into v_user from auth.users where id = auth.uid();
  if not found or v_user.email_confirmed_at is null then
    raise exception 'Verified email required' using errcode = '42501';
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

-- Any verified account may create its own workspace. This grants an admin role
-- only inside the newly created workspace, never inside an existing one.
create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  perform public.ensure_my_profile();
  if length(btrim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'Workspace name must be between 2 and 100 characters' using errcode = '22023';
  end if;
  insert into public.organizations(name) values (btrim(p_name)) returning id into v_org;
  insert into public.workspace_memberships(user_id, organization_id, role, status)
  values (auth.uid(), v_org, 'admin', 'active');
  perform public.switch_workspace(v_org);
  return v_org;
end;
$$;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254),
  token_hash text check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email),
  check ((accepted_at is null) = (accepted_by is null))
);
create unique index workspace_invitations_token_idx
  on public.workspace_invitations(token_hash) where token_hash is not null;
create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from anon, authenticated;
grant select on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.workspace_invitations to service_role;
create policy workspace_invitations_admin_select
on public.workspace_invitations for select to authenticated
using (public.is_admin() and organization_id = public.current_organization_id());

-- Preserve legacy pending members as pending invitations. Their administrator
-- can send a new acceptance link; setting a password no longer activates them.
insert into public.workspace_invitations(organization_id, email, invited_by)
select wm.organization_id, lower(btrim(u.email)), inviter.user_id
from public.workspace_memberships wm
join auth.users u on u.id = wm.user_id
join lateral (
  select a.user_id from public.workspace_memberships a
  where a.organization_id = wm.organization_id and a.role = 'admin' and a.status = 'active'
  order by a.created_at, a.user_id limit 1
) inviter on true
where wm.status = 'pending' and u.email is not null
on conflict (organization_id, email) do nothing;

create function public.create_workspace_invitation(p_email text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.current_organization_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  -- Serialize invitations and acceptance for a workspace. No membership is
  -- created while sending a mail, including for existing registered accounts.
  perform 1 from public.organizations where id = v_org for update;
  if exists (
    select 1 from public.workspace_memberships wm join auth.users u on u.id = wm.user_id
    where wm.organization_id = v_org and lower(u.email) = v_email and wm.status = 'active'
  ) then
    raise exception 'Already an active workspace member' using errcode = 'PT409';
  end if;
  insert into public.workspace_invitations(organization_id, email, token_hash, invited_by)
  values (v_org, v_email, p_token_hash, auth.uid())
  on conflict (organization_id, email) do update
  set token_hash = excluded.token_hash, invited_by = excluded.invited_by,
      expires_at = now() + interval '7 days', accepted_at = null, accepted_by = null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_workspace_invitation(text, text) from public;
grant execute on function public.create_workspace_invitation(text, text) to authenticated;

create function public.get_workspace_invitation(p_token text)
returns table (workspace_name text, email text, expires_at timestamptz, accepted boolean)
language sql stable security definer set search_path = '' as $$
  select o.name::text, i.email, i.expires_at, i.accepted_at is not null
  from public.workspace_invitations i
  join public.organizations o on o.id = i.organization_id
  join auth.users u on u.id = auth.uid()
  where p_token ~ '^[0-9a-f]{64}$'
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and lower(u.email) = i.email and u.email_confirmed_at is not null
$$;
revoke all on function public.get_workspace_invitation(text) from public;
grant execute on function public.get_workspace_invitation(text) to authenticated;

create function public.accept_workspace_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.workspace_invitations;
  v_user auth.users;
  v_org uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  select organization_id into v_org from public.workspace_invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    raise exception 'Invitation unavailable' using errcode = 'PT410';
  end if;
  perform 1 from public.organizations where id = v_org for update;
  select * into v_invite from public.workspace_invitations
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then
    raise exception 'Invitation unavailable' using errcode = 'PT410';
  end if;
  select * into v_user from auth.users where id = auth.uid();
  if not found or v_user.email_confirmed_at is null or lower(v_user.email) <> v_invite.email then
    raise exception 'Invitation email does not match verified account' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by <> auth.uid() or not exists (
      select 1 from public.workspace_memberships where user_id = auth.uid()
      and organization_id = v_org and status = 'active'
    ) then
      raise exception 'Invitation already used' using errcode = 'PT410';
    end if;
    -- Retrying an accepted invitation never restores a disabled membership.
    perform public.switch_workspace(v_org);
    return v_org;
  end if;
  if v_invite.expires_at <= now() or not exists (
    select 1 from public.workspace_memberships where user_id = v_invite.invited_by
    and organization_id = v_org and role = 'admin' and status = 'active'
  ) then
    raise exception 'Invitation expired or revoked' using errcode = 'PT410';
  end if;
  perform public.ensure_my_profile();
  insert into public.workspace_memberships(user_id, organization_id, role, status)
  values (auth.uid(), v_org, 'coach', 'active')
  on conflict (user_id, organization_id) do update
  set status = 'active',
      role = case when workspace_memberships.status = 'active' then workspace_memberships.role
                  else 'coach'::public.member_role end; -- A re-invitation cannot restore disabled admin privileges.
  update public.workspace_invitations
  set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  perform public.switch_workspace(v_org);
  return v_org;
end;
$$;
revoke all on function public.accept_workspace_invitation(text) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

-- Remove every prior authenticated bypass of explicit invitation acceptance.
revoke all on function public.find_workspace_user_by_email(text) from public, anon, authenticated;
revoke all on function public.add_existing_workspace_member(uuid) from public, anon, authenticated;
revoke all on function public.register_workspace_invitee(uuid, text) from public, anon, authenticated;
create or replace function public.activate_invited_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Workspace invitation acceptance required' using errcode = '42501';
end;
$$;
revoke all on function public.activate_invited_user(uuid) from public, anon, authenticated, service_role;
