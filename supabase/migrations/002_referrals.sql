create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_code text unique not null,
  referrer_email text,
  referrer_name text,
  clicks integer default 0,
  signups integer default 0,
  created_at timestamptz default now()
);

create table if not exists referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_code text not null references referrals(referrer_code),
  event_type text not null check (event_type in ('click', 'signup', 'subscription')),
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_referrals_code on referrals(referrer_code);
create index if not exists idx_referral_events_code on referral_events(referrer_code);

alter table referrals enable row level security;
alter table referral_events enable row level security;

create policy "Public read referrals" on referrals for select using (true);
create policy "Public insert referrals" on referrals for insert with check (true);
create policy "Public update referrals" on referrals for update using (true);
create policy "Public read referral_events" on referral_events for select using (true);
create policy "Public insert referral_events" on referral_events for insert with check (true);
