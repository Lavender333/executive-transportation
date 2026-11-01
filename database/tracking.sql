begin;
alter table public.ride_requests add column customer_token_hash text, add column driver_token_hash text,
  add column driver_lat double precision check (driver_lat between -90 and 90),
  add column driver_lng double precision check (driver_lng between -180 and 180),
  add column driver_accuracy double precision check (driver_accuracy >= 0),
  add column location_updated_at timestamptz;
-- Public clients still have no direct table privileges. Tracking tokens are hashed server-side.
-- Reassigning/cancelling a trip revokes the old driver's link and clears the previous location.
create function public.clear_driver_tracking() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.driver_id is distinct from old.driver_id or (new.status in ('cancelled','completed') and new.status is distinct from old.status) then
    new.driver_token_hash = null;
    new.driver_lat = null;
    new.driver_lng = null;
    new.driver_accuracy = null;
    new.location_updated_at = null;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_driver_tracking() from public, anon, authenticated;
create trigger clear_tracking before update on public.ride_requests for each row execute function public.clear_driver_tracking();
create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (to_jsonb(new) - array['updated_at','driver_token_hash','driver_lat','driver_lng','driver_accuracy','location_updated_at']) is distinct from (to_jsonb(old) - array['updated_at','driver_token_hash','driver_lat','driver_lng','driver_accuracy','location_updated_at']) then
    new.updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
commit;
