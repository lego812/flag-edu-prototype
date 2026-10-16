-- Service-wide master is separate from workspace memberships and grants no writes.
create table private.service_master (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table private.service_master enable row level security;
revoke all on private.service_master from public, anon, authenticated;
-- Pin the existing verified account. An empty development database gets no master.
insert into private.service_master(user_id)
select id from auth.users where lower(email) = 'davin990812@gmail.com' and email_confirmed_at is not null;

create function private.is_service_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.service_master m join auth.users u on u.id=m.user_id
    where m.user_id=auth.uid() and lower(u.email)='davin990812@gmail.com'
      and u.email_confirmed_at is not null) and public.has_signup_consent()
$$;
create function public.is_service_master()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_service_master()
$$;
grant usage on schema private to authenticated;
revoke all on function private.is_service_master(), public.is_service_master() from public, anon;
grant execute on function private.is_service_master(), public.is_service_master() to authenticated;

create function private.master_users(p_search text, p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_service_master() then raise exception 'Master required' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_search is null or length(p_search)>100 then
    raise exception 'Invalid query' using errcode='22023'; end if;
  with matched as (
    select u.id,u.email,u.created_at,u.last_sign_in_at,p.name,c.accepted_at,c.policy_version,
      case when c.user_id is not null then 'accepted' when e.user_id is not null then 'legacy_exempt' else 'pending' end consent
    from auth.users u left join public.profiles p on p.id=u.id
    left join public.signup_consents c on c.user_id=u.id
    left join private.signup_existing_accounts e on e.user_id=u.id
    where strpos(lower(coalesce(u.email,'')),lower(p_search))>0 or strpos(lower(coalesce(p.name,'')),lower(p_search))>0
  ), paged as (select * from matched order by created_at desc,id limit 20 offset (p_page-1)*20)
  select jsonb_build_object(
    'total',(select count(*) from matched),
    'stats',jsonb_build_object('total',(select count(*) from auth.users),
      'recent',(select count(*) from auth.users where created_at>=now()-interval '7 days'),
      'without_workspace',(select count(*) from auth.users u where not exists(
        select 1 from public.workspace_memberships wm join public.organizations o on o.id=wm.organization_id
        where wm.user_id=u.id and wm.status='active' and o.deleted_at is null))),
    'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('memberships',coalesce((
      select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',wm.role,'status',wm.status) order by o.name,o.id)
      from public.workspace_memberships wm join public.organizations o on o.id=wm.organization_id
      where wm.user_id=p.id and wm.status<>'removed' and o.deleted_at is null),'[]'::jsonb)) order by p.created_at desc,p.id) from paged p),'[]'::jsonb)
  ) into result;
  return result;
end $$;
create function public.master_users(p_search text default '',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.master_users(p_search,p_page)$$;

create function private.master_workspaces(p_search text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_service_master() then raise exception 'Master required' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_search is null or length(p_search)>100 then raise exception 'Invalid query' using errcode='22023'; end if;
  with matched as (select id,name,created_at from public.organizations where deleted_at is null and strpos(lower(name),lower(p_search))>0),
  paged as (select * from matched order by created_at desc,id limit 20 offset (p_page-1)*20)
  select jsonb_build_object('total',(select count(*) from matched),'items',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc,id) from paged p),'[]'::jsonb)) into result;
  return result;
end $$;
create function public.master_workspaces(p_search text default '',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.master_workspaces(p_search,p_page)$$;

-- Each tab is bounded; no context switch, automatic status sync or business writes.
create function private.master_workspace(p_workspace_id uuid,p_section text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_workspace jsonb; v_items jsonb; v_total bigint;
begin
  if not private.is_service_master() then raise exception 'Master required' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 or p_section is null or p_section not in ('courses','sessions','reports','members','templates') then raise exception 'Invalid query' using errcode='22023'; end if;
  select jsonb_build_object('id',id,'name',name) into v_workspace from public.organizations where id=p_workspace_id and deleted_at is null;
  if v_workspace is null then return null; end if;
  if p_section='courses' then
    select count(*) into v_total from public.courses where organization_id=p_workspace_id;
    select coalesce(jsonb_agg(to_jsonb(t) order by title,id),'[]'::jsonb) into v_items from (
      select id,title,location,teaching_method,memo,active from public.courses where organization_id=p_workspace_id order by title,id limit 20 offset (p_page-1)*20) t;
  elsif p_section='sessions' then
    select count(*) into v_total from public.class_sessions where organization_id=p_workspace_id;
    select coalesce(jsonb_agg(to_jsonb(t) order by start_at desc,id),'[]'::jsonb) into v_items from (
      select id,title,location,teaching_method,memo,start_at,end_at,has_time,
        case when status='scheduled' and end_at<now() then 'completed' else status::text end status
      from public.class_sessions where organization_id=p_workspace_id order by start_at desc,id limit 20 offset (p_page-1)*20) t;
  elsif p_section='reports' then
    select count(*) into v_total from public.reports where organization_id=p_workspace_id;
    select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc,id),'[]'::jsonb) into v_items from (
      select r.id,s.title,p.name author,r.status,r.created_at,s.start_at from public.reports r
      join public.class_sessions s on s.id=r.class_session_id join public.profiles p on p.id=r.author_id
      where r.organization_id=p_workspace_id order by r.created_at desc,r.id limit 20 offset (p_page-1)*20) t;
  elsif p_section='members' then
    select count(*) into v_total from public.workspace_memberships where organization_id=p_workspace_id and status<>'removed';
    select coalesce(jsonb_agg(to_jsonb(t) order by name,id),'[]'::jsonb) into v_items from (
      select wm.user_id id,p.name,wm.role,wm.status from public.workspace_memberships wm join public.profiles p on p.id=wm.user_id
      where wm.organization_id=p_workspace_id and wm.status<>'removed' order by p.name,wm.user_id limit 20 offset (p_page-1)*20) t;
  else
    select count(*) into v_total from public.template_versions where organization_id=p_workspace_id and hidden_at is null;
    select coalesce(jsonb_agg(to_jsonb(t) order by version desc,id),'[]'::jsonb) into v_items from (
      select tv.id,tv.name,tv.version,tv.status,coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'label',f.label,'field_type',f.field_type,'required',f.required,'help_text',f.help_text,'settings',f.settings,
        'options',coalesce((select jsonb_agg(fo.label order by fo.sort_order) from public.field_options fo where fo.field_id=f.id),'[]'::jsonb)) order by f.sort_order) from public.template_fields f where f.template_version_id=tv.id),'[]'::jsonb) fields
      from public.template_versions tv where tv.organization_id=p_workspace_id and tv.hidden_at is null order by tv.version desc,tv.id limit 20 offset (p_page-1)*20) t;
  end if;
  return jsonb_build_object('workspace',v_workspace,'total',v_total,'items',v_items);
end $$;
create function public.master_workspace(p_workspace_id uuid,p_section text default 'courses',p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.master_workspace(p_workspace_id,p_section,p_page)$$;

create function private.master_report(p_workspace_id uuid,p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_service_master() then raise exception 'Master required' using errcode='42501'; end if;
  select jsonb_build_object('workspace',jsonb_build_object('id',o.id,'name',o.name),
    'report',jsonb_build_object('id',r.id,'author_id',r.author_id,'class_session_id',r.class_session_id,'template_version_id',r.template_version_id,
      'status',r.status,'submitted_at',r.submitted_at,'created_at',r.created_at,'updated_at',r.updated_at,
      'class_sessions',jsonb_build_object('title',s.title,'location',s.location,'start_at',s.start_at,'end_at',s.end_at,'status',s.status,'has_time',s.has_time),
      'profiles',jsonb_build_object('name',p.name),
      'report_answers',coalesce((select jsonb_agg(jsonb_build_object('field_id',a.field_id,'value',a.value)) from public.report_answers a where a.report_id=r.id),'[]'::jsonb),
      'report_attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'field_id',a.field_id,'storage_path',a.storage_path,'original_filename',a.original_filename,'created_at',a.created_at) order by a.created_at,a.id) from public.report_attachments a where a.report_id=r.id),'[]'::jsonb)),
    'fields',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'label',f.label,'field_type',f.field_type,'required',f.required,'sort_order',f.sort_order,'settings',f.settings,'help_text',f.help_text,
      'field_options',coalesce((select jsonb_agg(jsonb_build_object('label',fo.label,'sort_order',fo.sort_order) order by fo.sort_order) from public.field_options fo where fo.field_id=f.id),'[]'::jsonb)) order by f.sort_order) from public.template_fields f where f.template_version_id=r.template_version_id),'[]'::jsonb)) into result
  from public.reports r join public.organizations o on o.id=r.organization_id and o.deleted_at is null
  join public.class_sessions s on s.id=r.class_session_id join public.profiles p on p.id=r.author_id
  where r.organization_id=p_workspace_id and r.id=p_report_id;
  return result;
end $$;
create function public.master_report(p_workspace_id uuid,p_report_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.master_report(p_workspace_id,p_report_id)$$;

-- Signed photo URLs use the caller's authenticated Storage client. Only attached
-- photos in undeleted workspaces are visible; INSERT/UPDATE/DELETE stay unchanged.
create function private.master_can_read_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_service_master() and exists(select 1 from public.report_attachments a
    join public.reports r on r.id=a.report_id and r.organization_id=a.organization_id
    join public.organizations o on o.id=r.organization_id and o.deleted_at is null
    where a.storage_path=p_path)
$$;
create policy report_images_master_read on storage.objects for select to authenticated
using (bucket_id='report-images' and private.master_can_read_photo(name));

revoke all on function private.master_users(text,integer), public.master_users(text,integer),
  private.master_workspaces(text,integer), public.master_workspaces(text,integer),
  private.master_workspace(uuid,text,integer), public.master_workspace(uuid,text,integer),
  private.master_report(uuid,uuid), public.master_report(uuid,uuid), private.master_can_read_photo(text) from public,anon;
grant execute on function private.master_users(text,integer), public.master_users(text,integer),
  private.master_workspaces(text,integer), public.master_workspaces(text,integer),
  private.master_workspace(uuid,text,integer), public.master_workspace(uuid,text,integer),
  private.master_report(uuid,uuid), public.master_report(uuid,uuid), private.master_can_read_photo(text) to authenticated;
