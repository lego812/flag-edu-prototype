-- A user may belong to multiple workspaces while profiles keeps the currently
-- selected workspace as a compatibility mirror for the existing RLS/RPC layer.
create table public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.member_role not null default 'coach',
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

insert into public.workspace_memberships(
  user_id,
  organization_id,
  role,
  status,
  created_at,
  updated_at
)
select id, organization_id, role, status, created_at, updated_at
from public.profiles
on conflict (user_id, organization_id) do nothing;

create index workspace_memberships_user_status_idx
  on public.workspace_memberships(user_id, status, created_at);
create index workspace_memberships_org_status_role_idx
  on public.workspace_memberships(organization_id, status, role, created_at);

create trigger workspace_memberships_set_updated_at
before update on public.workspace_memberships
for each row execute function public.set_updated_at();

alter table public.workspace_memberships enable row level security;

revoke all on table public.workspace_memberships from anon, authenticated;
grant select on table public.workspace_memberships to authenticated;
grant select, insert, update, delete on table public.workspace_memberships to service_role;

create function public.has_active_workspace_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_memberships wm
    where wm.user_id = auth.uid()
      and wm.organization_id = p_organization_id
      and wm.status = 'active'::public.member_status
  )
$$;

revoke all on function public.has_active_workspace_membership(uuid) from public;
grant execute on function public.has_active_workspace_membership(uuid) to authenticated;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id
  from public.profiles p
  join public.workspace_memberships wm
    on wm.user_id = p.id
   and wm.organization_id = p.organization_id
  where p.id = auth.uid()
    and p.status = 'active'::public.member_status
    and wm.status = 'active'::public.member_status
$$;

create or replace function public.current_user_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select wm.role
  from public.profiles p
  join public.workspace_memberships wm
    on wm.user_id = p.id
   and wm.organization_id = p.organization_id
  where p.id = auth.uid()
    and p.status = 'active'::public.member_status
    and wm.status = 'active'::public.member_status
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_organization_id() is not null
$$;

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile identity is immutable' using errcode = '42501';
  end if;

  if new.organization_id <> old.organization_id
     and coalesce(current_setting('app.allow_workspace_switch', true), '') <> 'on' then
    raise exception 'Profile workspace can be changed only by the workspace switcher'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_membership
on public.organizations for select to authenticated
using (public.has_active_workspace_membership(id));

drop policy if exists profiles_select_allowed on public.profiles;
create policy profiles_select_allowed
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (
    public.is_admin()
    and exists (
      select 1
      from public.workspace_memberships wm
      where wm.user_id = profiles.id
        and wm.organization_id = public.current_organization_id()
    )
  )
);

create policy workspace_memberships_select_allowed
on public.workspace_memberships for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.is_admin()
    and organization_id = public.current_organization_id()
  )
);

create function public.switch_workspace(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.workspace_memberships;
begin
  select * into v_member
  from public.workspace_memberships
  where user_id = auth.uid()
    and organization_id = p_organization_id
    and status = 'active'::public.member_status
  for update;

  if not found then
    raise exception 'Active workspace membership not found' using errcode = '42501';
  end if;

  perform set_config('app.allow_workspace_switch', 'on', true);
  update public.profiles
  set organization_id = v_member.organization_id,
      role = v_member.role,
      status = v_member.status
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return v_member.organization_id;
end;
$$;

revoke all on function public.switch_workspace(uuid) from public;
grant execute on function public.switch_workspace(uuid) to authenticated;

create function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'Workspace name must be between 2 and 100 characters'
      using errcode = '22023';
  end if;

  insert into public.organizations(name)
  values (btrim(p_name))
  returning id into v_organization_id;

  insert into public.workspace_memberships(
    user_id,
    organization_id,
    role,
    status
  ) values (
    auth.uid(),
    v_organization_id,
    'admin'::public.member_role,
    'active'::public.member_status
  );

  perform set_config('app.allow_workspace_switch', 'on', true);
  update public.profiles
  set organization_id = v_organization_id,
      role = 'admin'::public.member_role,
      status = 'active'::public.member_status
  where id = auth.uid();

  return v_organization_id;
end;
$$;

revoke all on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;

create function public.find_workspace_user_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.find_workspace_user_by_email(text) from public;
grant execute on function public.find_workspace_user_by_email(text) to authenticated;

create function public.add_existing_workspace_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_membership_status public.member_status;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.workspace_memberships
    where user_id = p_user_id
      and organization_id = public.current_organization_id()
  ) then
    raise exception 'Member already belongs to this workspace' using errcode = 'PT409';
  end if;

  v_membership_status := case
    when v_profile.status = 'pending'::public.member_status
      then 'pending'::public.member_status
    else 'active'::public.member_status
  end;

  insert into public.workspace_memberships(
    user_id,
    organization_id,
    role,
    status
  ) values (
    p_user_id,
    public.current_organization_id(),
    'coach'::public.member_role,
    v_membership_status
  );

  if v_profile.status = 'inactive'::public.member_status then
    perform set_config('app.allow_workspace_switch', 'on', true);
    update public.profiles
    set organization_id = public.current_organization_id(),
        role = 'coach'::public.member_role,
        status = 'active'::public.member_status
    where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.add_existing_workspace_member(uuid) from public;
grant execute on function public.add_existing_workspace_member(uuid) to authenticated;

create function public.register_workspace_invitee(
  p_user_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 50 then
    raise exception 'Invalid member name' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Auth user not found' using errcode = 'P0002';
  end if;

  insert into public.profiles(
    id,
    organization_id,
    name,
    role,
    status
  ) values (
    p_user_id,
    public.current_organization_id(),
    left(btrim(p_name), 50),
    'coach'::public.member_role,
    'pending'::public.member_status
  );

  insert into public.workspace_memberships(
    user_id,
    organization_id,
    role,
    status
  ) values (
    p_user_id,
    public.current_organization_id(),
    'coach'::public.member_role,
    'pending'::public.member_status
  );
end;
$$;

revoke all on function public.register_workspace_invitee(uuid, text) from public;
grant execute on function public.register_workspace_invitee(uuid, text) to authenticated;

create or replace function public.change_member_role(
  p_user_id uuid,
  p_role public.member_role
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.workspace_memberships;
  v_profile public.profiles;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_target
  from public.workspace_memberships
  where user_id = p_user_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin'::public.member_role
     and v_target.status = 'active'::public.member_status
     and p_role = 'coach'::public.member_role then
    select count(*) into v_other_admins
    from public.workspace_memberships
    where organization_id = v_target.organization_id
      and role = 'admin'::public.member_role
      and status = 'active'::public.member_status
      and user_id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'The last active administrator cannot be demoted'
        using errcode = '23514';
    end if;
  end if;

  update public.workspace_memberships
  set role = p_role
  where id = v_target.id;

  update public.profiles
  set role = p_role
  where id = p_user_id
    and organization_id = v_target.organization_id;

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end;
$$;

create or replace function public.change_member_status(
  p_user_id uuid,
  p_status public.member_status
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.workspace_memberships;
  v_profile public.profiles;
  v_fallback public.workspace_memberships;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if p_status = 'pending'::public.member_status then
    raise exception 'Pending status is controlled by the invitation flow'
      using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and p_status = 'inactive'::public.member_status then
    raise exception 'Administrators cannot deactivate their current membership'
      using errcode = '42501';
  end if;

  select * into v_target
  from public.workspace_memberships
  where user_id = p_user_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin'::public.member_role
     and v_target.status = 'active'::public.member_status
     and p_status = 'inactive'::public.member_status then
    select count(*) into v_other_admins
    from public.workspace_memberships
    where organization_id = v_target.organization_id
      and role = 'admin'::public.member_role
      and status = 'active'::public.member_status
      and user_id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'The last active administrator cannot be deactivated'
        using errcode = '23514';
    end if;
  end if;

  update public.workspace_memberships
  set status = p_status
  where id = v_target.id;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if p_status = 'active'::public.member_status
     and v_profile.status <> 'active'::public.member_status then
    perform set_config('app.allow_workspace_switch', 'on', true);
    update public.profiles
    set organization_id = v_target.organization_id,
        role = v_target.role,
        status = 'active'::public.member_status
    where id = p_user_id
    returning * into v_profile;
  elsif v_profile.organization_id = v_target.organization_id then
    if p_status = 'inactive'::public.member_status then
      select * into v_fallback
      from public.workspace_memberships
      where user_id = p_user_id
        and organization_id <> v_target.organization_id
        and status = 'active'::public.member_status
      order by created_at, organization_id
      limit 1;

      if found then
        perform set_config('app.allow_workspace_switch', 'on', true);
        update public.profiles
        set organization_id = v_fallback.organization_id,
            role = v_fallback.role,
            status = v_fallback.status
        where id = p_user_id
        returning * into v_profile;
      else
        update public.profiles
        set status = 'inactive'::public.member_status
        where id = p_user_id
        returning * into v_profile;
      end if;
    else
      update public.profiles
      set status = p_status
      where id = p_user_id
      returning * into v_profile;
    end if;
  end if;

  return v_profile;
end;
$$;

create or replace function public.manage_member(
  p_user_id uuid,
  p_role public.member_role,
  p_status public.member_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_status public.member_status;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if p_status = 'pending'::public.member_status then
    raise exception 'Pending status is controlled by the invitation flow'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(public.current_organization_id()::text, 1)
  );

  select status into v_target_status
  from public.workspace_memberships
  where user_id = p_user_id
    and organization_id = public.current_organization_id()
  for update;

  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_target_status = 'pending'::public.member_status then
    raise exception 'Pending members are activated by password setup only'
      using errcode = '42501';
  end if;

  perform public.change_member_status(p_user_id, p_status);
  perform public.change_member_role(p_user_id, p_role);
end;
$$;

create function public.activate_invited_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_member public.workspace_memberships;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.workspace_memberships
  set status = 'active'::public.member_status
  where user_id = p_user_id
    and status = 'pending'::public.member_status;

  select * into v_member
  from public.workspace_memberships
  where user_id = p_user_id
    and status = 'active'::public.member_status
  order by (organization_id = v_profile.organization_id) desc,
           created_at,
           organization_id
  limit 1;

  if not found then
    raise exception 'Active workspace membership not found' using errcode = 'P0002';
  end if;

  perform set_config('app.allow_workspace_switch', 'on', true);
  update public.profiles
  set organization_id = v_member.organization_id,
      role = v_member.role,
      status = 'active'::public.member_status
  where id = p_user_id;
end;
$$;

revoke all on function public.activate_invited_user(uuid) from public;
grant execute on function public.activate_invited_user(uuid) to service_role;

-- These helpers are internal to the locked manage_member workflow. Exposing
-- them independently bypasses invitation guards and the last-admin lock.
revoke all on function public.change_member_role(uuid, public.member_role)
  from public, anon, authenticated;
revoke all on function public.change_member_status(uuid, public.member_status)
  from public, anon, authenticated;
grant execute on function public.manage_member(
  uuid,
  public.member_role,
  public.member_status
) to authenticated;
