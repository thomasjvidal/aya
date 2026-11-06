-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- "Vai entrar" que entra sozinho no dia (ex: contrato de 3 meses):
--  auto_entrar   = no dia previsto o valor entra sozinho na conta e já vai pros cofres
--  auto_cofre_id = cofre que recebe tudo (vazio = divide pelas % dos cofres)
--  a_confirmar   = entrou sozinho e ainda falta alguém confirmar que caiu de verdade
-- Pode rodar mais de uma vez.

alter table public.movimentos
  add column if not exists auto_entrar boolean not null default false,
  add column if not exists auto_cofre_id uuid references public.cofres(id) on delete set null,
  add column if not exists a_confirmar boolean not null default false;

create index if not exists movimentos_auto_entrar_idx
  on public.movimentos (tipo, auto_entrar, data_prevista);
