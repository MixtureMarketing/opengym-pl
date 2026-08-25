-- openGym na Supabase — schemat i polityki dostępu.
--
-- Wklej całość w Supabase → SQL Editor → New query → Run. Skrypt jest idempotentny:
-- można go puścić drugi raz po zmianie i nic nie zniszczy.
--
-- Model danych jest celowo taki sam jak w wariancie z własnym serwerem: jeden wiersz na
-- użytkownika, całość stanu w JSONB. Aplikacja i tak operuje na całym stanie naraz
-- (zapis, kopia, import, przywracanie), a schemat rozbity na dziesięć tabel byłby dziesięcioma
-- miejscami do zmigrowania przy każdej zmianie kształtu danych.

-- ---------------------------------------------------------------- stan użytkownika
create table if not exists public.states (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.states is
  'Plan, treningi, masa ciała i ustawienia — jeden wiersz na użytkownika.';

-- Bezpiecznik rozmiaru. Historia kilku lat treningów to setki kilobajtów; megabajt oznacza
-- błąd albo próbę użycia darmowej bazy jako dysku. Limit jest po stronie bazy, bo klientowi
-- w przeglądarce nie można ufać, że go dotrzyma.
create or replace function public.states_size_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_column_size(new.state) > 5 * 1024 * 1024 then
    raise exception 'state too large (max 5 MB)';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists states_size_guard on public.states;
create trigger states_size_guard
  before insert or update on public.states
  for each row execute function public.states_size_guard();

-- ---------------------------------------------------------------- RLS
-- To jest jedyna rzecz, która stoi między czyimiś treningami a resztą internetu. Klucz `anon`
-- w aplikacji jest jawny (jedzie w każdym żądaniu z przeglądarki i nie da się go ukryć),
-- więc dostępu pilnują polityki: bez ważnego tokenu sesji nie ma ani odczytu, ani zapisu,
-- a z tokenem widać wyłącznie własny wiersz.
alter table public.states enable row level security;

drop policy if exists states_select_own on public.states;
create policy states_select_own on public.states
  for select using (auth.uid() = user_id);

drop policy if exists states_insert_own on public.states;
create policy states_insert_own on public.states
  for insert with check (auth.uid() = user_id);

drop policy if exists states_update_own on public.states;
create policy states_update_own on public.states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists states_delete_own on public.states;
create policy states_delete_own on public.states
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------- licznik pytań do trenera AI
-- Limit dzienny na użytkownika. Funkcja brzegowa liczy tu zużycie kluczem service_role,
-- więc żaden klient nie może tego wiersza podrobić ani skasować — dlatego RLS nie ma tu
-- ani jednej polityki: brak polityki przy włączonym RLS znaczy „nikt z przeglądarki".
create table if not exists public.coach_usage (
  user_id uuid        not null references auth.users (id) on delete cascade,
  day     date        not null default current_date,
  n       integer     not null default 0,
  primary key (user_id, day)
);

alter table public.coach_usage enable row level security;

comment on table public.coach_usage is
  'Zużycie trenera AI: ile pytań dziennie. Zapisywane wyłącznie przez funkcję brzegową.';

-- Sprzątanie: liczniki starsze niż 30 dni nie są do niczego potrzebne.
create or replace function public.coach_usage_prune()
returns void
language sql
as $$
  delete from public.coach_usage where day < current_date - 30;
$$;
