-- Roda isso no Supabase: SQL Editor > New query > cola > Run
-- Adiciona a coluna que classifica cada cofre (usada pra calcular a tela Hoje)

alter table public.cofres
  add column if not exists tipo text not null default 'guardado'
  check (tipo in ('livre','contas','guardado'));
