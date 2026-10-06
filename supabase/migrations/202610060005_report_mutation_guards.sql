-- Return non-retryable conflicts promptly and make cancelled classes immutable
-- across report answers and photo attachments.

create or replace function public.save_template(
  p_id uuid,
  p_version timestamptz,
  p_fields jsonb,
  p_publish boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_field_id uuid;
  v_item jsonb;
  v_option text;
  v_order integer := 0;
  v_option_order integer;
  v_current public.template_versions;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(public.current_organization_id()::text, 0)
  );

  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'Invalid fields';
  end if;
  if jsonb_array_length(p_fields) not between 1 and 50 then
    raise exception 'Invalid field count';
  end if;

  if p_id is null then
    insert into public.template_versions(organization_id, version, created_by)
    select public.current_organization_id(), coalesce(max(version), 0) + 1, auth.uid()
    from public.template_versions
    where organization_id = public.current_organization_id()
    returning id into v_id;
  else
    select * into v_current
    from public.template_versions
    where id = p_id
      and organization_id = public.current_organization_id()
    for update;

    if not found or v_current.status <> 'draft' then
      raise exception 'Draft template not found';
    end if;
    if p_version is distinct from v_current.updated_at then
      raise exception 'Template changed; reload' using errcode = 'PT409';
    end if;

    v_id := p_id;
    delete from public.template_fields where template_version_id = v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_fields)
  loop
    if jsonb_typeof(v_item -> 'required') is distinct from 'boolean' then
      raise exception 'Required must be boolean';
    end if;
    if v_item ->> 'field_type' = 'photo'
       and coalesce((v_item ->> 'max_files')::integer, 3) not between 1 and 10 then
      raise exception 'Invalid photo limit';
    end if;

    insert into public.template_fields(
      template_version_id,
      label,
      help_text,
      field_type,
      required,
      sort_order,
      settings
    ) values (
      v_id,
      btrim(v_item ->> 'label'),
      v_item ->> 'help_text',
      (v_item ->> 'field_type')::public.template_field_type,
      (v_item ->> 'required')::boolean,
      v_order,
      case
        when v_item ->> 'field_type' = 'photo'
          then jsonb_build_object(
            'max_files',
            coalesce((v_item ->> 'max_files')::integer, 3)
          )
        else '{}'::jsonb
      end
    )
    returning id into v_field_id;

    if v_item ->> 'field_type' in ('single_select', 'multi_select') then
      if jsonb_typeof(v_item -> 'options') is distinct from 'array' then
        raise exception 'Options required';
      end if;
      if jsonb_array_length(v_item -> 'options') not between 1 and 50 then
        raise exception 'Invalid option count';
      end if;

      v_option_order := 0;
      for v_option in select jsonb_array_elements_text(v_item -> 'options')
      loop
        insert into public.field_options(field_id, label, sort_order)
        values(v_field_id, btrim(v_option), v_option_order);
        v_option_order := v_option_order + 1;
      end loop;
    end if;

    v_order := v_order + 1;
  end loop;

  update public.template_versions set updated_at = now() where id = v_id;
  if p_publish then
    perform public.publish_template(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.save_and_submit_report(
  p_id uuid,
  p_version timestamptz,
  p_answers jsonb,
  p_submit boolean
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_session_status public.class_session_status;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Lock the class before the report so cancellation and edits have one
  -- consistent serialization order.
  select cs.status into v_session_status
  from public.reports r
  join public.class_sessions cs on cs.id = r.class_session_id
  where r.id = p_id
    and r.author_id = auth.uid()
    and r.organization_id = public.current_organization_id()
  for update of cs;

  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A report for a cancelled session cannot be changed'
      using errcode = 'PT409';
  end if;

  select * into v_report
  from public.reports
  where id = p_id
    and author_id = auth.uid()
    and organization_id = public.current_organization_id()
  for update;

  if p_version is distinct from v_report.updated_at then
    raise exception 'Report changed; reload' using errcode = 'PT409';
  end if;

  select * into v_report from public.save_report_draft(p_id, p_answers);
  if p_submit then
    select * into v_report from public.submit_report(p_id);
  else
    update public.reports
    set status = 'draft', submitted_at = null
    where id = p_id
    returning * into v_report;
  end if;

  return v_report;
end;
$$;

create or replace function public.validate_report_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_field public.template_fields;
  v_count integer;
  v_class_session_id uuid;
  v_session_status public.class_session_status;
begin
  select class_session_id into v_class_session_id
  from public.reports
  where id = new.report_id;

  select status into v_session_status
  from public.class_sessions
  where id = v_class_session_id
  for share;

  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A cancelled session attachment cannot be changed'
      using errcode = 'PT409';
  end if;

  select * into v_report
  from public.reports
  where id = new.report_id
  for update;

  select * into v_field
  from public.template_fields
  where id = new.field_id
    and template_version_id = v_report.template_version_id
    and field_type = 'photo';

  if not found
     or new.organization_id <> v_report.organization_id
     or new.mime_type <> 'image/jpeg' then
    raise exception 'Invalid attachment';
  end if;
  if new.storage_path !~ (
    '^' || new.organization_id::text || '/' || new.report_id::text ||
    '/[0-9a-f-]{36}\.jpg$'
  ) then
    raise exception 'Invalid storage path';
  end if;

  select count(*) into v_count
  from public.report_attachments
  where report_id = new.report_id
    and field_id = new.field_id;

  if v_count >= coalesce((v_field.settings ->> 'max_files')::integer, 3) then
    raise exception 'Photo limit reached';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'report-images'
      and name = new.storage_path
  ) then
    raise exception 'Uploaded file not found';
  end if;

  return new;
end;
$$;

create or replace function public.guard_report_attachment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_session_id uuid;
  v_session_status public.class_session_status;
begin
  select class_session_id into v_class_session_id
  from public.reports
  where id = old.report_id;

  select status into v_session_status
  from public.class_sessions
  where id = v_class_session_id
  for share;

  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A cancelled session attachment cannot be changed'
      using errcode = 'PT409';
  end if;

  perform 1 from public.reports where id = old.report_id for update;
  return old;
end;
$$;

drop trigger if exists report_attachment_guard_delete
on public.report_attachments;
create trigger report_attachment_guard_delete
before delete on public.report_attachments
for each row execute function public.guard_report_attachment_delete();

revoke all on function public.guard_report_attachment_delete() from public;

drop policy if exists report_attachments_insert_author
on public.report_attachments;
create policy report_attachments_insert_author
on public.report_attachments for insert to authenticated
with check (
  public.is_active_member()
  and report_attachments.organization_id = public.current_organization_id()
  and report_attachments.storage_path like (
    public.current_organization_id()::text || '/' ||
    report_attachments.report_id::text || '/%'
  )
  and exists (
    select 1
    from public.reports r
    join public.class_sessions cs on cs.id = r.class_session_id
    join public.template_fields tf on tf.id = report_attachments.field_id
    where r.id = report_attachments.report_id
      and r.author_id = auth.uid()
      and r.organization_id = report_attachments.organization_id
      and cs.status <> 'cancelled'::public.class_session_status
      and tf.template_version_id = r.template_version_id
      and tf.field_type = 'photo'::public.template_field_type
  )
);

drop policy if exists report_attachments_delete_author
on public.report_attachments;
drop policy if exists report_attachments_delete_author_or_admin
on public.report_attachments;
create policy report_attachments_delete_author
on public.report_attachments for delete to authenticated
using (
  public.is_active_member()
  and report_attachments.organization_id = public.current_organization_id()
  and exists (
    select 1
    from public.reports r
    join public.class_sessions cs on cs.id = r.class_session_id
    where r.id = report_attachments.report_id
      and r.organization_id = report_attachments.organization_id
      and r.author_id = auth.uid()
      and cs.status <> 'cancelled'::public.class_session_status
  )
);

drop policy if exists report_images_insert_author on storage.objects;
create policy report_images_insert_author
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    join public.class_sessions cs on cs.id = r.class_session_id
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and r.author_id = auth.uid()
      and cs.status <> 'cancelled'::public.class_session_status
  )
);

drop policy if exists report_images_delete_author on storage.objects;
drop policy if exists report_images_delete_author_or_admin on storage.objects;
create policy report_images_delete_author
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and r.author_id = auth.uid()
  )
  and (
    exists (
      select 1
      from public.reports r
      join public.class_sessions cs on cs.id = r.class_session_id
      where r.id = ((storage.foldername(name))[2])::uuid
        and cs.status <> 'cancelled'::public.class_session_status
    )
    or not exists (
      select 1
      from public.report_attachments ra
      where ra.storage_path = storage.objects.name
    )
  )
);

