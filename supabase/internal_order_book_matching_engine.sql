-- SunStrade internal paper-trading matching engine (stage 2).
-- Run only after internal_order_book_schema.sql has been applied.
-- This is a simulated internal market; it does not connect to an exchange.

CREATE OR REPLACE FUNCTION public.place_internal_limit_order(
  p_symbol text,
  p_side text,
  p_price numeric,
  p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_suspended boolean;
  v_wallet public.wallets%rowtype;
  v_position public.positions%rowtype;
  v_order_id uuid;
  v_remaining numeric(20,8);
  v_fill numeric(20,8);
  v_trade_price numeric(20,8);
  v_candidate public.internal_orders%rowtype;
  v_new_qty numeric;
  v_new_avg numeric;
  v_cost numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'You must be logged in'; END IF;
  IF p_side NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid order side'; END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Price and quantity must be greater than zero';
  END IF;

  -- Serialize all matching for a symbol. The asset row is also used to
  -- ensure the symbol exists before any funds or positions are reserved.
  PERFORM 1 FROM public.assets WHERE symbol = p_symbol FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;

  SELECT is_suspended INTO v_suspended
  FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_suspended IS TRUE THEN RAISE EXCEPTION 'Your account is suspended and cannot trade'; END IF;

  v_remaining := p_quantity;

  IF p_side = 'buy' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    v_cost := p_price * p_quantity;
    IF v_wallet.cash_balance < v_cost THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
    UPDATE public.wallets
      SET cash_balance = cash_balance - v_cost, updated_at = now()
      WHERE user_id = v_user_id;
  ELSE
    SELECT * INTO v_position FROM public.positions
      WHERE user_id = v_user_id AND symbol = p_symbol FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient position'; END IF;
    IF v_position.qty - COALESCE((
      SELECT sum(remaining_quantity) FROM public.internal_orders
      WHERE user_id = v_user_id AND symbol = p_symbol AND side = 'sell'
        AND status IN ('open','partially_filled')
    ),0) < p_quantity THEN
      RAISE EXCEPTION 'Insufficient unreserved position';
    END IF;
  END IF;

  INSERT INTO public.internal_orders
    (user_id,symbol,side,price,quantity,remaining_quantity,status)
  VALUES (v_user_id,p_symbol,p_side,p_price,p_quantity,p_quantity,'open')
  RETURNING id INTO v_order_id;

  -- Price-time priority: best opposing price first, then oldest order.
  -- A trade executes at the resting order's price.
  FOR v_candidate IN
    SELECT * FROM public.internal_orders
    WHERE symbol = p_symbol
      AND side = CASE WHEN p_side = 'buy' THEN 'sell' ELSE 'buy' END
      AND status IN ('open','partially_filled')
      AND remaining_quantity > 0
      AND (user_id <> v_user_id)
      AND CASE
        WHEN p_side = 'buy' THEN price <= p_price
        ELSE price >= p_price
      END
    ORDER BY
      CASE WHEN p_side = 'buy' THEN price END ASC,
      CASE WHEN p_side = 'sell' THEN price END DESC,
      created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_fill := LEAST(v_remaining, v_candidate.remaining_quantity);
    v_trade_price := v_candidate.price;

    IF p_side = 'buy' THEN
      -- The buyer reserved at its limit. Charge execution price and return
      -- the price improvement; the seller receives the execution proceeds.
      UPDATE public.wallets
        SET cash_balance = cash_balance + ((p_price - v_trade_price) * v_fill),
            updated_at = now()
        WHERE user_id = v_user_id;

      SELECT * INTO v_wallet FROM public.wallets
        WHERE user_id = v_candidate.user_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Seller wallet not found'; END IF;
      UPDATE public.wallets
        SET cash_balance = cash_balance + (v_trade_price * v_fill),
            updated_at = now()
        WHERE user_id = v_candidate.user_id;

      SELECT * INTO v_position FROM public.positions
        WHERE user_id = v_user_id AND symbol = p_symbol FOR UPDATE;
      IF FOUND THEN
        v_new_qty := v_position.qty + v_fill;
        v_new_avg := ((v_position.qty * v_position.avg_price) + (v_trade_price * v_fill)) / v_new_qty;
        UPDATE public.positions SET qty=v_new_qty, avg_price=v_new_avg, updated_at=now()
          WHERE id=v_position.id;
      ELSE
        INSERT INTO public.positions(user_id,symbol,qty,avg_price)
        VALUES(v_user_id,p_symbol,v_fill,v_trade_price);
      END IF;

      SELECT * INTO v_position FROM public.positions
        WHERE user_id = v_candidate.user_id AND symbol = p_symbol FOR UPDATE;
      IF NOT FOUND OR v_position.qty < v_fill THEN
        RAISE EXCEPTION 'Seller position changed; order cannot be settled';
      END IF;
      IF v_position.qty = v_fill THEN
        DELETE FROM public.positions WHERE id=v_position.id;
      ELSE
        UPDATE public.positions SET qty=qty-v_fill, updated_at=now() WHERE id=v_position.id;
      END IF;

      INSERT INTO public.internal_trades
        (symbol,buy_order_id,sell_order_id,buyer_user_id,seller_user_id,price,quantity)
      VALUES(p_symbol,v_order_id,v_candidate.id,v_user_id,v_candidate.user_id,v_trade_price,v_fill);
    ELSE
      -- Incoming seller: resting buyer's reserved cash pays the seller.
      UPDATE public.wallets
        SET cash_balance = cash_balance + (v_trade_price * v_fill),
            updated_at = now()
        WHERE user_id = v_user_id;

      SELECT * INTO v_wallet FROM public.wallets
        WHERE user_id = v_candidate.user_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Buyer wallet not found'; END IF;
      UPDATE public.wallets
        SET cash_balance = cash_balance + ((v_candidate.price - v_trade_price) * v_fill),
            updated_at = now()
        WHERE user_id = v_candidate.user_id;

      SELECT * INTO v_position FROM public.positions
        WHERE user_id = v_user_id AND symbol = p_symbol FOR UPDATE;
      IF NOT FOUND OR v_position.qty < v_fill THEN
        RAISE EXCEPTION 'Seller position changed; order cannot be settled';
      END IF;
      IF v_position.qty = v_fill THEN
        DELETE FROM public.positions WHERE id=v_position.id;
      ELSE
        UPDATE public.positions SET qty=qty-v_fill, updated_at=now() WHERE id=v_position.id;
      END IF;

      SELECT * INTO v_position FROM public.positions
        WHERE user_id = v_candidate.user_id AND symbol = p_symbol FOR UPDATE;
      IF FOUND THEN
        v_new_qty := v_position.qty + v_fill;
        v_new_avg := ((v_position.qty * v_position.avg_price) + (v_trade_price * v_fill)) / v_new_qty;
        UPDATE public.positions SET qty=v_new_qty, avg_price=v_new_avg, updated_at=now()
          WHERE id=v_position.id;
      ELSE
        INSERT INTO public.positions(user_id,symbol,qty,avg_price)
        VALUES(v_candidate.user_id,p_symbol,v_fill,v_trade_price);
      END IF;

      INSERT INTO public.internal_trades
        (symbol,buy_order_id,sell_order_id,buyer_user_id,seller_user_id,price,quantity)
      VALUES(p_symbol,v_candidate.id,v_order_id,v_candidate.user_id,v_user_id,v_trade_price,v_fill);
    END IF;

    UPDATE public.internal_orders
      SET remaining_quantity = remaining_quantity - v_fill,
          status = CASE WHEN remaining_quantity - v_fill = 0 THEN 'filled' ELSE 'partially_filled' END,
          updated_at = now()
      WHERE id = v_candidate.id;

    v_remaining := v_remaining - v_fill;
  END LOOP;

  UPDATE public.internal_orders
    SET remaining_quantity = v_remaining,
        status = CASE WHEN v_remaining = 0 THEN 'filled'
                      WHEN v_remaining < quantity THEN 'partially_filled'
                      ELSE 'open' END,
        updated_at = now()
    WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success',true,'order_id',v_order_id,'symbol',p_symbol,'side',p_side,
    'price',p_price,'quantity',p_quantity,'remaining_quantity',v_remaining,
    'status',CASE WHEN v_remaining = 0 THEN 'filled'
                  WHEN v_remaining < p_quantity THEN 'partially_filled'
                  ELSE 'open' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_internal_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.internal_orders%rowtype;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'You must be logged in'; END IF;

  SELECT * INTO v_order FROM public.internal_orders
    WHERE id=p_order_id AND user_id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('open','partially_filled') THEN
    RAISE EXCEPTION 'Only open orders can be cancelled';
  END IF;

  IF v_order.side='buy' THEN
    UPDATE public.wallets
      SET cash_balance = cash_balance + (v_order.price * v_order.remaining_quantity),
          updated_at = now()
      WHERE user_id=v_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found while releasing reserved funds'; END IF;
  END IF;

  UPDATE public.internal_orders
    SET status='cancelled', updated_at=now()
    WHERE id=p_order_id;

  RETURN jsonb_build_object('success',true,'order_id',p_order_id,'status','cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.place_internal_limit_order(text,text,numeric,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_internal_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_internal_limit_order(text,text,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_internal_order(uuid) TO authenticated;
