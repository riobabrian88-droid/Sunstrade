-- Add additional instruments to the Markets catalogue.
-- Run this in the SQL Editor of BOTH the main and trial Supabase projects.
-- Quotes are populated by /api/prices; these zero values are placeholders only.
INSERT INTO public.assets (symbol, name, price, prev_close)
VALUES
  ('AVAX/USD', 'Avalanche', 0, NULL),
  ('LINK/USD', 'Chainlink', 0, NULL),
  ('DOT/USD', 'Polkadot', 0, NULL),
  ('TRX/USD', 'TRON', 0, NULL),
  ('BCH/USD', 'Bitcoin Cash', 0, NULL),
  ('SHIB/USD', 'Shiba Inu', 0, NULL),
  ('TON/USD', 'Toncoin', 0, NULL),
  ('GBP/USD', 'British Pound / US Dollar', 0, NULL),
  ('USD/CHF', 'US Dollar / Swiss Franc', 0, NULL),
  ('AUD/USD', 'Australian Dollar / US Dollar', 0, NULL),
  ('USD/CAD', 'US Dollar / Canadian Dollar', 0, NULL),
  ('NZD/USD', 'New Zealand Dollar / US Dollar', 0, NULL),
  ('EUR/GBP', 'Euro / British Pound', 0, NULL),
  ('XAG/USD', 'Silver', 0, NULL),
  ('WTI/USD', 'WTI Crude Oil', 0, NULL),
  ('BRENT/USD', 'Brent Crude Oil', 0, NULL),
  ('SPX', 'S&P 500 Index', 0, NULL),
  ('NDX', 'Nasdaq 100 Index', 0, NULL),
  ('DJI', 'Dow Jones Industrial Average', 0, NULL),
  ('FTSE', 'FTSE 100 Index', 0, NULL),
  ('DAX', 'DAX Index', 0, NULL),
  ('N225', 'Nikkei 225 Index', 0, NULL)
ON CONFLICT (symbol) DO NOTHING;
