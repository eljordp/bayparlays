-- Add 'owner' as a privileged tier above 'admin'.
-- Owner is the project owner (JP). Admins are trusted operators (his boys).
-- Owner can do everything admin can; admin cannot promote anyone to owner.

alter table users drop constraint if exists users_subscription_tier_check;

alter table users add constraint users_subscription_tier_check
  check (subscription_tier in ('free', 'sharp', 'vip', 'admin', 'owner'));

-- Enforce: at most one owner exists.
create unique index if not exists users_only_one_owner
  on users ((subscription_tier))
  where subscription_tier = 'owner';

-- Seed: JP = owner, boys = admin. Idempotent — safe to re-run.
update users
  set subscription_tier = 'owner',
      subscription_status = 'active',
      updated_at = now()
  where email = 'eljordp@gmail.com';

update users
  set subscription_tier = 'admin',
      subscription_status = 'active',
      updated_at = now()
  where email in (
    'djacinto41@gmail.com',
    'larkestay1@gmail.com',
    'manzavisuals@gmail.com'
  );
