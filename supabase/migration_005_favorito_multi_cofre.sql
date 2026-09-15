-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Permite ligar um favorito a mais de um cofre ao mesmo tempo (antes só dava
-- pra escolher um). Cria a tabela nova e já migra o que já estava ligado
-- via a coluna antiga cofre_id.

create table if not exists public.favorito_cofres (
  id uuid primary key default gen_random_uuid(),
  favorito_id uuid not null references public.favoritos(id) on delete cascade,
  cofre_id uuid not null references public.cofres(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(favorito_id, cofre_id)
);

alter table public.favorito_cofres enable row level security;

drop policy if exists "favorito_cofres: dono le/edita" on public.favorito_cofres;
create policy "favorito_cofres: dono le/edita" on public.favorito_cofres
  for all using (
    exists (select 1 from public.favoritos f where f.id = favorito_id and f.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.favoritos f where f.id = favorito_id and f.user_id = auth.uid())
  );

insert into public.favorito_cofres (favorito_id, cofre_id)
select id, cofre_id from public.favoritos
where cofre_id is not null
on conflict (favorito_id, cofre_id) do nothing;
