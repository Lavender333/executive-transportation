-- Executive Transportation: staff-only dispatch data.
-- Apply once to a dedicated Supabase project. No customer records are publicly readable.
begin;
create table public.staff_access (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.staff_access enable row level security;
revoke all on public.staff_access from anon, authenticated;
grant select on public.staff_access to authenticated;
create policy "Staff can verify their own membership" on public.staff_access for select to authenticated
  using (email = lower((select auth.jwt())->>'email') and coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  phone text not null check (length(trim(phone)) between 7 and 40),
  vehicle text not null check (length(trim(vehicle)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.drivers enable row level security;
revoke all on public.drivers from anon, authenticated;
grant select, insert on public.drivers to authenticated;
grant update(name,phone,vehicle,active) on public.drivers to authenticated;
create policy "Staff read drivers" on public.drivers for select to authenticated using (exists(select 1 from public.staff_access));
create policy "Staff add drivers" on public.drivers for insert to authenticated with check (exists(select 1 from public.staff_access));
create policy "Staff update drivers" on public.drivers for update to authenticated using (exists(select 1 from public.staff_access)) with check (exists(select 1 from public.staff_access));

create table public.ride_requests (
  id uuid primary key,
  customer_name text not null check (length(trim(customer_name)) between 1 and 100),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (length(trim(phone)) between 7 and 40),
  service text not null check (service in ('Airport transfer','Corporate travel','VIP / event','Point-to-point','Hourly chauffeur','Group coordination')),
  pickup_date date not null,
  pickup_time time not null,
  pickup_timezone text not null check (length(pickup_timezone) between 1 and 100),
  passengers integer not null check (passengers between 1 and 30),
  pickup text not null check (length(trim(pickup)) between 1 and 150),
  destination text not null check (length(trim(destination)) between 1 and 150),
  notes text not null default '' check (length(notes) <= 600),
  status text not null default 'pending' check (status in ('pending','confirmed','assigned','completed','cancelled')),
  driver_id uuid references public.drivers(id),
  staff_notes text not null default '' check (length(staff_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('assigned','completed') or driver_id is not null),
  check (status not in ('pending','confirmed') or driver_id is null)
);
create index ride_requests_created_at_idx on public.ride_requests(created_at desc);
create index ride_requests_status_created_idx on public.ride_requests(status, created_at desc);
create index ride_requests_driver_idx on public.ride_requests(driver_id);
alter table public.ride_requests enable row level security;
revoke all on public.ride_requests from anon, authenticated;
grant select on public.ride_requests to authenticated;
grant update(status,driver_id,staff_notes) on public.ride_requests to authenticated;
create policy "Staff read requests" on public.ride_requests for select to authenticated using (exists(select 1 from public.staff_access));
create policy "Staff manage requests" on public.ride_requests for update to authenticated using (exists(select 1 from public.staff_access)) with check (exists(select 1 from public.staff_access));

create table public.request_limits (
  fingerprint text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from anon, authenticated;
-- Only the Edge Function's server credential can write requests or use the rate limit.
grant all on public.staff_access, public.drivers, public.ride_requests, public.request_limits to service_role;
create function public.consume_request_limit(key_hash text) returns boolean language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  insert into public.request_limits as limits(fingerprint) values(key_hash)
  on conflict(fingerprint) do update set
    attempts = case when limits.window_start < now() - interval '1 hour' then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start < now() - interval '1 hour' then now() else limits.window_start end
  returning attempts into total;
  delete from public.request_limits where window_start < now() - interval '2 days';
  return total <= 10;
end;
$$;
revoke all on function public.consume_request_limit(text) from public, anon, authenticated;
grant execute on function public.consume_request_limit(text) to service_role;

create function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create function public.validate_driver_assignment() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id and not exists (
    select 1 from public.drivers where id = new.driver_id and active = true
  ) then
    raise exception 'Choose an active driver.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_driver_assignment() from public, anon, authenticated;
create trigger validate_driver before update on public.ride_requests for each row execute function public.validate_driver_assignment();
create trigger update_ride_timestamp before update on public.ride_requests for each row execute function public.touch_updated_at();
create trigger update_driver_timestamp before update on public.drivers for each row execute function public.touch_updated_at();

-- Add the first administrator email through the database console after deployment.
commit;
