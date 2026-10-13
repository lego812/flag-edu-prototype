-- Preserve prior hidden membership semantics. Only future suspension is inactive.
update public.workspace_memberships set status='removed' where status='inactive';

create or replace function public.list_workspace_participants(p_workspace_id uuid)
returns table(user_id uuid,name text,role public.member_role,status public.member_status)
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role;
begin
 if not public.has_active_workspace_membership(p_workspace_id) then raise exception 'Active workspace membership required' using errcode='42501'; end if;
 select wm.role into v_role from public.workspace_memberships wm
 where wm.user_id=auth.uid() and wm.organization_id=p_workspace_id and wm.status='active';
 if not found then raise exception 'Active workspace membership required' using errcode='42501'; end if;
 return query select wm.user_id,p.name::text,wm.role,wm.status from public.workspace_memberships wm
 join public.profiles p on p.id=wm.user_id where wm.organization_id=p_workspace_id
 and wm.status<>'removed' and (wm.status='active' or v_role='admin') order by (wm.role='admin') desc,p.name,wm.user_id;
end $$;
revoke all on function public.list_workspace_participants(uuid) from public,anon;
grant execute on function public.list_workspace_participants(uuid) to authenticated;

create or replace function public.remove_workspace_participant(p_workspace_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member public.workspace_memberships; v_profile public.profiles; v_fallback public.workspace_memberships; v_has_fallback boolean;
begin
 if p_workspace_id is null or p_user_id is null then raise exception 'Invalid participant' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 if auth.uid() is null or not public.has_active_workspace_membership(p_workspace_id) or (p_user_id<>auth.uid() and not exists(select 1 from public.workspace_memberships where user_id=auth.uid() and organization_id=p_workspace_id and role='admin' and status='active')) then
  raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v_member from public.workspace_memberships where user_id=p_user_id and organization_id=p_workspace_id for update;
 if not found or v_member.status not in ('active','inactive') then raise exception 'Active participant not found' using errcode='P0002'; end if;
 if v_member.status='active' and v_member.role='admin' and not exists(select 1 from public.workspace_memberships where organization_id=p_workspace_id and user_id<>p_user_id and role='admin' and status='active') then
  raise exception 'Last administrator must remain' using errcode='23514'; end if;
 update public.workspace_memberships set status='removed' where id=v_member.id;
 select * into v_profile from public.profiles where id=p_user_id for update;
 if v_profile.organization_id=p_workspace_id then
  select * into v_fallback from public.workspace_memberships where user_id=p_user_id and status='active' order by created_at,organization_id limit 1;
  v_has_fallback := found;
  perform set_config('app.allow_workspace_switch','on',true);
  if v_has_fallback then
   update public.profiles set organization_id=v_fallback.organization_id,role=v_fallback.role,status='active' where id=p_user_id;
  else
   update public.profiles set organization_id=null,role='coach',status='inactive' where id=p_user_id;
  end if;
 end if;
end $$;
revoke all on function public.remove_workspace_participant(uuid,uuid) from public,anon;
grant execute on function public.remove_workspace_participant(uuid,uuid) to authenticated;
-- Bind role/status changes to the workspace where the form was rendered.
create or replace function public.manage_workspace_member(p_workspace_id uuid,p_user_id uuid,p_role public.member_role,p_status public.member_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_status not in ('active','inactive') or p_status is null then raise exception 'Invalid membership status' using errcode='22023'; end if;
 if p_workspace_id is null or auth.uid() is null or public.current_organization_id() is distinct from p_workspace_id or not public.is_admin() then
  raise exception 'Selected workspace administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 perform 1 from public.organizations where id=p_workspace_id for update;
 -- Keep membership-before-profile and UUID ordering consistent with switch/delete.
 perform 1 from public.workspace_memberships where organization_id=p_workspace_id and user_id in(auth.uid(),p_user_id) order by user_id for update;
 perform 1 from public.profiles where id in(auth.uid(),p_user_id) order by id for update;
 if public.current_organization_id() is distinct from p_workspace_id or not public.is_admin() then
  raise exception 'Selected workspace administrator required' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_memberships where organization_id=p_workspace_id and user_id=p_user_id and status='removed') then raise exception 'Invite required to rejoin a removed membership' using errcode='42501'; end if;
 perform public.manage_member(p_user_id,p_role,p_status);
end $$;
revoke all on function public.manage_workspace_member(uuid,uuid,public.member_role,public.member_status) from public,anon;
grant execute on function public.manage_workspace_member(uuid,uuid,public.member_role,public.member_status) to authenticated;
-- Old deployment/forms cannot silently redirect an unscoped change to another workspace.
revoke all on function public.manage_member(uuid,public.member_role,public.member_status) from public,anon,authenticated;
create or replace function public.respond_workspace_invitation(p_invitation_id uuid,p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.workspace_invitations; u auth.users; v_org uuid;
begin
 if p_accept is null then raise exception 'Response required' using errcode='22023'; end if;
 select organization_id into v_org from public.workspace_invitations where id=p_invitation_id;
 if not found then raise exception 'Invitation unavailable' using errcode='PT410'; end if;
 perform 1 from public.organizations where id=v_org and deleted_at is null for update;
 if not found then raise exception 'Invitation unavailable' using errcode='PT410'; end if;
 select * into i from public.workspace_invitations where id=p_invitation_id for update;
 select * into u from auth.users where id=auth.uid();
 if not found or u.email_confirmed_at is null or lower(u.email) is distinct from i.email then
  raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if p_accept and exists(select 1 from public.workspace_memberships where user_id=auth.uid() and organization_id=v_org and status='inactive') then raise exception 'Suspended membership must be reactivated by an administrator' using errcode='42501'; end if;
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


create or replace function public.delete_workspace(p_workspace_id uuid, p_confirmation_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_workspace public.organizations; v_user_id uuid; v_profile public.profiles;
 v_fallback public.workspace_memberships; v_has_fallback boolean;
begin
 if p_workspace_id is null or p_confirmation_name is null then
  raise exception 'Workspace name confirmation required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 if auth.uid() is null or not public.has_active_workspace_membership(p_workspace_id) or not exists (
  select 1 from public.workspace_memberships where user_id=auth.uid() and organization_id=p_workspace_id and role='admin' and status='active'
 ) then raise exception 'Workspace administrator required' using errcode='42501'; end if;
 select * into v_workspace from public.organizations where id=p_workspace_id and deleted_at is null for update;
 if not found then raise exception 'Workspace unavailable' using errcode='PT410'; end if;
 if v_workspace.name::text collate pg_catalog."C" is distinct from p_confirmation_name collate pg_catalog."C" then
  raise exception 'Workspace name does not match' using errcode='PT409'; end if;
 update public.organizations set deleted_at=now() where id=p_workspace_id;
 update public.workspace_memberships set status='removed' where organization_id=p_workspace_id;
 update public.workspace_invitations set status='cancelled' where organization_id=p_workspace_id and status='pending';
 -- Include every past participant to handle concurrent deletions of different workspaces.
 -- Lock profiles in a consistent order, then inspect their latest selected workspace.
 for v_user_id in
  select p.id from public.profiles p where p.organization_id=p_workspace_id
  union
  select wm.user_id from public.workspace_memberships wm where wm.organization_id=p_workspace_id
  order by 1
 loop
  select * into v_profile from public.profiles where id=v_user_id for update;
  if v_profile.organization_id=p_workspace_id then
   select wm.* into v_fallback from public.workspace_memberships wm join public.organizations o on o.id=wm.organization_id
    where wm.user_id=v_user_id and wm.status='active' and o.deleted_at is null order by wm.created_at,wm.organization_id limit 1;
   v_has_fallback:=found;
   perform set_config('app.allow_workspace_switch','on',true);
   if v_has_fallback then
    update public.profiles set organization_id=v_fallback.organization_id,role=v_fallback.role,status='active' where id=v_user_id;
   else
    update public.profiles set organization_id=null,role='coach',status='inactive' where id=v_user_id;
   end if;
  end if;
 end loop;
end $$;
revoke all on function public.delete_workspace(uuid,text) from public,anon;
grant execute on function public.delete_workspace(uuid,text) to authenticated;
