-- Enables secure staff-dashboard updates. The existing RLS policies continue to
-- control which signed-in staff accounts can receive request or driver changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.ride_requests';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drivers'
  ) then
    execute 'alter publication supabase_realtime add table public.drivers';
  end if;
end;
$$;
