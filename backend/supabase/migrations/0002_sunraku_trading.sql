-- Sunraku Trade trading database
-- Run after the profiles/authentication migration.

create extension if not exists pgcrypto;

-- =========================================================
-- ASSETS
-- =========================================================

create table if not exists public.assets (
  symbol text primary key,
  name text not null,
  price numeric(20,8) not null default 0,
  prev_close numeric(20,8) not null default 0,
  volatility numeric(10,4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Anyone can view assets"
  on public.assets
  for select
  using (true);

-- =========================================================
-- WALLETS
-- =========================================================

create table if not exists public.wallets (
  user_id uuid references auth.users(id) on delete cascade primary key,
  cash_balance numeric(20,2) not null default 10000.00,
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

create policy "Users can view own wallet"
  on public.wallets
  for select
  using (auth.uid() = user_id);

-- =========================================================
-- POSITIONS
-- =========================================================

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text references public.assets(symbol) not null,
  qty numeric(20,8) not null default 0,
  avg_price numeric(20,8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, symbol)
);

alter table public.positions enable row level security;

create policy "Users can view own positions"
  on public.positions
  for select
  using (auth.uid() = user_id);

-- =========================================================
-- ORDERS
-- =========================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text references public.assets(symbol) not null,
  side text not null check (side in ('buy', 'sell')),
  order_type text not null default 'market'
    check (order_type in ('market', 'limit')),
  qty numeric(20,8) not null check (qty > 0),
  limit_price numeric(20,8),
  status text not null default 'pending'
    check (status in ('pending', 'filled', 'cancelled', 'rejected')),
  filled_price numeric(20,8),
  created_at timestamptz not null default now(),
  filled_at timestamptz
);

alter table public.orders enable row level security;

create policy "Users can view own orders"
  on public.orders
  for select
  using (auth.uid() = user_id);

-- =========================================================
-- TRADES
-- =========================================================

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text references public.assets(symbol) not null,
  side text not null check (side in ('buy', 'sell')),
  qty numeric(20,8) not null check (qty > 0),
  price numeric(20,8) not null,
  created_at timestamptz not null default now()
);

alter table public.trades enable row level security;

create policy "Users can view own trades"
  on public.trades
  for select
  using (auth.uid() = user_id);

-- =========================================================
-- INITIAL MARKET ASSETS
-- =========================================================

insert into public.assets
  (symbol, name, price, prev_close, volatility)
values
  ('BTC/USD', 'Bitcoin', 65000, 64500, 0.035),
  ('ETH/USD', 'Ethereum', 3500, 3450, 0.040),
  ('XAU/USD', 'Gold', 2650, 2640, 0.010),
  ('EUR/USD', 'Euro / US Dollar', 1.0800, 1.0780, 0.006),
  ('USD/JPY', 'US Dollar / Japanese Yen', 150.00, 149.50, 0.008)
on conflict (symbol) do nothing;

-- =========================================================
-- CREATE WALLET FOR NEW USERS
-- =========================================================

create or replace function public.handle_new_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, cash_balance)
  values (new.id, 10000.00)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;

create trigger on_auth_user_created_wallet
after insert on auth.users
for each row
execute procedure public.handle_new_user_wallet();

-- =========================================================
-- PLACE MARKET ORDER
-- =========================================================

create or replace function public.place_order(
  p_symbol text,
  p_side text,
  p_order_type text default 'market',
  p_qty numeric default 0,
  p_limit_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_price numeric;
  v_wallet public.wallets%rowtype;
  v_position public.positions%rowtype;
  v_order_id uuid;
  v_cost numeric;
  v_new_qty numeric;
  v_new_avg numeric;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_side not in ('buy', 'sell') then
    raise exception 'Invalid order side';
  end if;

  if p_order_type not in ('market', 'limit') then
    raise exception 'Invalid order type';
  end if;

  select price
  into v_price
  from public.assets
  where symbol = p_symbol;

  if v_price is null then
    raise exception 'Asset not found';
  end if;

  select *
  into v_wallet
  from public.wallets
  where user_id = v_user_id
  for update;

  if not found then
    insert into public.wallets (user_id, cash_balance)
    values (v_user_id, 10000.00)
    returning * into v_wallet;
  end if;

  v_cost := p_qty * v_price;

  if p_side = 'buy' then

    if v_wallet.cash_balance < v_cost then
      raise exception 'Insufficient balance';
    end if;

    update public.wallets
    set cash_balance = cash_balance - v_cost,
        updated_at = now()
    where user_id = v_user_id;

    select *
    into v_position
    from public.positions
    where user_id = v_user_id
      and symbol = p_symbol
    for update;

    if found then
      v_new_qty := v_position.qty + p_qty;

      v_new_avg :=
        ((v_position.qty * v_position.avg_price) + v_cost)
        / v_new_qty;

      update public.positions
      set qty = v_new_qty,
          avg_price = v_new_avg,
          updated_at = now()
      where id = v_position.id;
    else
      insert into public.positions
        (user_id, symbol, qty, avg_price)
      values
        (v_user_id, p_symbol, p_qty, v_price);
    end if;

  else

    select *
    into v_position
    from public.positions
    where user_id = v_user_id
      and symbol = p_symbol
    for update;

    if not found or v_position.qty < p_qty then
      raise exception 'Insufficient position';
    end if;

    update public.wallets
    set cash_balance = cash_balance + v_cost,
        updated_at = now()
    where user_id = v_user_id;

    v_new_qty := v_position.qty - p_qty;

    if v_new_qty = 0 then
      delete from public.positions
      where id = v_position.id;
    else
      update public.positions
      set qty = v_new_qty,
          updated_at = now()
      where id = v_position.id;
    end if;

  end if;

  insert into public.orders
    (
      user_id,
      symbol,
      side,
      order_type,
      qty,
      limit_price,
      status,
      filled_price,
      filled_at
    )
  values
    (
      v_user_id,
      p_symbol,
      p_side,
      p_order_type,
      p_qty,
      p_limit_price,
      'filled',
      v_price,
      now()
    )
  returning id into v_order_id;

  insert into public.trades
    (
      user_id,
      symbol,
      side,
      qty,
      price
    )
  values
    (
      v_user_id,
      p_symbol,
      p_side,
      p_qty,
      v_price
    );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'symbol', p_symbol,
    'side', p_side,
    'quantity', p_qty,
    'price', v_price
  );
end;
$$;

-- Allow logged-in users to place orders through the RPC.
grant execute on function public.place_order(
  text,
  text,
  text,
  numeric,
  numeric
) to authenticated;
