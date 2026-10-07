-- Separate reusable class definitions from dated sessions, add completed
-- sessions, preserve template history behind a simplified UI, and allow
-- administrators to edit every report in their organization.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title varchar(150) not null check (btrim(title) <> ''),
  location varchar(200) not null check (btrim(location) <> ''),
  teaching_method text check (char_length(teaching_method) <= 2000),
  memo text check (char_length(memo) <= 5000),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_org_active_title_idx
  on public.courses (organization_id, active, title);

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

alter table public.courses enable row level security;

create policy courses_select_org
on public.courses for select to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
);

create policy courses_insert_org
on public.courses for insert to authenticated
with check (
  public.is_active_member()
  and organization_id = public.current_organization_id()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy courses_update_creator_or_admin
on public.courses for update to authenticated
using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
  and (created_by = auth.uid() or public.is_admin())
)
with check (
  organization_id = public.current_organization_id()
  and updated_by = auth.uid()
);

revoke all on table public.courses from anon, authenticated;
grant select, insert, update on table public.courses to authenticated;
grant select, insert, update, delete on table public.courses to service_role;

alter table public.class_sessions
  add column course_id uuid references public.courses(id) on delete restrict;

do $$
declare
  v_session public.class_sessions;
  v_course_id uuid;
begin
  for v_session in select * from public.class_sessions order by created_at, id
  loop
    insert into public.courses (
      organization_id,
      title,
      location,
      teaching_method,
      memo,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) values (
      v_session.organization_id,
      v_session.title,
      v_session.location,
      v_session.teaching_method,
      v_session.memo,
      v_session.created_by,
      v_session.updated_by,
      v_session.created_at,
      v_session.updated_at
    ) returning id into v_course_id;

    update public.class_sessions
    set course_id = v_course_id
    where id = v_session.id;
  end loop;
end;
$$;

alter table public.class_sessions alter column course_id set not null;
create index class_sessions_course_start_idx
  on public.class_sessions (course_id, start_at desc);

create or replace function public.protect_course_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id
     or new.created_by <> old.created_by then
    raise exception 'Course organization and creator are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger courses_protect_identity
before update on public.courses
for each row execute function public.protect_course_identity();

revoke all on function public.protect_course_identity() from public;

create function public.derive_class_session_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'cancelled'::public.class_session_status then
    new.status := case
      when new.end_at <= now()
        then 'completed'::public.class_session_status
      else 'scheduled'::public.class_session_status
    end;
  end if;
  return new;
end;
$$;

create trigger class_sessions_derive_status
before insert or update of end_at, status on public.class_sessions
for each row execute function public.derive_class_session_status();

revoke all on function public.derive_class_session_status() from public;

-- This RPC is called before class/report reads and by the hourly deployment
-- cron. It persists the time-based state instead of only deriving it in UI.
create or replace function public.sync_completed_class_sessions(
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_count integer;
begin
  if auth.role() = 'service_role' then
    v_organization_id := p_organization_id;
  else
    if not public.is_active_member() then
      raise exception 'Authentication required' using errcode = '28000';
    end if;
    v_organization_id := public.current_organization_id();
    if p_organization_id is not null and p_organization_id <> v_organization_id then
      raise exception 'Organization mismatch' using errcode = '42501';
    end if;
  end if;

  update public.class_sessions
  set status = 'completed'::public.class_session_status,
      updated_at = now()
  where status = 'scheduled'::public.class_session_status
    and end_at <= now()
    and (v_organization_id is null or organization_id = v_organization_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sync_completed_class_sessions(uuid) from public;
grant execute on function public.sync_completed_class_sessions(uuid) to authenticated, service_role;

update public.class_sessions
set status = 'completed'::public.class_session_status,
    updated_at = now()
where status = 'scheduled'::public.class_session_status
  and end_at <= now();

drop function if exists public.create_class_schedule(uuid, jsonb);
create function public.create_class_schedule(
  p_registration_id uuid,
  p_course_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_course public.courses;
  v_id uuid;
  v_first uuid;
  v_index integer := 0;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_registration_id is null
     or p_course_id is null
     or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid schedule' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 366 then
    raise exception 'Schedule must contain 1 to 366 classes' using errcode = '22023';
  end if;

  select * into v_course
  from public.courses
  where id = p_course_id
    and organization_id = public.current_organization_id()
    and active;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || p_registration_id::text, 2)
  );
  select id into v_first
  from public.class_sessions
  where created_by = auth.uid()
    and organization_id = public.current_organization_id()
    and registration_id = p_registration_id
  order by occurrence_no
  limit 1;
  if v_first is not null then
    return v_first;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.class_sessions (
      organization_id,
      course_id,
      title,
      location,
      start_at,
      end_at,
      memo,
      teaching_method,
      has_time,
      created_by,
      updated_by,
      registration_id,
      occurrence_no
    ) values (
      public.current_organization_id(),
      v_course.id,
      v_course.title,
      v_course.location,
      (v_item ->> 'start_at')::timestamptz,
      (v_item ->> 'end_at')::timestamptz,
      v_course.memo,
      v_course.teaching_method,
      (v_item ->> 'has_time')::boolean,
      auth.uid(),
      auth.uid(),
      p_registration_id,
      v_index
    ) returning id into v_id;
    if v_first is null then v_first := v_id; end if;
    v_index := v_index + 1;
  end loop;
  return v_first;
end;
$$;

revoke all on function public.create_class_schedule(uuid, uuid, jsonb) from public;
grant execute on function public.create_class_schedule(uuid, uuid, jsonb) to authenticated;

-- Template versions remain immutable history, while group_id gives the UI a
-- single logical template and hidden_at implements reversible soft deletion.
alter table public.template_versions
  add column group_id uuid,
  add column hidden_at timestamptz;

update public.template_versions
set group_id = organization_id
where group_id is null;

alter table public.template_versions
  alter column group_id set not null,
  alter column group_id set default gen_random_uuid();

create index template_versions_visible_group_idx
  on public.template_versions (organization_id, group_id, updated_at desc)
  where hidden_at is null;

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
  v_group_id uuid;
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

  if p_fields is null or jsonb_typeof(p_fields) <> 'array'
     or jsonb_array_length(p_fields) not between 1 and 50 then
    raise exception 'Invalid fields' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_current
    from public.template_versions
    where id = p_id
      and organization_id = public.current_organization_id()
      and hidden_at is null
    for update;
    if not found then
      raise exception 'Template not found' using errcode = 'P0002';
    end if;
    if p_version is distinct from v_current.updated_at then
      raise exception 'Template changed; reload' using errcode = 'PT409';
    end if;
  end if;

  if p_id is not null and v_current.status = 'draft'::public.template_status then
    v_id := p_id;
    v_group_id := v_current.group_id;
    delete from public.template_fields where template_version_id = v_id;
  else
    v_group_id := coalesce(v_current.group_id, gen_random_uuid());
    insert into public.template_versions (
      organization_id,
      group_id,
      version,
      created_by,
      name
    )
    select
      public.current_organization_id(),
      v_group_id,
      coalesce(max(version), 0) + 1,
      auth.uid(),
      coalesce(v_current.name, '보고서 양식')
    from public.template_versions
    where organization_id = public.current_organization_id()
    returning id into v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_fields)
  loop
    if jsonb_typeof(v_item -> 'required') is distinct from 'boolean' then
      raise exception 'Required must be boolean' using errcode = '22023';
    end if;
    if v_item ->> 'field_type' = 'photo'
       and coalesce((v_item ->> 'max_files')::integer, 3) not between 1 and 10 then
      raise exception 'Invalid photo limit' using errcode = '22023';
    end if;

    insert into public.template_fields (
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
      nullif(btrim(v_item ->> 'help_text'), ''),
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
    ) returning id into v_field_id;

    if v_item ->> 'field_type' in ('single_select', 'multi_select') then
      if jsonb_typeof(v_item -> 'options') is distinct from 'array'
         or jsonb_array_length(v_item -> 'options') not between 1 and 50 then
        raise exception 'Options required' using errcode = '22023';
      end if;
      v_option_order := 0;
      for v_option in select jsonb_array_elements_text(v_item -> 'options')
      loop
        insert into public.field_options (field_id, label, sort_order)
        values (v_field_id, btrim(v_option), v_option_order);
        v_option_order := v_option_order + 1;
      end loop;
    end if;
    v_order := v_order + 1;
  end loop;

  update public.template_versions set updated_at = now() where id = v_id;
  if p_publish then perform public.publish_template(v_id); end if;
  return v_id;
end;
$$;

create or replace function public.publish_template(p_template_version_id uuid)
returns public.template_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.template_versions;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;

  select * into v_template
  from public.template_versions
  where id = p_template_version_id
    and organization_id = public.current_organization_id()
    and status = 'draft'::public.template_status
    and hidden_at is null
  for update;
  if not found then
    raise exception 'Draft template not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.template_fields
    where template_version_id = p_template_version_id
  ) then
    raise exception 'A template requires at least one field' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.template_fields f
    where f.template_version_id = p_template_version_id
      and f.field_type in ('single_select', 'multi_select')
      and not exists (
        select 1 from public.field_options o where o.field_id = f.id
      )
  ) then
    raise exception 'Every select field requires at least one option'
      using errcode = '23514';
  end if;

  update public.template_versions
  set status = 'archived'
  where organization_id = public.current_organization_id()
    and status = 'active'::public.template_status;

  update public.template_versions
  set status = 'active', published_at = now()
  where id = p_template_version_id
  returning * into v_template;
  return v_template;
end;
$$;

create function public.deactivate_template(p_template_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  select group_id into v_group_id
  from public.template_versions
  where id = p_template_version_id
    and organization_id = public.current_organization_id()
    and hidden_at is null
  for update;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  update public.template_versions
  set hidden_at = now(),
      status = 'archived'::public.template_status,
      published_at = coalesce(published_at, now())
  where organization_id = public.current_organization_id()
    and group_id = v_group_id
    and hidden_at is null;
end;
$$;

revoke all on function public.deactivate_template(uuid) from public;
grant execute on function public.deactivate_template(uuid) to authenticated;

create or replace function public.can_read_template(p_template_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member()
    and exists (
      select 1
      from public.template_versions tv
      where tv.id = p_template_version_id
        and tv.organization_id = public.current_organization_id()
        and (
          public.is_admin()
          or (tv.status = 'active'::public.template_status and tv.hidden_at is null)
          or exists (
            select 1
            from public.reports r
            where r.template_version_id = tv.id
              and r.organization_id = tv.organization_id
              and r.author_id = auth.uid()
          )
        )
    )
$$;

-- Report authors and same-organization administrators share edit rights.
create or replace function public.save_report_draft(
  p_report_id uuid,
  p_answers jsonb
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_item jsonb;
  v_field public.template_fields;
  v_field_id uuid;
  v_value jsonb;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'Answers must be a JSON array' using errcode = '22023';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id
    and organization_id = public.current_organization_id()
    and (author_id = auth.uid() or public.is_admin())
  for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  for v_item in select value from jsonb_array_elements(p_answers)
  loop
    if not (v_item ? 'fieldId') or not (v_item ? 'value') then
      raise exception 'Each answer requires fieldId and value' using errcode = '22023';
    end if;
    v_field_id := (v_item ->> 'fieldId')::uuid;
    v_value := v_item -> 'value';
    select * into v_field
    from public.template_fields
    where id = v_field_id
      and template_version_id = v_report.template_version_id;
    if not found then
      raise exception 'Field does not belong to the report template' using errcode = '23503';
    end if;
    if not public.answer_matches_type(v_field.field_type, v_value) then
      raise exception 'Invalid value type for field' using errcode = '22023';
    end if;
    insert into public.report_answers (report_id, field_id, value)
    values (p_report_id, v_field_id, v_value)
    on conflict (report_id, field_id) do update set value = excluded.value;
  end loop;

  delete from public.report_answers a
  where a.report_id = p_report_id
    and not exists (
      select 1 from jsonb_array_elements(p_answers) item
      where (item ->> 'fieldId')::uuid = a.field_id
    );

  update public.reports
  set confirmed_by = null, confirmed_at = null
  where id = p_report_id
  returning * into v_report;
  return v_report;
end;
$$;

create or replace function public.submit_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_session_status public.class_session_status;
  v_field public.template_fields;
  v_value jsonb;
  v_attachment_count integer;
  v_max_files integer;
begin
  if not public.is_active_member() then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select r.* into v_report
  from public.reports r
  where r.id = p_report_id
    and r.organization_id = public.current_organization_id()
    and (r.author_id = auth.uid() or public.is_admin())
  for update of r;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  select cs.status into v_session_status
  from public.class_sessions cs
  where cs.id = v_report.class_session_id
  for share;
  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A report for a cancelled session cannot be submitted'
      using errcode = '23514';
  end if;

  for v_field in
    select * from public.template_fields
    where template_version_id = v_report.template_version_id
    order by sort_order
  loop
    if v_field.field_type = 'photo'::public.template_field_type then
      select count(*) into v_attachment_count
      from public.report_attachments
      where report_id = p_report_id and field_id = v_field.id;
      v_max_files := coalesce((v_field.settings ->> 'max_files')::integer, 3);
      if v_field.required and v_attachment_count = 0 then
        raise exception 'Required photo field is empty: %', v_field.label
          using errcode = '23514';
      end if;
      if v_attachment_count > v_max_files then
        raise exception 'Too many photos for field %', v_field.label
          using errcode = '23514';
      end if;
      continue;
    end if;

    v_value := null;
    select a.value into v_value
    from public.report_answers a
    where a.report_id = p_report_id and a.field_id = v_field.id;
    if v_field.required and public.answer_is_empty(v_value) then
      raise exception 'Required field is empty: %', v_field.label using errcode = '23514';
    end if;
    if not public.answer_is_empty(v_value) then
      if not public.answer_matches_type(v_field.field_type, v_value) then
        raise exception 'Invalid value type for field %', v_field.label using errcode = '22023';
      end if;
      if v_field.field_type = 'date'::public.template_field_type
         and (v_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Invalid date value for field %', v_field.label using errcode = '22007';
      end if;
      if v_field.field_type = 'single_select'::public.template_field_type
         and not exists (
           select 1 from public.field_options o
           where o.field_id = v_field.id and o.label = (v_value #>> '{}')
         ) then
        raise exception 'Invalid option for field %', v_field.label using errcode = '22023';
      end if;
      if v_field.field_type = 'multi_select'::public.template_field_type
         and exists (
           select 1 from jsonb_array_elements_text(v_value) selected(value)
           where not exists (
             select 1 from public.field_options o
             where o.field_id = v_field.id and o.label = selected.value
           )
         ) then
        raise exception 'Invalid option for field %', v_field.label using errcode = '22023';
      end if;
    end if;
  end loop;

  update public.reports
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      confirmed_by = null,
      confirmed_at = null
  where id = p_report_id
  returning * into v_report;
  return v_report;
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
  select cs.status into v_session_status
  from public.reports r
  join public.class_sessions cs on cs.id = r.class_session_id
  where r.id = p_id
    and r.organization_id = public.current_organization_id()
    and (r.author_id = auth.uid() or public.is_admin())
  for update of cs;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if v_session_status = 'cancelled'::public.class_session_status then
    raise exception 'A report for a cancelled session cannot be changed' using errcode = 'PT409';
  end if;

  select * into v_report
  from public.reports
  where id = p_id
    and organization_id = public.current_organization_id()
    and (author_id = auth.uid() or public.is_admin())
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

drop policy if exists report_attachments_insert_author on public.report_attachments;
create policy report_attachments_insert_author_or_admin
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
      and r.organization_id = report_attachments.organization_id
      and (r.author_id = auth.uid() or public.is_admin())
      and cs.status <> 'cancelled'::public.class_session_status
      and tf.template_version_id = r.template_version_id
      and tf.field_type = 'photo'::public.template_field_type
  )
);

drop policy if exists report_attachments_delete_author on public.report_attachments;
drop policy if exists report_attachments_delete_author_or_admin on public.report_attachments;
create policy report_attachments_delete_author_or_admin
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
      and (r.author_id = auth.uid() or public.is_admin())
      and cs.status <> 'cancelled'::public.class_session_status
  )
);

drop policy if exists report_images_insert_author on storage.objects;
create policy report_images_insert_author_or_admin
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
      and (r.author_id = auth.uid() or public.is_admin())
      and cs.status <> 'cancelled'::public.class_session_status
  )
);

drop policy if exists report_images_delete_author on storage.objects;
drop policy if exists report_images_delete_author_or_admin on storage.objects;
create policy report_images_delete_author_or_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (
    select 1
    from public.reports r
    where r.id = ((storage.foldername(name))[2])::uuid
      and r.organization_id = public.current_organization_id()
      and (r.author_id = auth.uid() or public.is_admin())
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
      select 1 from public.report_attachments ra
      where ra.storage_path = storage.objects.name
    )
  )
);
