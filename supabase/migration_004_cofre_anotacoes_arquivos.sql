-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Cria as tabelas de anotações e arquivos por cofre, e o bucket de storage
-- (público pra leitura, só o dono envia/remove) pra guardar os arquivos.

create table if not exists public.cofre_anotacoes (
  id uuid primary key default gen_random_uuid(),
  cofre_id uuid not null references public.cofres(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);

alter table public.cofre_anotacoes enable row level security;
drop policy if exists "cofre_anotacoes: dono le/edita" on public.cofre_anotacoes;
create policy "cofre_anotacoes: dono le/edita" on public.cofre_anotacoes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.cofre_arquivos (
  id uuid primary key default gen_random_uuid(),
  cofre_id uuid not null references public.cofres(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  url text not null,
  tamanho_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.cofre_arquivos enable row level security;
drop policy if exists "cofre_arquivos: dono le/edita" on public.cofre_arquivos;
create policy "cofre_arquivos: dono le/edita" on public.cofre_arquivos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('cofre-arquivos', 'cofre-arquivos', true)
on conflict (id) do nothing;

drop policy if exists "cofre-arquivos: leitura publica" on storage.objects;
create policy "cofre-arquivos: leitura publica" on storage.objects
  for select using (bucket_id = 'cofre-arquivos');

drop policy if exists "cofre-arquivos: dono envia" on storage.objects;
create policy "cofre-arquivos: dono envia" on storage.objects
  for insert with check (bucket_id = 'cofre-arquivos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cofre-arquivos: dono remove" on storage.objects;
create policy "cofre-arquivos: dono remove" on storage.objects
  for delete using (bucket_id = 'cofre-arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
