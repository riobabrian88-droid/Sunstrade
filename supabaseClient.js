// Project Settings → API in your Supabase dashboard.
// The anon key is safe to expose client-side; access is governed by
// Row Level Security policies (see backend/supabase/migrations).
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
