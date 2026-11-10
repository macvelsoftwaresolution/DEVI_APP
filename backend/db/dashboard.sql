-- DEVI – dashboard reads from the database, not from whole tables in the SOS server (P3, S4)
--
-- Before, every dashboard request loaded and decrypted every SOS, user and guardian row in the same
-- process that sends SOS, and stopped silently at 20,000 rows. Now lists are paged here, and the
-- numbers on the home page are counted here (dashboard_stats), with no decryption at all.
--
-- Run once in Supabase Dashboard → SQL Editor. Safe to run more than once.
-- Until it is run the dashboard still works: the home page counts with slower separate queries.

-- Paging and filters
create index if not exists sos_history_created_at_idx on public.sos_history (created_at desc);
create index if not exists sos_history_user_created_idx on public.sos_history (user_id, created_at desc);
create index if not exists sos_history_status_created_idx on public.sos_history (status, created_at desc);
create index if not exists users_created_at_idx on public.users (created_at desc);
create index if not exists guardians_user_id_idx on public.guardians (user_id);

-- Home page numbers: SOS and user totals, today in IST, and SOS per day for the chart.
-- Counts only: no personal data leaves the database.
create or replace function public.dashboard_stats(p_days integer default 30)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with
    today as (select (now() at time zone 'Asia/Kolkata')::date as d),
    span as (select greatest(least(coalesce(p_days, 30), 90), 7) as n),
    days as (
      select (generate_series((select d from today) - ((select n from span) - 1), (select d from today), interval '1 day'))::date as d
    ),
    per_day as (
      select (created_at at time zone 'Asia/Kolkata')::date as d, count(*) as n
      from public.sos_history
      where created_at >= now() - interval '92 days'
      group by 1
    )
  select json_build_object(
    'sos', (
      select json_build_object(
        'total', count(*),
        'today', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date = (select d from today)),
        'active', count(*) filter (where upper(coalesce(status, 'ACTIVE')) <> 'RESOLVED'),
        'resolved', count(*) filter (where upper(status) = 'RESOLVED')
      )
      from public.sos_history
    ),
    'users', (
      select json_build_object(
        'total', count(*),
        'registered', count(*) filter (where not coalesce(is_guest, false)),
        'guests', count(*) filter (where coalesce(is_guest, false)),
        'newToday', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date = (select d from today))
      )
      from public.users
    ),
    'guardians', (select json_build_object('total', count(*)) from public.guardians),
    'daily', (
      select json_agg(json_build_object('date', to_char(days.d, 'YYYY-MM-DD'), 'count', coalesce(per_day.n, 0)) order by days.d)
      from days left join per_day on per_day.d = days.d
    )
  );
$$;

-- Backend only (secret key = service_role)
revoke all on function public.dashboard_stats(integer) from public, anon, authenticated;
grant execute on function public.dashboard_stats(integer) to service_role;
