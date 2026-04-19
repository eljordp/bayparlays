create table if not exists sim_parlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  legs jsonb not null,
  combined_odds text not null,
  combined_decimal numeric not null,
  stake numeric not null default 10,
  payout numeric not null,
  status text default 'pending' check (status in ('pending', 'won', 'lost')),
  profit numeric default 0,
  resolved_at timestamptz
);

create table if not exists sim_bankroll (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric default 1000,
  starting_balance numeric default 1000,
  total_wagered numeric default 0,
  total_won numeric default 0,
  total_lost numeric default 0,
  wins integer default 0,
  losses integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sim_parlays_user on sim_parlays(user_id);
create index if not exists idx_sim_parlays_status on sim_parlays(status);

alter table sim_parlays enable row level security;
alter table sim_bankroll enable row level security;

-- Users can read/write their own sim data
create policy "Users own sim_parlays" on sim_parlays for all using (auth.uid() = user_id);
create policy "Users own sim_bankroll" on sim_bankroll for all using (auth.uid() = user_id);
-- Service can do everything
create policy "Service sim_parlays" on sim_parlays for all using (true);
create policy "Service sim_bankroll" on sim_bankroll for all using (true);
