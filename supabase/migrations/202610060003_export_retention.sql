update public.export_jobs
set expires_at = created_at + interval '7 days'
where expires_at is null;

alter table public.export_jobs
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;
