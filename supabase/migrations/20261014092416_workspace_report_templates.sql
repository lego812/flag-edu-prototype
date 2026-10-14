-- Scoped entry points preserve existing versioning and RLS. SECURITY DEFINER is
-- required only for row locks on protected profiles/memberships; identity, selected
-- workspace and administrator membership are checked before and after locking.
create function public.save_workspace_template(
  p_workspace_id uuid, p_id uuid, p_version timestamptz,
  p_fields jsonb, p_publish boolean, p_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_workspace_id is null
     or public.current_organization_id() is distinct from p_workspace_id
     or not public.is_admin() then
    raise exception 'Selected workspace administrator required' using errcode = '42501';
  end if;
  -- Follow workspace management lock order. The profile lock serializes switching;
  -- the membership/organization locks keep role and deletion checks valid until commit.
  perform 1 from public.organizations where id = p_workspace_id for share;
  perform 1 from public.workspace_memberships
    where organization_id = p_workspace_id and user_id = auth.uid() for share;
  perform 1 from public.profiles where id = auth.uid() for update;
  if public.current_organization_id() is distinct from p_workspace_id
     or not public.is_admin() then
    raise exception 'Selected workspace administrator required' using errcode = '42501';
  end if;
  return public.save_named_template(p_id, p_version, p_fields, p_publish, p_name);
end;
$$;

create function public.deactivate_workspace_template(
  p_workspace_id uuid, p_template_version_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_workspace_id is null
     or public.current_organization_id() is distinct from p_workspace_id
     or not public.is_admin() then
    raise exception 'Selected workspace administrator required' using errcode = '42501';
  end if;
  -- Follow workspace management lock order. The profile lock serializes switching;
  -- the membership/organization locks keep role and deletion checks valid until commit.
  perform 1 from public.organizations where id = p_workspace_id for share;
  perform 1 from public.workspace_memberships
    where organization_id = p_workspace_id and user_id = auth.uid() for share;
  perform 1 from public.profiles where id = auth.uid() for update;
  if public.current_organization_id() is distinct from p_workspace_id
     or not public.is_admin() then
    raise exception 'Selected workspace administrator required' using errcode = '42501';
  end if;
  perform public.deactivate_template(p_template_version_id);
end;
$$;

revoke all on function public.save_workspace_template(uuid,uuid,timestamptz,jsonb,boolean,text) from public, anon;
revoke all on function public.deactivate_workspace_template(uuid,uuid) from public, anon;
grant execute on function public.save_workspace_template(uuid,uuid,timestamptz,jsonb,boolean,text) to authenticated;
grant execute on function public.deactivate_workspace_template(uuid,uuid) to authenticated;
