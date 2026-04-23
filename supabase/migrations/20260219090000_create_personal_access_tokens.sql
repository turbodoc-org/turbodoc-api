create table if not exists personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_last4 text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists personal_access_tokens_user_id_idx
  on personal_access_tokens(user_id);

alter table personal_access_tokens enable row level security;

create policy "pat_select_own"
  on personal_access_tokens
  for select
  using (auth.uid() = user_id);

create policy "pat_insert_own"
  on personal_access_tokens
  for insert
  with check (auth.uid() = user_id);

create policy "pat_update_own"
  on personal_access_tokens
  for update
  using (auth.uid() = user_id);
