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
-- Writes are mediated by RPCs with role checks, not direct table grants.
revoke insert,update,delete on public.stock_counts from authenticated;
create or replace function public.save_counter_count(p_date date,p_item text,p_actual numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='counter') then raise exception 'Counter access required'; end if;
 if p_item !~ '^stock-[0-9]{3}$' or p_actual < 0 then raise exception 'Invalid item or quantity'; end if;
 insert into public.stock_counts(count_date,item_id,actual) values(p_date,p_item,p_actual)
 on conflict(count_date,item_id) do update set actual=excluded.actual,updated_at=now();
end $$;
create or replace function public.save_verifier_count(p_date date,p_item text,p_system numeric,p_remarks text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='verifier') then raise exception 'Verifier access required'; end if;
 if p_item !~ '^stock-[0-9]{3}$' or p_system < 0 then raise exception 'Invalid item or quantity'; end if;
 insert into public.stock_counts(count_date,item_id,system,remarks) values(p_date,p_item,p_system,coalesce(p_remarks,''))
 on conflict(count_date,item_id) do update set system=excluded.system,remarks=excluded.remarks,updated_at=now();
end $$;
revoke all on function public.save_counter_count(date,text,numeric) from public;
revoke all on function public.save_verifier_count(date,text,numeric,text) from public;
grant execute on function public.save_counter_count(date,text,numeric) to authenticated;
grant execute on function public.save_verifier_count(date,text,numeric,text) to authenticated;
-- Assign roles using the SQL editor after creating Auth users:
-- insert into public.profiles(id,role) values ('USER_UUID','counter');
