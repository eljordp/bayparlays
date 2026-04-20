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
