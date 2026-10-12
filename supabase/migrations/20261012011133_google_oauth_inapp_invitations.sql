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


create schema if not exists private;
create function private.google_signup_only(event jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when event->'user'->'app_metadata'->>'provider' = 'google'
    then '{}'::jsonb
    else jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'New accounts must sign up with Google.')) end
$$;
revoke all on function private.google_signup_only(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.google_signup_only(jsonb) to supabase_auth_admin;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  expires_at timestamptz not null default now() + interval '7 days',
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email),
  check ((responded_at is null) = (responded_by is null))
);
create index workspace_invitations_inbox_idx on public.workspace_invitations(email, expires_at)
  where status = 'pending';
create trigger workspace_invitations_updated before update on public.workspace_invitations
for each row execute function public.set_updated_at();
alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from anon, authenticated;
grant select on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.workspace_invitations to service_role;
create policy workspace_invitations_admin_select on public.workspace_invitations
for select to authenticated using (public.is_admin() and organization_id = public.current_organization_id());

-- Move legacy pending memberships to invitations without activating any account.
insert into public.workspace_invitations(organization_id,email,invited_by)
select wm.organization_id,lower(btrim(u.email)),a.user_id
from public.workspace_memberships wm join auth.users u on u.id = wm.user_id
join lateral (select user_id from public.workspace_memberships
 where organization_id = wm.organization_id and role = 'admin' and status = 'active'
 order by created_at,user_id limit 1) a on true
where wm.status = 'pending' and u.email is not null;
delete from public.workspace_memberships wm where wm.status = 'pending'
 and exists (select 1 from public.workspace_invitations i join auth.users u on lower(u.email)=i.email
 where u.id=wm.user_id and i.organization_id=wm.organization_id);

create function public.create_workspace_invitation(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid := public.current_organization_id(); v_email text := lower(btrim(coalesce(p_email,''))); v_id uuid;
begin
 if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
 if length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Invalid email' using errcode='22023'; end if;
 perform 1 from public.organizations where id=v_org for update;
 if exists (select 1 from public.workspace_memberships wm join auth.users u on u.id=wm.user_id
  where wm.organization_id=v_org and lower(u.email)=v_email and wm.status='active') then
  raise exception 'Already an active member' using errcode='PT409'; end if;
 insert into public.workspace_invitations(organization_id,email,invited_by) values(v_org,v_email,auth.uid())
 on conflict(organization_id,email) do update set status='pending', invited_by=excluded.invited_by,
 expires_at=now()+interval '7 days',responded_by=null,responded_at=null returning id into v_id;
 return v_id;
end $$;
revoke all on function public.create_workspace_invitation(text) from public;
grant execute on function public.create_workspace_invitation(text) to authenticated;

create function public.list_my_workspace_invitations()
returns table(id uuid,workspace_name text,expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select i.id,o.name::text,i.expires_at from public.workspace_invitations i
 join public.organizations o on o.id=i.organization_id
 join auth.users u on u.id=auth.uid() and lower(u.email)=i.email and u.email_confirmed_at is not null
 where i.status='pending' and i.expires_at>now() and exists
 (select 1 from public.workspace_memberships wm where wm.user_id=i.invited_by
 and wm.organization_id=i.organization_id and wm.role='admin' and wm.status='active')
 order by i.created_at desc
$$;
revoke all on function public.list_my_workspace_invitations() from public;
grant execute on function public.list_my_workspace_invitations() to authenticated;

create function public.respond_workspace_invitation(p_invitation_id uuid,p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.workspace_invitations; u auth.users; v_org uuid;
begin
 if p_accept is null then raise exception 'Response required' using errcode='22023'; end if;
 select organization_id into v_org from public.workspace_invitations where id=p_invitation_id;
 if not found then raise exception 'Invitation unavailable' using errcode='PT410'; end if;
 perform 1 from public.organizations where id=v_org for update;
 select * into i from public.workspace_invitations where id=p_invitation_id for update;
 select * into u from auth.users where id=auth.uid();
 if not found or u.email_confirmed_at is null or lower(u.email) is distinct from i.email then
  raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if i.status='accepted' and p_accept and i.responded_by=auth.uid() and exists
 (select 1 from public.workspace_memberships where user_id=auth.uid() and organization_id=v_org and status='active') then
  perform public.switch_workspace(v_org); return v_org; end if;
 if i.status<>'pending' or i.expires_at<=now() or not exists
 (select 1 from public.workspace_memberships where user_id=i.invited_by and organization_id=v_org and role='admin' and status='active') then
  raise exception 'Invitation unavailable' using errcode='PT410'; end if;
 perform public.ensure_my_profile();
 if not p_accept then
  update public.workspace_invitations set status='declined',responded_by=auth.uid(),responded_at=now() where id=i.id;
  return null; end if;
 insert into public.workspace_memberships(user_id,organization_id,role,status) values(auth.uid(),v_org,'coach','active')
 on conflict(user_id,organization_id) do update set status='active',
 role=case when workspace_memberships.status='active' then workspace_memberships.role else 'coach'::public.member_role end;
 update public.workspace_invitations set status='accepted',responded_by=auth.uid(),responded_at=now() where id=i.id;
 perform public.switch_workspace(v_org); return v_org;
end $$;
revoke all on function public.respond_workspace_invitation(uuid,boolean) from public;
grant execute on function public.respond_workspace_invitation(uuid,boolean) to authenticated;

create function public.cancel_workspace_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
 perform 1 from public.organizations where id=public.current_organization_id() for update;
 update public.workspace_invitations set status='cancelled' where id=p_invitation_id
 and organization_id=public.current_organization_id() and status='pending';
 if not found then raise exception 'Invitation unavailable' using errcode='PT410'; end if;
end $$;
revoke all on function public.cancel_workspace_invitation(uuid) from public;
grant execute on function public.cancel_workspace_invitation(uuid) to authenticated;

-- Close legacy acceptance bypasses. Password changes never grant membership.
revoke all on function public.find_workspace_user_by_email(text) from public,anon,authenticated;
revoke all on function public.add_existing_workspace_member(uuid) from public,anon,authenticated;
revoke all on function public.register_workspace_invitee(uuid,text) from public,anon,authenticated;
create or replace function public.activate_invited_user(p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
begin raise exception 'In-app invitation acceptance required' using errcode='42501'; end $$;
revoke all on function public.activate_invited_user(uuid) from public,anon,authenticated,service_role;
