-- ─── Line History ───────────────────────────────────────────────────────────
-- Snapshots of current best odds for each game/market/team, captured daily.
-- Used for line movement analysis — sharp money moves lines early, public
-- money moves them late. Divergence between the two is signal.

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

create policy "Public read line_history"
  on line_history for select
  using (true);

create policy "Service insert line_history"
  on line_history for insert
  with check (true);
