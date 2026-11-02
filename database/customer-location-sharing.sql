begin;
alter table public.ride_requests
  add column if not exists customer_lat double precision check (customer_lat between -90 and 90),
  add column if not exists customer_lng double precision check (customer_lng between -180 and 180),
  add column if not exists customer_accuracy double precision check (customer_accuracy >= 0),
  add column if not exists customer_location_updated_at timestamptz;
create or replace function public.clear_driver_tracking() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.driver_id is distinct from old.driver_id or (new.status in ('cancelled','completed') and new.status is distinct from old.status) then
    new.driver_token_hash = null;
    new.driver_lat = null;
    new.driver_lng = null;
    new.driver_accuracy = null;
    new.location_updated_at = null;
    new.customer_lat = null;
    new.customer_lng = null;
    new.customer_accuracy = null;
    new.customer_location_updated_at = null;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_driver_tracking() from public, anon, authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (to_jsonb(new) - array['updated_at','driver_token_hash','driver_lat','driver_lng','driver_accuracy','location_updated_at','customer_lat','customer_lng','customer_accuracy','customer_location_updated_at']) is distinct from (to_jsonb(old) - array['updated_at','driver_token_hash','driver_lat','driver_lng','driver_accuracy','location_updated_at','customer_lat','customer_lng','customer_accuracy','customer_location_updated_at']) then
    new.updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
commit;
