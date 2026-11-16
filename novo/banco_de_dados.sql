-- ========================================================
-- Barber Shop Sistemas HP - Esquema Completo do Banco de Dados
-- PostgreSQL (Compatível com PostgreSQL 14+, Supabase, RDS, etc.)
-- ========================================================

create extension if not exists btree_gist;

create type public.app_role as enum ('master','owner','barber','client');
create type public.shop_status as enum ('trial','active','past_due','blocked');
create type public.appointment_status as enum ('scheduled','done','canceled','no_show');

-- Barbearias
create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  status public.shop_status not null default 'trial',
  monthly_price_cents integer not null default 9900,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.barbershops to authenticated;
grant all on public.barbershops to service_role;
alter table public.barbershops enable row level security;

-- Perfis
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text unique,
  email text,
  barbershop_id uuid references public.barbershops(id) on delete cascade,
  preferred_barber_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- Papéis
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Serviços
create table public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null,
  duration_min integer not null default 30 check (duration_min between 5 and 480),
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;

-- Horários de trabalho do barbeiro
create table public.barber_hours (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
grant select, insert, update, delete on public.barber_hours to authenticated;
grant all on public.barber_hours to service_role;
alter table public.barber_hours enable row level security;

-- Agendamentos
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint appointments_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'canceled')
);
create index appointments_barber_time on public.appointments (barber_id, starts_at);
create index appointments_client on public.appointments (client_id, starts_at);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;

-- Funções auxiliares (security definer, evitam recursão de RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_master()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'master')
$$;

create or replace function public.current_shop_id()
returns uuid language sql stable security definer set search_path = public as $$
  select barbershop_id from public.profiles where id = auth.uid()
$$;

create or replace function public.user_shop(_uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select barbershop_id from public.profiles where id = _uid
$$;

create or replace function public.is_staff_user(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _uid and role in ('owner','barber'))
$$;

create or replace function public.is_shop_staff(_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _shop is not null
    and public.current_shop_id() = _shop
    and public.is_staff_user(auth.uid())
$$;

create or replace function public.is_shop_owner(_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _shop is not null
    and public.current_shop_id() = _shop
    and public.has_role(auth.uid(), 'owner')
$$;

create or replace function public.shop_usable(_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.barbershops where id = _shop and status <> 'blocked')
$$;

-- Horários ocupados de um barbeiro (sem expor dados de outros clientes)
create or replace function public.barber_busy(_barber uuid, _from timestamptz, _to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  where a.barber_id = _barber
    and a.status <> 'canceled'
    and a.starts_at < _to
    and a.ends_at > _from
    and public.user_shop(_barber) = public.current_shop_id()
  order by a.starts_at
$$;
revoke execute on function public.barber_busy(uuid, timestamptz, timestamptz) from anon;

-- Políticas: barbearias
create policy "Master gerencia barbearias" on public.barbershops
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy "Membros veem a própria barbearia" on public.barbershops
  for select to authenticated using (id = public.current_shop_id());

-- Políticas: perfis
create policy "Ver perfis permitidos" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_master()
    or public.is_shop_staff(barbershop_id)
    or (barbershop_id = public.current_shop_id() and public.is_staff_user(id))
  );
create policy "Atualizar o próprio nome" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Políticas: papéis
create policy "Ver papéis permitidos" on public.user_roles
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_master()
    or public.is_shop_staff(public.user_shop(user_id))
    or (public.user_shop(user_id) = public.current_shop_id() and public.is_staff_user(user_id))
  );

-- Políticas: serviços
create policy "Membros veem serviços" on public.services
  for select to authenticated using (barbershop_id = public.current_shop_id() or public.is_master());
create policy "Dono cria serviços" on public.services
  for insert to authenticated with check (public.is_shop_owner(barbershop_id));
create policy "Dono altera serviços" on public.services
  for update to authenticated using (public.is_shop_owner(barbershop_id)) with check (public.is_shop_owner(barbershop_id));
create policy "Dono remove serviços" on public.services
  for delete to authenticated using (public.is_shop_owner(barbershop_id));

-- Políticas: horários de trabalho
create policy "Membros veem horários" on public.barber_hours
  for select to authenticated using (barbershop_id = public.current_shop_id() or public.is_master());
create policy "Dono ou barbeiro cria horários" on public.barber_hours
  for insert to authenticated with check (
    public.user_shop(barber_id) = barbershop_id
    and (public.is_shop_owner(barbershop_id) or (barber_id = auth.uid() and public.is_shop_staff(barbershop_id)))
  );
create policy "Dono ou barbeiro altera horários" on public.barber_hours
  for update to authenticated using (
    public.is_shop_owner(barbershop_id) or (barber_id = auth.uid() and public.is_shop_staff(barbershop_id))
  ) with check (
    public.user_shop(barber_id) = barbershop_id
    and (public.is_shop_owner(barbershop_id) or (barber_id = auth.uid() and public.is_shop_staff(barbershop_id)))
  );
create policy "Dono ou barbeiro remove horários" on public.barber_hours
  for delete to authenticated using (
    public.is_shop_owner(barbershop_id) or (barber_id = auth.uid() and public.is_shop_staff(barbershop_id))
  );

-- Políticas: agendamentos
create policy "Ver agendamentos permitidos" on public.appointments
  for select to authenticated using (
    client_id = auth.uid() or public.is_shop_staff(barbershop_id) or public.is_master()
  );
create policy "Criar agendamentos" on public.appointments
  for insert to authenticated with check (
    barbershop_id = public.current_shop_id()
    and public.shop_usable(barbershop_id)
    and public.is_staff_user(barber_id)
    and public.user_shop(barber_id) = barbershop_id
    and public.user_shop(client_id) = barbershop_id
    and (public.is_shop_staff(barbershop_id) or client_id = auth.uid())
  );
create policy "Atualizar agendamentos" on public.appointments
  for update to authenticated using (
    public.is_shop_staff(barbershop_id) or client_id = auth.uid()
  ) with check (
    public.is_shop_staff(barbershop_id) or client_id = auth.uid()
  );
create policy "Equipe remove agendamentos" on public.appointments
  for delete to authenticated using (public.is_shop_staff(barbershop_id));

-- Regras extras para clientes: só agendam no futuro e só podem cancelar
create or replace function public.appointments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_shop_staff(coalesce(new.barbershop_id, old.barbershop_id)) or public.is_master() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.starts_at <= now() then
      raise exception 'Escolha um horário no futuro';
    end if;
    new.status := 'scheduled';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status <> 'canceled'
       or new.starts_at <> old.starts_at
       or new.ends_at <> old.ends_at
       or new.barber_id <> old.barber_id
       or new.client_id <> old.client_id
       or new.barbershop_id <> old.barbershop_id then
      raise exception 'Clientes só podem cancelar o agendamento';
    end if;
    return new;
  end if;
  return new;
end;
$$;

create trigger appointments_guard_trg
  before insert or update on public.appointments
  for each row execute function public.appointments_guard();

-- Migration 0001: Shop Name & Payments

ALTER TABLE public.barbershops ADD COLUMN name_chosen boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_my_shop_name(_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop uuid := public.current_shop_id();
  _clean text := btrim(coalesce(_name, ''));
BEGIN
  IF _shop IS NULL OR NOT public.is_shop_owner(_shop) THEN
    RAISE EXCEPTION 'Somente o dono da barbearia pode mudar o nome';
  END IF;
  IF length(_clean) < 2 OR length(_clean) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter entre 2 e 60 letras';
  END IF;
  UPDATE public.barbershops SET name = _clean, name_chosen = true WHERE id = _shop;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_shop_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_shop_name(text) TO authenticated;

CREATE TABLE public.shop_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  reference_month date NOT NULL,
  amount_cents integer NOT NULL,
  paid_on date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'pix',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_payments_month_first_day CHECK (extract(day FROM reference_month) = 1),
  CONSTRAINT shop_payments_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX shop_payments_month_idx ON public.shop_payments (reference_month);
CREATE INDEX shop_payments_shop_idx ON public.shop_payments (barbershop_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_payments TO authenticated;
GRANT ALL ON public.shop_payments TO service_role;

ALTER TABLE public.shop_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master gerencia pagamentos" ON public.shop_payments
  FOR ALL TO authenticated
  USING (public.is_master()) WITH CHECK (public.is_master());

CREATE POLICY "Dono vê pagamentos da barbearia" ON public.shop_payments
  FOR SELECT TO authenticated
  USING (public.is_shop_owner(barbershop_id));


-- Migration 0002: Trial & Prospects

ALTER TABLE public.barbershops ADD COLUMN trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');
UPDATE public.barbershops SET trial_ends_at = created_at + interval '30 days';
ALTER TABLE public.barbershops ALTER COLUMN monthly_price_cents SET DEFAULT 3000;

CREATE TYPE public.prospect_status AS ENUM ('new','contacted','interested','signed','not_interested');

CREATE TABLE public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL,
  contact_name text,
  city text,
  state text,
  phone text,
  status public.prospect_status NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'manual',
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospects_source_check CHECK (source IN ('manual','site')),
  CONSTRAINT prospects_shop_name_len CHECK (length(btrim(shop_name)) BETWEEN 2 AND 100),
  CONSTRAINT prospects_contact_len CHECK (contact_name IS NULL OR length(contact_name) <= 100),
  CONSTRAINT prospects_city_len CHECK (city IS NULL OR length(city) <= 80),
  CONSTRAINT prospects_state_len CHECK (state IS NULL OR length(state) <= 30),
  CONSTRAINT prospects_phone_fmt CHECK (phone IS NULL OR phone ~ '^[0-9]{10,15}$'),
  CONSTRAINT prospects_notes_len CHECK (notes IS NULL OR length(notes) <= 1000)
);

CREATE INDEX prospects_status_idx ON public.prospects (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospects TO authenticated;
GRANT INSERT ON public.prospects TO anon;
GRANT ALL ON public.prospects TO service_role;

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master gerencia prospecção" ON public.prospects
  FOR ALL TO authenticated
  USING (public.is_master()) WITH CHECK (public.is_master());

CREATE POLICY "Visitante pede teste grátis pelo site" ON public.prospects
  FOR INSERT TO anon, authenticated
  WITH CHECK (source = 'site' AND status = 'new' AND last_contacted_at IS NULL AND notes IS NULL);


-- Migration 0003: Prospect Email & Maps

ALTER TABLE public.prospects ADD COLUMN email text;
ALTER TABLE public.prospects ADD COLUMN address text;
ALTER TABLE public.prospects ADD COLUMN google_place_id text;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_email_len CHECK (email IS NULL OR (length(email) <= 255 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
ALTER TABLE public.prospects ADD CONSTRAINT prospects_address_len CHECK (address IS NULL OR length(address) <= 300);
ALTER TABLE public.prospects ADD CONSTRAINT prospects_place_len CHECK (google_place_id IS NULL OR length(google_place_id) <= 300);
ALTER TABLE public.prospects DROP CONSTRAINT prospects_source_check;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_source_check CHECK (source IN ('manual','site','maps'));
CREATE UNIQUE INDEX prospects_google_place_uidx ON public.prospects (google_place_id) WHERE google_place_id IS NOT NULL;

DROP POLICY "Visitante pede teste grátis pelo site" ON public.prospects;
CREATE POLICY "Visitante pede teste grátis pelo site" ON public.prospects
  FOR INSERT TO anon, authenticated
  WITH CHECK (source = 'site' AND status = 'new' AND last_contacted_at IS NULL AND notes IS NULL AND google_place_id IS NULL);


-- Migration 0004: Unique Google Place ID

DROP INDEX IF EXISTS public.prospects_google_place_uidx;
ALTER TABLE public.prospects ADD CONSTRAINT prospects_google_place_key UNIQUE (google_place_id);
