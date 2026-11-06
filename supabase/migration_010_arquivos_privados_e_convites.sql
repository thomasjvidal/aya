-- Rode esse arquivo inteiro no SQL Editor do Supabase (depois do 009),
-- JUNTO com a atualização do app que abre os arquivos por link temporário.
--  1) Arquivos dos cofres (comprovantes etc.) deixam de ser públicos: só quem
--     participa da conta do cofre vê, e o app abre por um link que vale 10 min.
--  2) Fotos de perfil continuam abrindo pelo link, mas ninguém lista as fotos dos outros.
--  3) Código de convite: no máximo 10 códigos errados por hora por pessoa.
--  4) Aparelhos do app de iPhone, pra receber notificações (APNs).

-- 1) Arquivos dos cofres: bucket privado
update storage.buckets set public = false where id = 'cofre-arquivos';

-- Caminho do arquivo: <quem enviou>/<id do cofre>/<nome>
create or replace function public.acesso_arquivo_cofre(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (storage.foldername(p_nome))[2] ~ '^[0-9a-fA-F-]{36}$'
      then public.acesso_cofre(((storage.foldername(p_nome))[2])::uuid)
    else (storage.foldername(p_nome))[1] = auth.uid()::text
  end;
$$;

drop policy if exists "cofre-arquivos: leitura publica" on storage.objects;
drop policy if exists "cofre-arquivos: membros leem" on storage.objects;
create policy "cofre-arquivos: membros leem" on storage.objects
  for select to authenticated
  using (bucket_id = 'cofre-arquivos' and public.acesso_arquivo_cofre(name));

drop policy if exists "cofre-arquivos: dono envia" on storage.objects;
create policy "cofre-arquivos: dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cofre-arquivos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.acesso_arquivo_cofre(name));

drop policy if exists "cofre-arquivos: dono remove" on storage.objects;
drop policy if exists "cofre-arquivos: membros removem" on storage.objects;
create policy "cofre-arquivos: membros removem" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cofre-arquivos' and public.acesso_arquivo_cofre(name));

-- 2) Fotos de perfil: o link público continua funcionando, mas listar só a própria pasta
drop policy if exists "avatars: leitura publica" on storage.objects;
drop policy if exists "avatars: dono le" on storage.objects;
create policy "avatars: dono le" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Limite de tentativas de código de convite
create table if not exists public.convite_tentativas (
  user_id uuid not null references auth.users(id) on delete cascade,
  em timestamptz not null default now()
);
create index if not exists convite_tentativas_user_em on public.convite_tentativas (user_id, em);
alter table public.convite_tentativas enable row level security;
-- Sem policy: o app não lê nem escreve aqui, só a função abaixo.

-- Código errado agora volta vazio (sem erro), pra tentativa ficar registrada.
create or replace function public.aceitar_convite(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.conta_convites;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if (select count(*) from public.convite_tentativas
      where user_id = auth.uid() and em > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas tentativas. Tente de novo daqui a uma hora';
  end if;
  select * into c from public.conta_convites where codigo = upper(trim(p_codigo)) for update;
  if not found then
    insert into public.convite_tentativas (user_id) values (auth.uid());
    delete from public.convite_tentativas where em < now() - interval '1 day';
    return null;
  end if;
  if public.eh_membro(c.conta_id) then return c.conta_id; end if;
  if c.usado_por is not null then raise exception 'Esse código já foi usado'; end if;
  if c.expira_em < now() then raise exception 'Esse código expirou'; end if;
  insert into public.conta_membros (conta_id, user_id, papel) values (c.conta_id, auth.uid(), 'membro')
  on conflict (conta_id, user_id) do nothing;
  update public.conta_convites set usado_por = auth.uid(), usado_em = now() where codigo = c.codigo;
  return c.conta_id;
end;
$$;
revoke execute on function public.aceitar_convite(text) from anon, public;
grant execute on function public.aceitar_convite(text) to authenticated;

-- 4) Aparelhos do app de iPhone (token do APNs). O nudge_token é usado pelos atalhos.
create table if not exists public.dispositivos_ios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  nudge_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.dispositivos_ios enable row level security;
drop policy if exists "dispositivos_ios: dono le/edita" on public.dispositivos_ios;
create policy "dispositivos_ios: dono le/edita" on public.dispositivos_ios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
