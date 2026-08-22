-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Ele cria as contas PF/PJ, aponta seus cofres e movimentos de hoje pra uma
-- conta "Pessoal" automática (nada muda visualmente até você criar uma
-- segunda conta no app), e adiciona a coluna de ordem dos cofres.

-- 1) Tabela de contas (Pessoal / PJ)
create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'pessoal' check (tipo in ('pessoal','pj')),
  created_at timestamptz not null default now()
);

alter table public.contas enable row level security;
drop policy if exists "contas: dono le/edita" on public.contas;
create policy "contas: dono le/edita" on public.contas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Toda conta de usuário que já existe ganha uma conta "Pessoal"
insert into public.contas (user_id, nome, tipo)
select u.id, 'Pessoal', 'pessoal'
from auth.users u
where not exists (
  select 1 from public.contas c where c.user_id = u.id and c.tipo = 'pessoal'
);

-- 3) A partir de agora, todo usuário novo também ganha a conta Pessoal automaticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Você'))
  on conflict (id) do nothing;
  insert into public.contas (user_id, nome, tipo) values (new.id, 'Pessoal', 'pessoal');
  return new;
end;
$$ language plpgsql security definer;

-- 4) Cofres e movimentos passam a pertencer a uma conta
alter table public.cofres add column if not exists conta_id uuid references public.contas(id) on delete cascade;
alter table public.movimentos add column if not exists conta_id uuid references public.contas(id) on delete cascade;

update public.cofres cf
set conta_id = c.id
from public.contas c
where c.user_id = cf.user_id and c.tipo = 'pessoal' and cf.conta_id is null;

update public.movimentos m
set conta_id = c.id
from public.contas c
where c.user_id = m.user_id and c.tipo = 'pessoal' and m.conta_id is null;

-- 5) Ordem dos cofres (pra poder reordenar arrastando/movendo na lista)
alter table public.cofres add column if not exists ordem integer;

update public.cofres cf
set ordem = sub.rn
from (
  select id, row_number() over (partition by user_id order by created_at asc) as rn
  from public.cofres
) sub
where cf.id = sub.id and cf.ordem is null;
