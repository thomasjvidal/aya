-- Aya - schema inicial
-- Rode isso no Supabase: Dashboard > SQL Editor > New query > cola tudo > Run

create extension if not exists "pgcrypto";

-- Perfil de cada usuário (complementa auth.users, que já vem pronto no Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Você',
  estilo text not null default 'aperto' check (estilo in ('aperto','auto','impulso')),
  created_at timestamptz not null default now()
);

-- Cofres (Contas do mês, Reserva, Sonho, Livre...)
create table if not exists public.cofres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  icone text not null default '🧾',
  valor_atual numeric not null default 0,
  valor_meta numeric,
  created_at timestamptz not null default now()
);

-- Movimento (extrato / transações)
create table if not exists public.movimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  categoria text,
  valor numeric not null,
  tipo text not null check (tipo in ('entrada','saida')),
  risco boolean not null default false,
  created_at timestamptz not null default now()
);

-- Favoritos (lista de desejos / links salvos)
create table if not exists public.favoritos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  url text not null,
  preco numeric,
  created_at timestamptz not null default now()
);

-- Inscrições de notificação push (Web Push) + token usado pelo Atalho do iPhone
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  nudge_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.cofres enable row level security;
alter table public.movimentos enable row level security;
alter table public.favoritos enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles: dono le/edita" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "cofres: dono le/edita" on public.cofres
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "movimentos: dono le/edita" on public.movimentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "favoritos: dono le/edita" on public.favoritos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_subscriptions: dono le/edita" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Você'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
