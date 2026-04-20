-- Update trigger: new signups get 7-day Sharp trial automatically (no card required)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, subscription_status, subscription_tier)
  values (new.id, new.email, 'trialing', 'sharp');
  return new;
end;
$$ language plpgsql security definer;

-- Add trial_ends_at column
alter table users add column if not exists trial_ends_at timestamptz;

-- Set trial end for existing users who don't have one
update users set trial_ends_at = created_at + interval '7 days' where trial_ends_at is null;
