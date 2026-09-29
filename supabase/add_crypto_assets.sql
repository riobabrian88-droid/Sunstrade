-- Add the six new crypto markets to the Sunstrade asset list.
-- Run this in Supabase SQL Editor after deployment.
INSERT INTO public.assets (symbol, name, price, prev_close, volatility)
VALUES
  ('BNB/USD', 'BNB / US Dollar', 0, 0, 0.02),
  ('SOL/USD', 'Solana / US Dollar', 0, 0, 0.03),
  ('XRP/USD', 'XRP / US Dollar', 0, 0, 0.03),
  ('DOGE/USD', 'Dogecoin / US Dollar', 0, 0, 0.04),
  ('ADA/USD', 'Cardano / US Dollar', 0, 0, 0.03),
  ('LTC/USD', 'Litecoin / US Dollar', 0, 0, 0.03)
ON CONFLICT (symbol) DO UPDATE
SET name = EXCLUDED.name,
    volatility = EXCLUDED.volatility;
