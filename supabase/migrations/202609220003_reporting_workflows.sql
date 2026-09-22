-- Atomic template editing, report submission and member changes.
create function public.save_template(p_id uuid, p_version timestamptz, p_fields jsonb, p_publish boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_field_id uuid; v_item jsonb; v_option text;
  v_order integer := 0; v_option_order integer; v_current public.template_versions;
begin
  if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(public.current_organization_id()::text, 0));
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then raise exception 'Invalid fields'; end if;
  if jsonb_array_length(p_fields) not between 1 and 50 then raise exception 'Invalid field count'; end if;
  if p_id is null then
    insert into public.template_versions(organization_id, version, created_by)
    select public.current_organization_id(), coalesce(max(version),0)+1, auth.uid()
    from public.template_versions where organization_id=public.current_organization_id()
    returning id into v_id;
  else
    select * into v_current from public.template_versions where id=p_id and organization_id=public.current_organization_id() for update;
    if not found or v_current.status <> 'draft' then raise exception 'Draft template not found'; end if;
    if p_version is distinct from v_current.updated_at then raise exception 'Template changed; reload' using errcode='40001'; end if;
    v_id := p_id;
    delete from public.template_fields where template_version_id=v_id;
  end if;
  for v_item in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(v_item->'required') is distinct from 'boolean' then raise exception 'Required must be boolean'; end if;
    if v_item->>'field_type' = 'photo' and (coalesce((v_item->>'max_files')::int,3) not between 1 and 10) then raise exception 'Invalid photo limit'; end if;
    insert into public.template_fields(template_version_id,label,help_text,field_type,required,sort_order,settings)
    values(v_id,btrim(v_item->>'label'),v_item->>'help_text',(v_item->>'field_type')::public.template_field_type,(v_item->>'required')::boolean,v_order,
      case when v_item->>'field_type'='photo' then jsonb_build_object('max_files',coalesce((v_item->>'max_files')::int,3)) else '{}'::jsonb end)
    returning id into v_field_id;
    if v_item->>'field_type' in ('single_select','multi_select') then
      if jsonb_typeof(v_item->'options') is distinct from 'array' then raise exception 'Options required'; end if;
      if jsonb_array_length(v_item->'options') not between 1 and 50 then raise exception 'Invalid option count'; end if;
      v_option_order := 0;
      for v_option in select jsonb_array_elements_text(v_item->'options') loop
        insert into public.field_options(field_id,label,sort_order) values(v_field_id,btrim(v_option),v_option_order);
        v_option_order := v_option_order+1;
      end loop;
    end if;
    v_order := v_order+1;
  end loop;
  update public.template_versions set updated_at=now() where id=v_id;
  if p_publish then perform public.publish_template(v_id); end if;
  return v_id;
end; $$;

create function public.save_and_submit_report(p_id uuid, p_version timestamptz, p_answers jsonb, p_submit boolean)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare v_report public.reports;
begin
  if not public.is_active_member() then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into v_report from public.reports where id=p_id and author_id=auth.uid() and organization_id=public.current_organization_id() for update;
  if not found then raise exception 'Report not found'; end if;
  if p_version is distinct from v_report.updated_at then raise exception 'Report changed; reload' using errcode='40001'; end if;
  select * into v_report from public.save_report_draft(p_id,p_answers);
  -- Submitted reports stay submitted, and edits must remain valid.
  if p_submit or v_report.status='submitted' then select * into v_report from public.submit_report(p_id); end if;
  return v_report;
end; $$;

create function public.manage_member(p_user_id uuid, p_role public.member_role, p_status public.member_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(public.current_organization_id()::text, 1));
  -- Status first prevents partial writes and preserves the last active administrator.
  perform public.change_member_status(p_user_id,p_status);
  perform public.change_member_role(p_user_id,p_role);
end; $$;

create function public.confirm_report_version(p_id uuid, p_version timestamptz)
returns public.reports language plpgsql security definer set search_path = '' as $$
declare v_report public.reports;
begin
  if not public.is_admin() then raise exception 'Administrator permission required' using errcode='42501'; end if;
  select * into v_report from public.reports where id=p_id and organization_id=public.current_organization_id() for update;
  if not found or p_version is distinct from v_report.updated_at then raise exception 'Report changed; reload' using errcode='40001'; end if;
  select * into v_report from public.confirm_report(p_id);
  return v_report;
end; $$;

create function public.validate_report_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_report public.reports; v_field public.template_fields; v_count int;
begin
  select * into v_report from public.reports where id=new.report_id for update;
  select * into v_field from public.template_fields where id=new.field_id and template_version_id=v_report.template_version_id and field_type='photo';
  if not found or new.organization_id <> v_report.organization_id or new.mime_type <> 'image/jpeg' then raise exception 'Invalid attachment'; end if;
  if new.storage_path !~ ('^' || new.organization_id::text || '/' || new.report_id::text || '/[0-9a-f-]{36}\.jpg$') then raise exception 'Invalid storage path'; end if;
  select count(*) into v_count from public.report_attachments where report_id=new.report_id and field_id=new.field_id;
  if v_count >= coalesce((v_field.settings->>'max_files')::int,3) then raise exception 'Photo limit reached'; end if;
  if not exists(select 1 from storage.objects where bucket_id='report-images' and name=new.storage_path) then raise exception 'Uploaded file not found'; end if;
  return new;
end; $$;
create trigger report_attachment_validate before insert on public.report_attachments for each row execute function public.validate_report_attachment();

grant insert, update on public.export_jobs to authenticated;
create policy export_jobs_insert_requester on public.export_jobs for insert to authenticated with check(public.is_admin() and organization_id=public.current_organization_id() and requested_by=auth.uid());
create policy export_jobs_update_requester on public.export_jobs for update to authenticated using(public.is_admin() and organization_id=public.current_organization_id() and requested_by=auth.uid()) with check(public.is_admin() and organization_id=public.current_organization_id() and requested_by=auth.uid());

revoke all on function public.save_template(uuid,timestamptz,jsonb,boolean) from public;
revoke all on function public.save_and_submit_report(uuid,timestamptz,jsonb,boolean) from public;
revoke all on function public.manage_member(uuid,public.member_role,public.member_status) from public;
revoke all on function public.validate_report_attachment() from public;
grant execute on function public.save_template(uuid,timestamptz,jsonb,boolean) to authenticated;
grant execute on function public.save_and_submit_report(uuid,timestamptz,jsonb,boolean) to authenticated;
grant execute on function public.manage_member(uuid,public.member_role,public.member_status) to authenticated;
revoke all on function public.confirm_report_version(uuid,timestamptz) from public;
grant execute on function public.confirm_report_version(uuid,timestamptz) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-exports','report-exports',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
create policy report_exports_select on storage.objects for select to authenticated using(bucket_id='report-exports' and public.is_admin() and (storage.foldername(name))[1]=public.current_organization_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
create policy report_exports_insert on storage.objects for insert to authenticated with check(bucket_id='report-exports' and public.is_admin() and (storage.foldername(name))[1]=public.current_organization_id()::text and (storage.foldername(name))[2]=auth.uid()::text);
create policy report_exports_delete on storage.objects for delete to authenticated using(bucket_id='report-exports' and public.is_admin() and (storage.foldername(name))[1]=public.current_organization_id()::text and (storage.foldername(name))[2]=auth.uid()::text);

-- Force public callers through the atomic/version-checked entry points above.
revoke insert,update on public.template_versions from authenticated;
revoke insert,update,delete on public.template_fields,public.field_options from authenticated;
revoke execute on function public.save_report_draft(uuid,jsonb) from authenticated;
revoke execute on function public.submit_report(uuid) from authenticated;
revoke execute on function public.confirm_report(uuid) from authenticated;
revoke execute on function public.publish_template(uuid) from authenticated;
revoke execute on function public.change_member_role(uuid,public.member_role) from authenticated;
revoke execute on function public.change_member_status(uuid,public.member_status) from authenticated;

-- Photos are saved independently: any photo change requires resubmission.
create or replace function public.touch_report_after_attachment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.reports set status='draft',submitted_at=null,confirmed_by=null,confirmed_at=null,updated_at=now()
  where id=case when tg_op='DELETE' then old.report_id else new.report_id end;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create function public.validate_report_answer_date()
returns trigger language plpgsql set search_path = '' as $$
declare v_type public.template_field_type; v_date text;
begin
  select field_type into v_type from public.template_fields where id=new.field_id;
  if v_type='date' and new.value <> 'null'::jsonb and new.value <> '""'::jsonb then
    v_date := new.value #>> '{}';
    if v_date !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date'; end if;
    perform v_date::date;
  end if;
  return new;
end; $$;
create trigger report_answer_date before insert or update on public.report_answers for each row execute function public.validate_report_answer_date();
revoke all on function public.validate_report_answer_date() from public;
