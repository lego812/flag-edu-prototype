-- Share report reads inside the selected, active workspace. Mutation policies
-- and RPC author/admin checks deliberately remain unchanged.
drop policy reports_select_author_or_admin on public.reports;
create policy reports_select_workspace_member on public.reports
for select to authenticated using (
  public.is_active_member()
  and organization_id = public.current_organization_id()
);

drop policy report_answers_select_author_or_admin on public.report_answers;
create policy report_answers_select_workspace_member on public.report_answers
for select to authenticated using (
  exists (select 1 from public.reports r where r.id = report_id
    and r.organization_id = public.current_organization_id())
);

drop policy report_attachments_select_author_or_admin on public.report_attachments;
create policy report_attachments_select_workspace_member on public.report_attachments
for select to authenticated using (
  organization_id = public.current_organization_id()
  and exists (select 1 from public.reports r where r.id = report_id
    and r.organization_id = public.current_organization_id())
);

drop policy report_images_select_author_or_admin on storage.objects;
create policy report_images_select_workspace_member on storage.objects
for select to authenticated using (
  bucket_id = 'report-images'
  and (storage.foldername(name))[1] = public.current_organization_id()::text
  and exists (select 1 from public.reports r
    where r.id::text = (storage.foldername(name))[2]
      and r.organization_id = public.current_organization_id())
);

-- Existing historical reports must retain readable fields/options even after
-- their template is archived or hidden. Unused drafts stay administrator-only.
create or replace function public.can_read_template(p_template_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.is_active_member()
    and exists (
      select 1 from public.template_versions tv
      where tv.id = p_template_version_id
        and tv.organization_id = public.current_organization_id()
        and (
          public.is_admin()
          or (tv.status = 'active'::public.template_status and tv.hidden_at is null)
          or exists (select 1 from public.reports r
            where r.template_version_id = tv.id
              and r.organization_id = tv.organization_id)
        )
    )
$$;
revoke all on function public.can_read_template(uuid) from public, anon;
grant execute on function public.can_read_template(uuid) to authenticated;

-- Profiles also contain private account state. Do not widen profiles RLS just
-- to render an author's name. Return only names of authors with visible reports,
-- including authors who have left or selected a different workspace.
create function private.report_author_names(p_author_ids uuid[])
returns table(id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name::text from public.profiles p
  where auth.uid() is not null and public.is_active_member()
    and (p_author_ids is null or p.id = any(p_author_ids))
    and exists (select 1 from public.reports r
      where r.author_id = p.id
        and r.organization_id = public.current_organization_id())
  order by p.name, p.id
$$;
revoke all on function private.report_author_names(uuid[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.report_author_names(uuid[]) to authenticated;

create function public.list_report_authors(p_author_ids uuid[] default null)
returns table(id uuid, name text)
language sql stable security invoker set search_path = '' as $$
  select * from private.report_author_names(p_author_ids)
$$;
revoke all on function public.list_report_authors(uuid[]) from public, anon;
grant execute on function public.list_report_authors(uuid[]) to authenticated;
