-- Authorize by the target workspace membership, independent of the selected workspace.
create function public.rename_workspace(p_workspace_id uuid, p_name text, p_expected_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, ''), E' \t\r\n');
begin
  if p_workspace_id is null or p_expected_name is null or length(v_name) not between 2 and 100 then
    raise exception 'Invalid workspace name' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 1));
  if not exists (
    select 1 from public.workspace_memberships
    where organization_id = p_workspace_id and user_id = auth.uid()
      and role = 'admin' and status = 'active'
  ) then
    raise exception 'Workspace administrator required' using errcode = '42501';
  end if;
  update public.organizations set name = v_name
  where id = p_workspace_id and name = p_expected_name;
  if not found then
    raise exception 'Workspace name changed; reload before retrying' using errcode = '40001';
  end if;
end $$;
revoke all on function public.rename_workspace(uuid,text,text) from public,anon;
grant execute on function public.rename_workspace(uuid,text,text) to authenticated;

-- Bind an inline invitation form to the workspace it was rendered for.
-- The profile lock also prevents a concurrent workspace switch during invitation creation.
create function public.invite_workspace_coach(p_workspace_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  -- Match the organization-before-profile order used by invitation acceptance.
  perform 1 from public.organizations where id = p_workspace_id for update;
  perform 1 from public.profiles where id = auth.uid() for update;
  if not found or p_workspace_id is distinct from public.current_organization_id()
    or public.is_admin() is not true then
    raise exception 'Selected workspace administrator required' using errcode = '42501';
  end if;
  return public.create_workspace_invitation(p_email);
end $$;
revoke all on function public.invite_workspace_coach(uuid,text) from public,anon;
grant execute on function public.invite_workspace_coach(uuid,text) to authenticated;
