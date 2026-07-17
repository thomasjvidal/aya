-- Aya - script único e seguro (pode rodar mais de uma vez sem quebrar nada)
-- Supabase > SQL Editor > New query > cola tudo > Run

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Você',
  estilo text not null default 'aperto' check (estilo in ('aperto','auto','impulso')),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: leitura publica" on storage.objects;
create policy "avatars: leitura publica" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: dono envia" on storage.objects;
create policy "avatars: dono envia" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: dono atualiza" on storage.objects;
create policy "avatars: dono atualiza" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: dono remove" on storage.objects;
create policy "avatars: dono remove" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.cofres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  icone text not null default '🧾',
  valor_atual numeric not null default 0,
  valor_meta numeric,
  created_at timestamptz not null default now()
);

alter table public.cofres
  add column if not exists tipo text not null default 'guardado'
  check (tipo in ('livre','contas','guardado'));

alter table public.cofres
  add column if not exists notas text;

alter table public.cofres
  add column if not exists concluido boolean not null default true;

alter table public.cofres
  add column if not exists meta_tipo text not null default 'valor'
  check (meta_tipo in ('valor','percentual'));

alter table public.cofres
  add column if not exists percentual numeric;

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

alter table public.movimentos
  add column if not exists cofre_id uuid references public.cofres(id) on delete set null;

alter table public.movimentos
  add column if not exists organizado boolean not null default false;

alter table public.movimentos drop constraint if exists movimentos_tipo_check;
alter table public.movimentos add constraint movimentos_tipo_check check (tipo in ('entrada','saida','esperado','rendimento'));

create table if not exists public.distribuicoes (
  id uuid primary key default gen_random_uuid(),
  movimento_id uuid not null references public.movimentos(id) on delete cascade,
  cofre_id uuid not null references public.cofres(id) on delete cascade,
  valor numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contas_fixas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  valor numeric not null,
  cofre_id uuid references public.cofres(id) on delete set null,
  icone text not null default '🧾',
  created_at timestamptz not null default now()
);

create table if not exists public.favoritos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  url text not null,
  preco numeric,
  created_at timestamptz not null default now()
);

alter table public.favoritos
  add column if not exists cofre_id uuid references public.cofres(id) on delete set null;

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
alter table public.distribuicoes enable row level security;
alter table public.contas_fixas enable row level security;
alter table public.favoritos enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "profiles: dono le/edita" on public.profiles;
create policy "profiles: dono le/edita" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "cofres: dono le/edita" on public.cofres;
create policy "cofres: dono le/edita" on public.cofres
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "movimentos: dono le/edita" on public.movimentos;
create policy "movimentos: dono le/edita" on public.movimentos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "distribuicoes: dono le/edita" on public.distribuicoes;
create policy "distribuicoes: dono le/edita" on public.distribuicoes
  for all using (
    exists (select 1 from public.movimentos m where m.id = movimento_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.movimentos m where m.id = movimento_id and m.user_id = auth.uid())
  );

drop policy if exists "contas_fixas: dono le/edita" on public.contas_fixas;
create policy "contas_fixas: dono le/edita" on public.contas_fixas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favoritos: dono le/edita" on public.favoritos;
create policy "favoritos: dono le/edita" on public.favoritos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions: dono le/edita" on public.push_subscriptions;
create policy "push_subscriptions: dono le/edita" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Você'))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
