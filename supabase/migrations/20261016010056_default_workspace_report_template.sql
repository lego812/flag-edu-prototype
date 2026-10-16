-- Internal-only installer, shared by atomic workspace creation and explicitly
-- authorized maintenance. Never replaces any existing template, including history.
create function private.install_default_report_template(p_workspace_id uuid, p_creator_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_template uuid;
begin
  perform 1 from public.organizations
    where id = p_workspace_id and deleted_at is null for update;
  if not found then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;
  perform 1 from public.workspace_memberships
    where organization_id = p_workspace_id and user_id = p_creator_id
      and role = 'admin' and status = 'active' for share;
  if not found then
    raise exception 'Active workspace administrator required' using errcode = '42501';
  end if;
  -- Match save_template's lock so maintenance cannot race a manual first save.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  if exists (select 1 from public.template_versions where organization_id = p_workspace_id) then
    return null;
  end if;
  insert into public.template_versions(organization_id,version,name,status,created_by)
  values(p_workspace_id,1,'기본 수업 보고서','draft',p_creator_id)
  returning id into v_template;
  insert into public.template_fields(template_version_id,label,help_text,field_type,required,sort_order,settings)
  values
    (v_template,'참여 인원','수업에 참여한 인원수를 입력해 주세요.','number',true,0,'{}'),
    (v_template,'수업 내용','진행한 활동과 수업 내용을 작성해 주세요.','long_text',true,1,'{}'),
    (v_template,'특이사항','참여자 반응이나 공유할 사항이 있으면 작성해 주세요.','long_text',false,2,'{}'),
    (v_template,'다음 수업 계획',null,'long_text',false,3,'{}'),
    (v_template,'활동 사진','수업 활동 사진을 최대 3장 첨부할 수 있습니다.','photo',false,4,'{"max_files":3}');
  update public.template_versions set status='active',published_at=now() where id=v_template;
  return v_template;
end;
$$;
revoke all on function private.install_default_report_template(uuid,uuid) from public,anon,authenticated;

-- Keep consent, ownership and selected-workspace semantics unchanged. If the
-- template cannot be installed, creation and switching roll back with it.
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
  perform private.install_default_report_template(v_org, auth.uid());
  return v_org;
end;
$$;
revoke all on function public.create_workspace(text) from public,anon;
grant execute on function public.create_workspace(text) to authenticated;
