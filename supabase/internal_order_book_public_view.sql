-- Public shared view of the internal paper order book.
-- Run after internal_order_book_schema.sql and internal_order_book_matching_engine.sql.
-- Public market data is aggregated; user IDs and individual order IDs are not exposed.

CREATE OR REPLACE FUNCTION public.get_internal_order_book(p_symbol text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.assets WHERE symbol = p_symbol) THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  SELECT jsonb_build_object(
    'symbol', p_symbol,
    'bids', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('price', levels.price, 'quantity', levels.quantity)
                       ORDER BY levels.price DESC)
      FROM (
        SELECT price, sum(remaining_quantity) AS quantity
        FROM public.internal_orders
        WHERE symbol = p_symbol
          AND side = 'buy'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT 20
      ) AS levels
    ), '[]'::jsonb),
    'asks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('price', levels.price, 'quantity', levels.quantity)
                       ORDER BY levels.price ASC)
      FROM (
        SELECT price, sum(remaining_quantity) AS quantity
        FROM public.internal_orders
        WHERE symbol = p_symbol
          AND side = 'sell'
          AND status IN ('open','partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT 20
      ) AS levels
    ), '[]'::jsonb),
    'trades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'price', recent.price,
        'quantity', recent.quantity,
        'created_at', recent.created_at
      ) ORDER BY recent.created_at DESC)
      FROM (
        SELECT price, quantity, created_at
        FROM public.internal_trades
        WHERE symbol = p_symbol
        ORDER BY created_at DESC
        LIMIT 20
      ) AS recent
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_internal_order_book(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_internal_order_book(text) TO authenticated;
