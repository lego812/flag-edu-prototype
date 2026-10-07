-- Export demo/history maintenance also creates and removes jobs. The cleanup
-- cron migration intentionally needed only SELECT/UPDATE, while the explicit
-- demo reset requires full server-side DML.
grant select, insert, update, delete on table public.export_jobs to service_role;
