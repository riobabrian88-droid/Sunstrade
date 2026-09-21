-- Run this once in the Supabase SQL editor (or via `supabase db push`
-- if you're using the Supabase CLI).

-- One row per user, holding the profile fields collected at signup.
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  country text,
  terms_accepted_at timestamptz,
  created_at timestamptz default now()
);

-- Row Level Security: users can only ever see or touch their own row.
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Whenever someone signs up via supabase.auth.signUp(), pull the
-- full_name / country / terms_accepted_at we passed in as user
-- metadata and copy them into a real, queryable profiles row.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, country, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'country',
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
