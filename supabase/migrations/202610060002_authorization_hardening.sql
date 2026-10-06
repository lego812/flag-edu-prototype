-- Keep invited/password-reset-required members outside every authenticated data
-- policy until the trusted password setup flow activates their profile.
update public.profiles p
set status = 'pending'::public.member_status,
    updated_at = now()
from auth.users u
where p.id = u.id
  and p.status = 'active'::public.member_status
  and u.raw_user_meta_data -> 'must_change_password' = 'true'::jsonb;

-- A cancelled class is terminal. Content can still be corrected, but restoring
-- the state requires a future, explicit workflow rather than a direct update.
create or replace function public.protect_class_session_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.created_by <> old.created_by then
    raise exception 'Class session organization and creator are immutable'
      using errcode = '42501';
  end if;

  if old.status = 'cancelled'::public.class_session_status
     and new.status <> old.status then
    raise exception 'A cancelled class session cannot be restored'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Invited members can be activated only by the trusted password setup path.
-- Organization administrators retain active/inactive management after setup.
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
  from public.profiles
  where id = p_user_id
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

revoke all on function public.manage_member(
  uuid,
  public.member_role,
  public.member_status
) from public;
grant execute on function public.manage_member(
  uuid,
  public.member_role,
  public.member_status
) to authenticated;

-- Coaches need the active template and historical templates referenced by
-- their own reports, but never unpublished drafts or unrelated archives.
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
          or tv.status = 'active'::public.template_status
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

revoke all on function public.can_read_template(uuid) from public;
grant execute on function public.can_read_template(uuid) to authenticated;

drop policy if exists template_versions_select_org on public.template_versions;
create policy template_versions_select_permitted
on public.template_versions for select to authenticated
using (public.can_read_template(id));

drop policy if exists template_fields_select_org on public.template_fields;
create policy template_fields_select_permitted
on public.template_fields for select to authenticated
using (public.can_read_template(template_version_id));

drop policy if exists field_options_select_org on public.field_options;
create policy field_options_select_permitted
on public.field_options for select to authenticated
using (
  exists (
    select 1
    from public.template_fields tf
    where tf.id = field_id
      and public.can_read_template(tf.template_version_id)
  )
);

-- Reading every same-organization report remains an administrator capability;
-- mutating another author's photos does not.
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
    where r.id = report_attachments.report_id
      and r.organization_id = report_attachments.organization_id
      and r.author_id = auth.uid()
  )
);

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
);
