-- Enable real pending Limit and Stop orders.
-- Run this migration in the Supabase SQL Editor.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('market', 'limit', 'stop'));

CREATE OR REPLACE FUNCTION public.place_order(
  p_symbol text,
  p_side text,
  p_order_type text DEFAULT 'market',
  p_qty numeric DEFAULT 0,
  p_limit_price numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_wallet public.wallets%rowtype;
  v_position public.positions%rowtype;
  v_order_id uuid;
  v_cost numeric;
  v_new_qty numeric;
  v_new_avg numeric;
  v_suspended boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'You must be logged in'; END IF;
  SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_suspended IS TRUE THEN RAISE EXCEPTION 'Your account is suspended and cannot trade'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF p_side NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid order side'; END IF;
  IF p_order_type NOT IN ('market','limit','stop') THEN RAISE EXCEPTION 'Invalid order type'; END IF;
  IF p_order_type IN ('limit','stop') AND (p_limit_price IS NULL OR p_limit_price <= 0) THEN
    RAISE EXCEPTION 'Enter a valid trigger price';
  END IF;

  SELECT price INTO v_price FROM public.assets WHERE symbol = p_symbol FOR SHARE;
  IF NOT FOUND OR v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'Asset price is unavailable'; END IF;

  IF p_order_type IN ('limit','stop') THEN
    INSERT INTO public.orders(user_id,symbol,side,order_type,qty,limit_price,status)
    VALUES(v_user_id,p_symbol,p_side,p_order_type,p_qty,p_limit_price,'pending')
    RETURNING id INTO v_order_id;
    RETURN jsonb_build_object('success',true,'order_id',v_order_id,'status','pending',
      'symbol',p_symbol,'side',p_side,'quantity',p_qty,'trigger_price',p_limit_price);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id,cash_balance) VALUES(v_user_id,10000.00)
    RETURNING * INTO v_wallet;
  END IF;
  v_cost := p_qty * v_price;
  IF p_side='buy' THEN
    IF v_wallet.cash_balance < v_cost THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
    UPDATE public.wallets SET cash_balance=cash_balance-v_cost,updated_at=now() WHERE user_id=v_user_id;
    SELECT * INTO v_position FROM public.positions WHERE user_id=v_user_id AND symbol=p_symbol FOR UPDATE;
    IF FOUND THEN
      v_new_qty:=v_position.qty+p_qty;
      v_new_avg:=((v_position.qty*v_position.avg_price)+v_cost)/v_new_qty;
      UPDATE public.positions SET qty=v_new_qty,avg_price=v_new_avg,updated_at=now() WHERE id=v_position.id;
    ELSE
      INSERT INTO public.positions(user_id,symbol,qty,avg_price) VALUES(v_user_id,p_symbol,p_qty,v_price);
    END IF;
  ELSE
    SELECT * INTO v_position FROM public.positions WHERE user_id=v_user_id AND symbol=p_symbol FOR UPDATE;
    IF NOT FOUND OR v_position.qty<p_qty THEN RAISE EXCEPTION 'Insufficient position'; END IF;
    UPDATE public.wallets SET cash_balance=cash_balance+v_cost,updated_at=now() WHERE user_id=v_user_id;
    v_new_qty:=v_position.qty-p_qty;
    IF v_new_qty=0 THEN DELETE FROM public.positions WHERE id=v_position.id;
    ELSE UPDATE public.positions SET qty=v_new_qty,updated_at=now() WHERE id=v_position.id; END IF;
  END IF;
  INSERT INTO public.orders(user_id,symbol,side,order_type,qty,status,filled_price,filled_at)
  VALUES(v_user_id,p_symbol,p_side,'market',p_qty,'filled',v_price,now()) RETURNING id INTO v_order_id;
  INSERT INTO public.trades(user_id,symbol,side,qty,price) VALUES(v_user_id,p_symbol,p_side,p_qty,v_price);
  RETURN jsonb_build_object('success',true,'order_id',v_order_id,'status','filled',
    'symbol',p_symbol,'side',p_side,'quantity',p_qty,'price',v_price);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pending_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%rowtype;
  v_price numeric;
  v_wallet public.wallets%rowtype;
  v_position public.positions%rowtype;
  v_cost numeric;
  v_new_qty numeric;
  v_new_avg numeric;
  v_count integer := 0;
  v_suspended boolean;
BEGIN
  FOR o IN
    SELECT ord.* FROM public.orders ord
    JOIN public.assets a ON a.symbol=ord.symbol
    WHERE ord.status='pending'
      AND ord.order_type IN ('limit','stop')
      AND CASE
        WHEN ord.order_type='limit' AND ord.side='buy' THEN a.price<=ord.limit_price
        WHEN ord.order_type='limit' AND ord.side='sell' THEN a.price>=ord.limit_price
        WHEN ord.order_type='stop' AND ord.side='buy' THEN a.price>=ord.limit_price
        WHEN ord.order_type='stop' AND ord.side='sell' THEN a.price<=ord.limit_price
        ELSE false
      END
    ORDER BY ord.created_at
    FOR UPDATE OF ord SKIP LOCKED
  LOOP
    BEGIN
      SELECT is_suspended INTO v_suspended FROM public.profiles WHERE id=o.user_id;
      IF NOT FOUND OR v_suspended IS TRUE THEN
        UPDATE public.orders SET status='rejected' WHERE id=o.id AND status='pending';
      ELSE
        SELECT price INTO v_price FROM public.assets WHERE symbol=o.symbol;
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id=o.user_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
        v_cost:=o.qty*v_price;
        IF o.side='buy' THEN
          IF v_wallet.cash_balance<v_cost THEN RAISE EXCEPTION 'Insufficient balance at trigger'; END IF;
          UPDATE public.wallets SET cash_balance=cash_balance-v_cost,updated_at=now() WHERE user_id=o.user_id;
          SELECT * INTO v_position FROM public.positions WHERE user_id=o.user_id AND symbol=o.symbol FOR UPDATE;
          IF FOUND THEN
            v_new_qty:=v_position.qty+o.qty;
            v_new_avg:=((v_position.qty*v_position.avg_price)+v_cost)/v_new_qty;
            UPDATE public.positions SET qty=v_new_qty,avg_price=v_new_avg,updated_at=now() WHERE id=v_position.id;
          ELSE
            INSERT INTO public.positions(user_id,symbol,qty,avg_price) VALUES(o.user_id,o.symbol,o.qty,v_price);
          END IF;
        ELSE
          SELECT * INTO v_position FROM public.positions WHERE user_id=o.user_id AND symbol=o.symbol FOR UPDATE;
          IF NOT FOUND OR v_position.qty<o.qty THEN RAISE EXCEPTION 'Insufficient position at trigger'; END IF;
          UPDATE public.wallets SET cash_balance=cash_balance+v_cost,updated_at=now() WHERE user_id=o.user_id;
          v_new_qty:=v_position.qty-o.qty;
          IF v_new_qty=0 THEN DELETE FROM public.positions WHERE id=v_position.id;
          ELSE UPDATE public.positions SET qty=v_new_qty,updated_at=now() WHERE id=v_position.id; END IF;
        END IF;
        INSERT INTO public.trades(user_id,symbol,side,qty,price)
        VALUES(o.user_id,o.symbol,o.side,o.qty,v_price);
        UPDATE public.orders SET status='filled',filled_price=v_price,filled_at=now()
        WHERE id=o.id AND status='pending';
        v_count:=v_count+1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.orders SET status='rejected' WHERE id=o.id AND status='pending';
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.process_pending_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,numeric,numeric) TO authenticated;
