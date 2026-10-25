-- Add additional instruments to the Markets catalogue.
-- Run this in the SQL Editor of BOTH the main and trial Supabase projects.
-- Zero values are placeholders only; the live feed must supply a valid quote.
INSERT INTO public.assets (symbol, name, price, prev_close)
VALUES
  ('AVAX/USD', 'Avalanche', 0, 0),
  ('LINK/USD', 'Chainlink', 0, 0),
  ('DOT/USD', 'Polkadot', 0, 0),
  ('TRX/USD', 'TRON', 0, 0),
  ('BCH/USD', 'Bitcoin Cash', 0, 0),
  ('SHIB/USD', 'Shiba Inu', 0, 0),
  ('TON/USD', 'Toncoin', 0, 0),
  ('GBP/USD', 'British Pound / US Dollar', 0, 0),
  ('USD/CHF', 'US Dollar / Swiss Franc', 0, 0),
  ('AUD/USD', 'Australian Dollar / US Dollar', 0, 0),
  ('USD/CAD', 'US Dollar / Canadian Dollar', 0, 0),
  ('NZD/USD', 'New Zealand Dollar / US Dollar', 0, 0),
  ('EUR/GBP', 'Euro / British Pound', 0, 0),
  ('XAG/USD', 'Silver', 0, 0),
  ('WTI/USD', 'WTI Crude Oil', 0, 0),
  ('BRENT/USD', 'Brent Crude Oil', 0, 0),
  ('SPX', 'S&P 500 Index', 0, 0),
  ('NDX', 'Nasdaq 100 Index', 0, 0),
  ('DJI', 'Dow Jones Industrial Average', 0, 0),
  ('FTSE', 'FTSE 100 Index', 0, 0),
  ('DAX', 'DAX Index', 0, 0),
  ('N225', 'Nikkei 225 Index', 0, 0)
ON CONFLICT (symbol) DO NOTHING;
