-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Moeda por conta (real ou dólar) e, nos movimentos convertidos, o valor original
-- e a cotação usada. Tudo que já existe continua em real.

alter table public.contas
  add column if not exists moeda text not null default 'BRL' check (moeda in ('BRL','USD'));

alter table public.movimentos
  add column if not exists valor_original numeric,
  add column if not exists moeda_original text check (moeda_original in ('BRL','USD')),
  add column if not exists cotacao numeric;
