create table if not exists email_captures (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz default now()
);

alter table email_captures enable row level security;
create policy "Service insert email_captures" on email_captures for insert with check (true);
create policy "Service read email_captures" on email_captures for select using (true);
