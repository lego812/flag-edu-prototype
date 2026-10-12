-- Bind role/status changes to the workspace where the form was rendered.
create function public.manage_workspace_member(p_workspace_id uuid,p_user_id uuid,p_role public.member_role,p_status public.member_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_workspace_id is null or auth.uid() is null or public.current_organization_id() is distinct from p_workspace_id or not public.is_admin() then
  raise exception 'Selected workspace administrator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,1));
 perform 1 from public.organizations where id=p_workspace_id for update;
 -- Keep membership-before-profile and UUID ordering consistent with switch/delete.
 perform 1 from public.workspace_memberships where organization_id=p_workspace_id and user_id in(auth.uid(),p_user_id) order by user_id for update;
 perform 1 from public.profiles where id in(auth.uid(),p_user_id) order by id for update;
 if public.current_organization_id() is distinct from p_workspace_id or not public.is_admin() then
  raise exception 'Selected workspace administrator required' using errcode='42501'; end if;
 perform public.manage_member(p_user_id,p_role,p_status);
end $$;
revoke all on function public.manage_workspace_member(uuid,uuid,public.member_role,public.member_status) from public,anon;
grant execute on function public.manage_workspace_member(uuid,uuid,public.member_role,public.member_status) to authenticated;
-- Old deployment/forms cannot silently redirect an unscoped change to another workspace.
revoke all on function public.manage_member(uuid,public.member_role,public.member_status) from public,anon,authenticated;
