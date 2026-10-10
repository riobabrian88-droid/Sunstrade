-- SunStrade trading security hardening (reviewed source-level changes).
-- IMPORTANT:
-- 1. Apply to a staging Supabase project first.
-- 2. Confirm the live schema/RLS/grants before running in production.
-- 3. This file does not make SunStrade safe for real-money trading by itself.
--
-- Restrict profile writes to the editable full_name field, and prevent direct
-- client-side writes to simulated balances, positions, order records, and trades.
-- Approved server-side SECURITY DEFINER RPCs continue to perform these writes.

BEGIN;

-- Remove table-level client writes, including grants that may have been given
-- directly or through PUBLIC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

-- Also remove any column-specific write grants left by earlier setup scripts.
DO $$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles';

  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE INSERT (%1$s), UPDATE (%1$s) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',
      v_columns
    );
  END IF;
END
$$;

-- The browser only needs to read its own profile and update display name.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Do not allow clients to manufacture or edit balances, positions, filled
-- orders, or the trade ledger. The app must use reviewed database RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.wallets,
  public.positions,
  public.orders,
  public.trades
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
  v_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['wallets', 'positions', 'orders', 'trades']
  LOOP
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_table;

    IF v_columns IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT (%1$s), UPDATE (%1$s) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',
        v_columns, v_table
      );
    END IF;
  END LOOP;
END
$$;

-- Read access remains subject to each table's existing Row Level Security
-- policies. No new read policy is added by this script.
GRANT SELECT ON TABLE
  public.wallets,
  public.positions,
  public.orders,
  public.trades
  TO authenticated;

-- Harden the execution boundary. The market-order RPC is required; pending
-- processing exists only when the optional limit/stop-order SQL was installed.
DO $
BEGIN
  IF to_regprocedure('public.place_order(text,text,text,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Expected public.place_order(text,text,text,numeric,numeric) was not found; stop and verify the deployed trading SQL.';
  END IF;

  EXECUTE 'REVOKE ALL ON FUNCTION public.place_order(text, text, text, numeric, numeric) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, numeric, numeric) TO authenticated';

  IF to_regprocedure('public.process_pending_orders()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.process_pending_orders() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.process_pending_orders() TO service_role';
  END IF;
END
$;

COMMIT;

-- Post-apply checks:
-- 1. As a normal test user, updating profiles.is_admin/is_suspended must fail.
-- 2. Updating wallets.cash_balance or positions.qty directly must fail.
-- 3. Direct INSERT/UPDATE/DELETE on orders and trades must fail.
-- 4. Editing full_name, viewing one's own account, and placing a paper order
--    through the reviewed RPC must still work.
-- 5. Confirm wallet_transactions insert/review permissions separately: that
--    schema/function is not defined in the reviewed repository files.
