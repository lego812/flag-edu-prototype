-- Account-scoped private inquiries: no workspace administrator may read a peer's inquiry.
create table public.support_inquiries (
  id uuid primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_inquiries_author_created_idx on public.support_inquiries(author_id,created_at desc,id);
create index support_inquiries_created_idx on public.support_inquiries(created_at desc,id);
alter table public.support_inquiries enable row level security;
revoke all on public.support_inquiries from public,anon,authenticated;
grant select on public.support_inquiries to authenticated;
grant all on public.support_inquiries to service_role;

create function private.can_use_support()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_signup_consent() and exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null
  )
$$;
revoke all on function private.can_use_support() from public,anon;
grant execute on function private.can_use_support() to authenticated;
create policy support_inquiries_read on public.support_inquiries for select to authenticated
using ((select private.can_use_support()) and (author_id=(select auth.uid()) or (select private.is_service_master())));

create function private.list_support_inquiries(p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_master boolean; result jsonb;
begin
  if not private.can_use_support() then raise exception 'Account required' using errcode='42501'; end if;
  if p_page is null or p_page not between 1 and 100000 then raise exception 'Invalid page' using errcode='22023'; end if;
  v_master := private.is_service_master();
  with visible as (
    select i.id,i.author_id,i.title,i.created_at,i.updated_at from public.support_inquiries i
    where v_master or i.author_id=auth.uid()
  ), paged as (select * from visible order by created_at desc,id limit 20 offset (p_page-1)*20)
  select jsonb_build_object('total',(select count(*) from visible),'items',coalesce((
    select jsonb_agg(to_jsonb(i)||jsonb_build_object('author_name',p.name,'author_email',case when v_master then u.email else null end) order by i.created_at desc,i.id)
    from paged i join public.profiles p on p.id=i.author_id join auth.users u on u.id=i.author_id),'[]'::jsonb)) into result;
  return result;
end $$;
create function public.list_support_inquiries(p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.list_support_inquiries(p_page)$$;

create function private.get_support_inquiry(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; v_master boolean;
begin
  if not private.can_use_support() then raise exception 'Account required' using errcode='42501'; end if;
  v_master := private.is_service_master();
  select jsonb_build_object('id',i.id,'author_id',i.author_id,'title',i.title,'body',i.body,
    'created_at',i.created_at,'updated_at',i.updated_at,'author_name',p.name,'author_email',case when v_master then u.email else null end)
  into result from public.support_inquiries i join public.profiles p on p.id=i.author_id join auth.users u on u.id=i.author_id
  where i.id=p_id and (v_master or i.author_id=auth.uid());
  return result;
end $$;
create function public.get_support_inquiry(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$select private.get_support_inquiry(p_id)$$;

-- Only the author can write; master is read-only, including direct RPC calls.
-- The caller supplies one stable ID for retries and a version for edits.
create function private.save_support_inquiry(p_id uuid,p_title text,p_body text,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_title text:=btrim(p_title,E' \t\r\n'); v_body text:=btrim(p_body,E' \t\r\n'); v_existing public.support_inquiries;
begin
  if not private.can_use_support() or private.is_service_master() then raise exception 'Author account required' using errcode='42501'; end if;
  if p_id is null or v_title is null or char_length(v_title) not between 1 and 100 or v_body is null or char_length(v_body) not between 1 and 5000 then
    raise exception 'Invalid inquiry' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    insert into public.support_inquiries(id,author_id,title,body) values(p_id,auth.uid(),v_title,v_body) on conflict(id) do nothing;
    select * into v_existing from public.support_inquiries where id=p_id;
    if v_existing.author_id is distinct from auth.uid() then raise exception 'Inquiry unavailable' using errcode='42501'; end if;
    if v_existing.title is distinct from v_title or v_existing.body is distinct from v_body then
      raise exception 'Inquiry already saved; reload' using errcode='40001'; end if;
  else
    select * into v_existing from public.support_inquiries where id=p_id and author_id=auth.uid() for update;
    if not found then raise exception 'Inquiry unavailable' using errcode='42501'; end if;
    if v_existing.updated_at is distinct from p_expected_updated_at then raise exception 'Inquiry changed; reload' using errcode='40001'; end if;
    update public.support_inquiries set title=v_title,body=v_body,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_id;
  end if;
  return p_id;
end $$;
create function public.save_support_inquiry(p_id uuid,p_title text,p_body text,p_expected_updated_at timestamptz default null)
returns uuid language sql volatile security invoker set search_path = '' as $$select private.save_support_inquiry(p_id,p_title,p_body,p_expected_updated_at)$$;

revoke all on function private.list_support_inquiries(integer),public.list_support_inquiries(integer),
  private.get_support_inquiry(uuid),public.get_support_inquiry(uuid),
  private.save_support_inquiry(uuid,text,text,timestamptz),public.save_support_inquiry(uuid,text,text,timestamptz) from public,anon;
grant execute on function private.list_support_inquiries(integer),public.list_support_inquiries(integer),
  private.get_support_inquiry(uuid),public.get_support_inquiry(uuid),
  private.save_support_inquiry(uuid,text,text,timestamptz),public.save_support_inquiry(uuid,text,text,timestamptz) to authenticated;
