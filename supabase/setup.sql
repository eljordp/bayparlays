-- ──────────────────────────────────────────────────────────────────────────
-- BayParlays — Fresh Supabase Project Setup
-- ──────────────────────────────────────────────────────────────────────────
-- Bundles every migration (001 → 014) except 011 (the v1 launch reset, which
-- is a TRUNCATE that's pointless on an empty DB).
--
-- Use: paste the entire file into Supabase Dashboard → SQL Editor → Run.
-- Should complete in 1-2 seconds.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses IF NOT
-- EXISTS, every INSERT uses ON CONFLICT — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────

-- ─── 001: parlays + daily_stats ───────────────────────────────────────────
create table if not exists parlays (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  legs jsonb not null,
  combined_odds text not null,
  combined_decimal numeric not null,
  ev numeric not null,
  ev_percent numeric not null,
  confidence integer not null,
  payout numeric not null,
  stake numeric default 100,
  status text default 'pending' check (status in ('pending', 'won', 'lost', 'push', 'partial')),
  result_checked_at timestamptz,
  legs_won integer default 0,
  legs_lost integer default 0,
  legs_total integer not null,
  sports text[] not null,
  profit numeric default 0
);
create index if not exists idx_parlays_status on parlays(status);
create index if not exists idx_parlays_created on parlays(created_at desc);

create table if not exists daily_stats (
  date date primary key,
  parlays_generated integer default 0,
  parlays_won integer default 0,
  parlays_lost integer default 0,
  total_staked numeric default 0,
  total_returned numeric default 0,
  profit numeric default 0,
  win_rate numeric default 0,
  roi numeric default 0,
  updated_at timestamptz default now()
);

alter table parlays enable row level security;
alter table daily_stats enable row level security;
create policy "Public read parlays" on parlays for select using (true);
create policy "Public read daily_stats" on daily_stats for select using (true);
create policy "Service insert parlays" on parlays for insert with check (true);
create policy "Service update parlays" on parlays for update using (true);
create policy "Service insert daily_stats" on daily_stats for insert with check (true);
create policy "Service update daily_stats" on daily_stats for update using (true);

-- ─── 002: referrals ───────────────────────────────────────────────────────
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

-- ─── 003: users ───────────────────────────────────────────────────────────
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
create policy "Users read own" on users for select using (auth.uid() = id);
create policy "Service all" on users for all using (true);

-- ─── 004: sim_parlays + sim_bankroll ──────────────────────────────────────
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
create policy "Users own sim_parlays" on sim_parlays for all using (auth.uid() = user_id);
create policy "Users own sim_bankroll" on sim_bankroll for all using (auth.uid() = user_id);
create policy "Service sim_parlays" on sim_parlays for all using (true);
create policy "Service sim_bankroll" on sim_bankroll for all using (true);

-- ─── 005: email_captures ──────────────────────────────────────────────────
create table if not exists email_captures (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz default now()
);
alter table email_captures enable row level security;
create policy "Service insert email_captures" on email_captures for insert with check (true);
create policy "Service read email_captures" on email_captures for select using (true);

-- ─── 006: achievements ────────────────────────────────────────────────────
create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  unlocked_at timestamptz default now(),
  unique(user_id, badge_id)
);
create index if not exists idx_achievements_user on achievements(user_id);
alter table achievements enable row level security;
create policy "Users read own achievements" on achievements for select using (auth.uid() = user_id);
create policy "Service all achievements" on achievements for all using (true);

-- ─── 007: free trial signup hook ──────────────────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, subscription_status, subscription_tier)
  values (new.id, new.email, 'trialing', 'sharp');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table users add column if not exists trial_ends_at timestamptz;
update users set trial_ends_at = created_at + interval '7 days' where trial_ends_at is null;

-- ─── 008: line_history ────────────────────────────────────────────────────
create table if not exists line_history (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  sport text not null,
  market text not null,
  team text not null,
  point numeric,
  best_odds integer not null,
  best_book text,
  avg_odds integer,
  captured_at timestamptz default now()
);
create index if not exists idx_line_history_game on line_history(game_id);
create index if not exists idx_line_history_captured on line_history(captured_at desc);
create index if not exists idx_line_history_game_market_team on line_history(game_id, market, team);
alter table line_history enable row level security;
create policy "Public read line_history" on line_history for select using (true);
create policy "Service insert line_history" on line_history for insert with check (true);

-- ─── 009: sim_parlays.category ────────────────────────────────────────────
ALTER TABLE sim_parlays ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS sim_parlays_category_idx ON sim_parlays(category);

-- ─── 010: parlays.category ────────────────────────────────────────────────
ALTER TABLE parlays ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS parlays_category_idx ON parlays(category);
CREATE INDEX IF NOT EXISTS parlays_confidence_idx ON parlays(confidence);

-- ─── 012: CLV + weather + odds quota ──────────────────────────────────────
ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS opening_lines jsonb,
  ADD COLUMN IF NOT EXISTS closing_lines jsonb,
  ADD COLUMN IF NOT EXISTS clv_percent numeric;
CREATE INDEX IF NOT EXISTS idx_parlays_clv ON parlays(clv_percent);

CREATE TABLE IF NOT EXISTS weather_cache (
  game_id text primary key,
  stadium text,
  temperature_f numeric,
  wind_mph numeric,
  wind_deg numeric,
  precipitation_mm numeric,
  fetched_at timestamptz default now()
);
CREATE INDEX IF NOT EXISTS idx_weather_cache_fetched ON weather_cache(fetched_at desc);
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read weather_cache" ON weather_cache FOR SELECT USING (true);
CREATE POLICY "Service write weather_cache" ON weather_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update weather_cache" ON weather_cache FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS odds_api_quota (
  id int primary key default 1,
  used int default 0,
  remaining int default 500,
  last_request_at timestamptz default now(),
  CHECK (id = 1)
);
INSERT INTO odds_api_quota (id, used, remaining) VALUES (1, 0, 500) ON CONFLICT (id) DO NOTHING;
ALTER TABLE odds_api_quota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read quota" ON odds_api_quota FOR SELECT USING (true);
CREATE POLICY "Service write quota" ON odds_api_quota FOR UPDATE USING (true);

-- ─── 013: edge_picks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edge_picks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  sport text not null,
  game_id text not null,
  game text not null,
  market text not null,
  pick text not null,
  commence_time timestamptz not null,
  odds integer not null,
  decimal_odds numeric not null,
  book text not null,
  book_count integer,
  implied_prob numeric not null,
  fair_prob numeric,
  our_prob numeric,
  ev_vs_fair numeric,
  sharp_edge boolean default false,
  scored boolean default false,
  status text default 'pending' check (status in ('pending', 'won', 'lost', 'push')),
  closing_odds integer,
  clv_percent numeric,
  profit numeric default 0,
  resolved_at timestamptz,
  dedupe_key text generated always as (
    game_id || '|' || market || '|' || pick || '|' ||
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
  ) stored,
  UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_edge_picks_status ON edge_picks(status);
CREATE INDEX IF NOT EXISTS idx_edge_picks_created ON edge_picks(created_at desc);
CREATE INDEX IF NOT EXISTS idx_edge_picks_commence ON edge_picks(commence_time);
CREATE INDEX IF NOT EXISTS idx_edge_picks_sport ON edge_picks(sport);
CREATE INDEX IF NOT EXISTS idx_edge_picks_ev ON edge_picks(ev_vs_fair desc);
ALTER TABLE edge_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read edge_picks" ON edge_picks FOR SELECT USING (true);
CREATE POLICY "Service insert edge_picks" ON edge_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update edge_picks" ON edge_picks FOR UPDATE USING (true);

-- ─── 014: research_scans + research_parlays ──────────────────────────────
CREATE TABLE IF NOT EXISTS research_scans (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz default now(),
  sports text[] not null,
  legs_in_pool int not null,
  candidates_scanned int not null,
  positive_ev_count int not null,
  sharp_ev_count int not null,
  top_ev_percent numeric,
  median_ev_percent numeric,
  duration_ms int
);
CREATE INDEX IF NOT EXISTS idx_research_scans_at ON research_scans(scanned_at desc);

CREATE TABLE IF NOT EXISTS research_parlays (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references research_scans(id) on delete cascade,
  scanned_at timestamptz default now(),
  legs jsonb not null,
  leg_count int not null,
  combined_decimal numeric not null,
  combined_prob numeric not null,
  ev_percent numeric not null,
  sharp_legs_count int not null,
  sports text[] not null,
  status text default 'pending' check (status in ('pending', 'won', 'lost', 'push')),
  resolved_at timestamptz,
  legs_won int default 0,
  legs_lost int default 0
);
CREATE INDEX IF NOT EXISTS idx_research_parlays_scan ON research_parlays(scan_id);
CREATE INDEX IF NOT EXISTS idx_research_parlays_at ON research_parlays(scanned_at desc);
CREATE INDEX IF NOT EXISTS idx_research_parlays_ev ON research_parlays(ev_percent desc);
CREATE INDEX IF NOT EXISTS idx_research_parlays_status ON research_parlays(status);
ALTER TABLE research_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_parlays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read research_scans" ON research_scans FOR SELECT USING (true);
CREATE POLICY "Public read research_parlays" ON research_parlays FOR SELECT USING (true);
CREATE POLICY "Service write research_scans" ON research_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write research_parlays" ON research_parlays FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update research_parlays" ON research_parlays FOR UPDATE USING (true);
