-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Guarda quanto o cofre tinha na última vez que foi marcado "em dia". Assim, ao
-- marcar em dia de novo, a Aya pergunta só pela diferença ("já transferiu os R$ 69?").

alter table public.cofres
  add column if not exists valor_em_dia numeric;
