-- Per-user saved cryptocurrency watchlists
create table if not exists public.user_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.user_watchlist enable row level security;

drop policy if exists "Users can view their own watchlist" on public.user_watchlist;
create policy "Users can view their own watchlist"
  on public.user_watchlist for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add to their own watchlist" on public.user_watchlist;
create policy "Users can add to their own watchlist"
  on public.user_watchlist for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove from their own watchlist" on public.user_watchlist;
create policy "Users can remove from their own watchlist"
  on public.user_watchlist for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.user_watchlist to authenticated;
