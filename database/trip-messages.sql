begin;
create table if not exists public.trip_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','driver')),
  message_type text not null default 'message' check (message_type in ('message','call_request')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists trip_messages_ride_created_idx on public.trip_messages(ride_id,created_at);
alter table public.trip_messages enable row level security;
revoke all on public.trip_messages from anon, authenticated;
commit;
