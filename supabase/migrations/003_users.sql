create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  subscription_status text default 'none' check (subscription_status in ('none', 'active', 'trialing', 'canceled', 'past_due')),
  subscription_tier text default 'free' check (subscription_tier in ('free', 'sharp', 'vip', 'admin')),
  stripe_customer_id text,
  referral_code text,
  referred_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_users_email on users(email);
create index if not exists idx_users_stripe on users(stripe_customer_id);

alter table users enable row level security;

-- Users can read their own data
create policy "Users read own" on users for select using (auth.uid() = id);
-- Service can do everything
create policy "Service all" on users for all using (true);

-- Auto-create user row on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
