-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Guarda em que dia do mês cada conta fixa vence (1 a 31). Fica vazio nas contas
-- que já existem; dá pra preencher editando cada uma no app.

alter table public.contas_fixas
  add column if not exists dia_vencimento smallint check (dia_vencimento between 1 and 31);
