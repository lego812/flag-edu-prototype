-- Expose only member display names and workspace-scoped roles, without opening profiles RLS.
create function public.list_workspace_participants(p_workspace_id uuid)
returns table(user_id uuid,name text,role public.member_role,status public.member_status)
language plpgsql stable security definer set search_path = '' as $$
declare v_role public.member_role;
begin
 select wm.role into v_role from public.workspace_memberships wm
 where wm.user_id=auth.uid() and wm.organization_id=p_workspace_id and wm.status='active';
 if not found then raise exception 'Active workspace membership required' using errcode='42501'; end if;
 return query select wm.user_id,p.name::text,wm.role,wm.status from public.workspace_memberships wm
 join public.profiles p on p.id=wm.user_id where wm.organization_id=p_workspace_id
 and (wm.status='active' or v_role='admin') order by (wm.role='admin') desc,p.name,wm.user_id;
end $$;
revoke all on function public.list_workspace_participants(uuid) from public,anon;
grant execute on function public.list_workspace_participants(uuid) to authenticated;

-- Remove only workspace access. Keep the account/profile and authored history.
create function public.remove_workspace_participant(p_workspace_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member public.workspace_memberships; v_profile public.profiles; v_fallback public.workspace_memberships; v_has_fallback boolean;
begin
 if p_workspace_id is null or p_user_id is null then raise exception 'Invalid participant' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 if not exists(select 1 from public.workspace_memberships where user_id=auth.uid() and organization_id=p_workspace_id and role='admin' and status='active') then
  raise exception 'Workspace administrator required' using errcode='42501'; end if;
 if p_user_id=auth.uid() then raise exception 'Cannot remove yourself' using errcode='42501'; end if;
 select * into v_member from public.workspace_memberships where user_id=p_user_id and organization_id=p_workspace_id for update;
 if not found or v_member.status<>'active' then raise exception 'Active participant not found' using errcode='P0002'; end if;
 if v_member.role='admin' and not exists(select 1 from public.workspace_memberships where organization_id=p_workspace_id and user_id<>p_user_id and role='admin' and status='active') then
  raise exception 'Last administrator must remain' using errcode='23514'; end if;
 update public.workspace_memberships set status='inactive' where id=v_member.id;
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
