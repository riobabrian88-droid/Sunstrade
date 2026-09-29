-- Run this in Supabase SQL Editor after adding profiles.is_suspended.
-- Prevent suspended users from trading even if they call the RPC directly.

CREATE OR REPLACE FUNCTION public.place_order(
  p_symbol text,
  p_side text,
  p_order_type text DEFAULT 'market',
  p_qty numeric DEFAULT 0,
  p_limit_price numeric DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_price numeric;
  v_wallet public.wallets%rowtype;
  v_position public.positions%rowtype;
  v_order_id uuid;
  v_cost numeric;
  v_new_qty numeric;
  v_new_avg numeric;
  v_is_suspended boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  SELECT is_suspended INTO v_is_suspended
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_is_suspended IS TRUE THEN
    RAISE EXCEPTION 'Your account is suspended and cannot place trades';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  IF p_side NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid order side';
  END IF;

  IF p_order_type NOT IN ('market', 'limit') THEN
    RAISE EXCEPTION 'Invalid order type';
  END IF;

  SELECT price INTO v_price
  FROM public.assets
  WHERE symbol = p_symbol;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, cash_balance)
    VALUES (v_user_id, 10000.00)
    RETURNING * INTO v_wallet;
  END IF;

  v_cost := p_qty * v_price;

  IF p_side = 'buy' THEN
    IF v_wallet.cash_balance < v_cost THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    UPDATE public.wallets
    SET cash_balance = cash_balance - v_cost, updated_at = now()
    WHERE user_id = v_user_id;

    SELECT * INTO v_position
    FROM public.positions
    WHERE user_id = v_user_id AND symbol = p_symbol
    FOR UPDATE;

    IF FOUND THEN
      v_new_qty := v_position.qty + p_qty;
      v_new_avg := ((v_position.qty * v_position.avg_price) + v_cost) / v_new_qty;
      UPDATE public.positions
      SET qty = v_new_qty, avg_price = v_new_avg, updated_at = now()
      WHERE id = v_position.id;
    ELSE
      INSERT INTO public.positions (user_id, symbol, qty, avg_price)
      VALUES (v_user_id, p_symbol, p_qty, v_price);
    END IF;
  ELSE
    SELECT * INTO v_position
    FROM public.positions
    WHERE user_id = v_user_id AND symbol = p_symbol
    FOR UPDATE;

    IF NOT FOUND OR v_position.qty < p_qty THEN
      RAISE EXCEPTION 'Insufficient position';
    END IF;

    UPDATE public.wallets
    SET cash_balance = cash_balance + v_cost, updated_at = now()
    WHERE user_id = v_user_id;

    v_new_qty := v_position.qty - p_qty;
    IF v_new_qty = 0 THEN
      DELETE FROM public.positions WHERE id = v_position.id;
    ELSE
      UPDATE public.positions SET qty = v_new_qty, updated_at = now()
      WHERE id = v_position.id;
    END IF;
  END IF;

  INSERT INTO public.orders
    (user_id, symbol, side, order_type, qty, limit_price, status, filled_price, filled_at)
  VALUES
    (v_user_id, p_symbol, p_side, p_order_type, p_qty, p_limit_price, 'filled', v_price, now())
  RETURNING id INTO v_order_id;

  INSERT INTO public.trades (user_id, symbol, side, qty, price)
  VALUES (v_user_id, p_symbol, p_side, p_qty, v_price);

  RETURN jsonb_build_object(
    'success', true, 'order_id', v_order_id, 'symbol', p_symbol,
    'side', p_side, 'quantity', p_qty, 'price', v_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, numeric, numeric)
TO authenticated;
