-- SunStrade internal paper-trading order book foundation.
-- Run this in Supabase SQL Editor after the existing trading schema.
-- This creates separate tables and does not change the current place_order flow.

CREATE TABLE IF NOT EXISTS public.internal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL REFERENCES public.assets(symbol),
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type text NOT NULL DEFAULT 'limit' CHECK (order_type = 'limit'),
  price numeric(20,8) NOT NULL CHECK (price > 0),
  quantity numeric(20,8) NOT NULL CHECK (quantity > 0),
  remaining_quantity numeric(20,8) NOT NULL CHECK (remaining_quantity >= 0),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (remaining_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS internal_orders_book_idx
  ON public.internal_orders (symbol, side, price, created_at)
  WHERE status IN ('open', 'partially_filled');

CREATE INDEX IF NOT EXISTS internal_orders_user_idx
  ON public.internal_orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.internal_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL REFERENCES public.assets(symbol),
  buy_order_id uuid NOT NULL REFERENCES public.internal_orders(id),
  sell_order_id uuid NOT NULL REFERENCES public.internal_orders(id),
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id),
  seller_user_id uuid NOT NULL REFERENCES auth.users(id),
  price numeric(20,8) NOT NULL CHECK (price > 0),
  quantity numeric(20,8) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (buy_order_id <> sell_order_id),
  CHECK (buyer_user_id <> seller_user_id)
);

CREATE INDEX IF NOT EXISTS internal_trades_symbol_time_idx
  ON public.internal_trades (symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_trades_buyer_idx
  ON public.internal_trades (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_trades_seller_idx
  ON public.internal_trades (seller_user_id, created_at DESC);

ALTER TABLE public.internal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own internal orders" ON public.internal_orders;
CREATE POLICY "Users can view own internal orders"
  ON public.internal_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own internal trades" ON public.internal_trades;
CREATE POLICY "Users can view own internal trades"
  ON public.internal_trades FOR SELECT
  TO authenticated
  USING (auth.uid() = buyer_user_id OR auth.uid() = seller_user_id);

-- Writes will be performed only by SECURITY DEFINER RPCs added in the
-- matching-engine migration. Do not grant direct INSERT/UPDATE/DELETE access.
REVOKE INSERT, UPDATE, DELETE ON public.internal_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.internal_trades FROM anon, authenticated;
GRANT SELECT ON public.internal_orders, public.internal_trades TO authenticated;
