-- Run in Supabase SQL editor. Enable email/password authentication.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('counter','verifier'))
);
create table if not exists public.stock_counts (
 count_date date not null,
 item_id text not null check (item_id ~ '^stock-[0-9]{3}$'),
 actual numeric(14,4) check (actual >= 0),
 system numeric(14,4) check (system >= 0),
 remarks text not null default '',
 updated_at timestamptz not null default now(),
 primary key(count_date,item_id)
);
alter table public.profiles enable row level security;
alter table public.stock_counts enable row level security;
revoke all on public.profiles from anon;
revoke all on public.stock_counts from anon;
grant select on public.profiles to authenticated;
grant select,insert,update on public.stock_counts to authenticated;
create policy "Read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Read counts" on public.stock_counts for select to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('counter','verifier'))
);
create policy "Insert counts" on public.stock_counts for insert to authenticated with check(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('counter','verifier'))
);
create policy "Update counts" on public.stock_counts for update to authenticated using(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('counter','verifier'))
) with check(
 exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('counter','verifier'))
);
-- IMPORTANT: Column grants limit counters to updating actual only.
revoke update on public.stock_counts from authenticated;
grant update(actual) on public.stock_counts to authenticated;
-- Supabase cannot apply column grants by role in this shared authenticated role.
-- For strict Counter/Verifier separation, use a security-definer RPC and revoke
-- direct writes. Do NOT deploy this starter schema as production authorization.
