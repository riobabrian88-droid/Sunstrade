-- Shared read API for the internal paper market.
-- Returns aggregated price levels and anonymized recent trades. Raw orders
-- remain protected by the existing per-user RLS policies.
-- Run after internal_order_book_schema.sql.

CREATE OR REPLACE FUNCTION public.get_internal_order_book(p_symbol text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF p_symbol IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.assets WHERE symbol = p_symbol
  ) THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;

  SELECT jsonb_build_object(
    'symbol', p_symbol,
    'bids', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('price', levels.price, 'quantity', levels.quantity)
        ORDER BY levels.price DESC
      )
      FROM (
        SELECT price, SUM(remaining_quantity) AS quantity
        FROM public.internal_orders
        WHERE symbol = p_symbol
          AND side = 'buy'
          AND status IN ('open', 'partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT 20
      ) AS levels
    ), '[]'::jsonb),
    'asks', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('price', levels.price, 'quantity', levels.quantity)
        ORDER BY levels.price ASC
      )
      FROM (
        SELECT price, SUM(remaining_quantity) AS quantity
        FROM public.internal_orders
        WHERE symbol = p_symbol
          AND side = 'sell'
          AND status IN ('open', 'partially_filled')
          AND remaining_quantity > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT 20
      ) AS levels
    ), '[]'::jsonb),
    'trades', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'price', recent.price,
          'quantity', recent.quantity,
          'created_at', recent.created_at
        )
        ORDER BY recent.created_at DESC
      )
      FROM (
        SELECT price, quantity, created_at
        FROM public.internal_trades
        WHERE symbol = p_symbol
        ORDER BY created_at DESC
        LIMIT 20
      ) AS recent
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_internal_order_book(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_internal_order_book(text) TO authenticated;
