-- Rode esse arquivo inteiro no SQL Editor do Supabase.
-- Contas conjuntas: mais de uma pessoa pode ser dona da mesma conta (ex: uma PJ com
-- dois sócios, ou uma conta pessoal do casal). Quem é membro de uma conta vê e mexe
-- em tudo dela: cofres, movimentos, contas fixas, anotações e arquivos.
-- Pra entrar, um membro gera um código de convite no app e a outra pessoa digita.

-- 1) Quem participa de cada conta
create table if not exists public.conta_membros (
  conta_id uuid not null references public.contas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'dono' check (papel in ('dono','membro')),
  created_at timestamptz not null default now(),
  primary key (conta_id, user_id)
);
alter table public.conta_membros enable row level security;

-- Quem criou cada conta que já existe vira dono dela
insert into public.conta_membros (conta_id, user_id, papel)
select id, user_id, 'dono' from public.contas
on conflict (conta_id, user_id) do nothing;

-- 2) Funções de acesso (security definer: olham conta_membros sem esbarrar no RLS)
create or replace function public.eh_membro(p_conta uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conta_membros m where m.conta_id = p_conta and m.user_id = auth.uid());
$$;

-- Linha de uma conta: acesso de quem é membro. Linha sem conta (antiga): só de quem criou.
create or replace function public.acesso_linha(p_conta uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_conta is null then p_user = auth.uid() else public.eh_membro(p_conta) end;
$$;

create or replace function public.acesso_cofre(p_cofre uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cofres c where c.id = p_cofre and public.acesso_linha(c.conta_id, c.user_id));
$$;

-- 3) Quem cria uma conta entra como dono automaticamente
create or replace function public.conta_criada_add_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.conta_membros (conta_id, user_id, papel) values (new.id, new.user_id, 'dono')
  on conflict (conta_id, user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists conta_criada_add_dono on public.contas;
create trigger conta_criada_add_dono after insert on public.contas
  for each row execute function public.conta_criada_add_dono();

-- 4) Regras de acesso (RLS)
drop policy if exists "conta_membros: membros veem" on public.conta_membros;
create policy "conta_membros: membros veem" on public.conta_membros
  for select using (public.eh_membro(conta_id));

drop policy if exists "contas: dono le/edita" on public.contas;
drop policy if exists "contas: membros veem" on public.contas;
drop policy if exists "contas: cria a propria" on public.contas;
drop policy if exists "contas: membros editam" on public.contas;
drop policy if exists "contas: quem criou apaga" on public.contas;
create policy "contas: membros veem" on public.contas
  for select using (public.eh_membro(id) or user_id = auth.uid());
create policy "contas: cria a propria" on public.contas
  for insert with check (user_id = auth.uid());
create policy "contas: membros editam" on public.contas
  for update using (public.eh_membro(id)) with check (public.eh_membro(id));
create policy "contas: quem criou apaga" on public.contas
  for delete using (user_id = auth.uid());

drop policy if exists "cofres: dono le/edita" on public.cofres;
drop policy if exists "cofres: membros da conta" on public.cofres;
create policy "cofres: membros da conta" on public.cofres
  for all using (public.acesso_linha(conta_id, user_id)) with check (public.acesso_linha(conta_id, user_id));

drop policy if exists "movimentos: dono le/edita" on public.movimentos;
drop policy if exists "movimentos: membros da conta" on public.movimentos;
create policy "movimentos: membros da conta" on public.movimentos
  for all using (public.acesso_linha(conta_id, user_id)) with check (public.acesso_linha(conta_id, user_id));

drop policy if exists "distribuicoes: dono le/edita" on public.distribuicoes;
drop policy if exists "distribuicoes: membros da conta" on public.distribuicoes;
create policy "distribuicoes: membros da conta" on public.distribuicoes
  for all using (
    exists (select 1 from public.movimentos m where m.id = movimento_id and public.acesso_linha(m.conta_id, m.user_id))
  ) with check (
    exists (select 1 from public.movimentos m where m.id = movimento_id and public.acesso_linha(m.conta_id, m.user_id))
  );

drop policy if exists "contas_fixas: dono le/edita" on public.contas_fixas;
drop policy if exists "contas_fixas: membros da conta" on public.contas_fixas;
create policy "contas_fixas: membros da conta" on public.contas_fixas
  for all using (
    case when cofre_id is null then user_id = auth.uid() else public.acesso_cofre(cofre_id) end
  ) with check (
    case when cofre_id is null then user_id = auth.uid() else public.acesso_cofre(cofre_id) end
  );

drop policy if exists "cofre_anotacoes: dono le/edita" on public.cofre_anotacoes;
drop policy if exists "cofre_anotacoes: membros da conta" on public.cofre_anotacoes;
create policy "cofre_anotacoes: membros da conta" on public.cofre_anotacoes
  for all using (public.acesso_cofre(cofre_id)) with check (public.acesso_cofre(cofre_id));

drop policy if exists "cofre_arquivos: dono le/edita" on public.cofre_arquivos;
drop policy if exists "cofre_arquivos: membros da conta" on public.cofre_arquivos;
create policy "cofre_arquivos: membros da conta" on public.cofre_arquivos
  for all using (public.acesso_cofre(cofre_id)) with check (public.acesso_cofre(cofre_id));

-- 5) Convites: código de 8 letras, vale 7 dias, usa uma vez
create table if not exists public.conta_convites (
  codigo text primary key,
  conta_id uuid not null references public.contas(id) on delete cascade,
  criado_por uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);
alter table public.conta_convites enable row level security;
drop policy if exists "conta_convites: membros veem" on public.conta_convites;
create policy "conta_convites: membros veem" on public.conta_convites
  for select using (public.eh_membro(conta_id));

create or replace function public.criar_convite(p_conta uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if auth.uid() is null or not public.eh_membro(p_conta) then
    raise exception 'Você não participa dessa conta';
  end if;
  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.conta_convites where codigo = v_codigo);
  end loop;
  insert into public.conta_convites (codigo, conta_id, criado_por) values (v_codigo, p_conta, auth.uid());
  return v_codigo;
end;
$$;

create or replace function public.aceitar_convite(p_codigo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.conta_convites;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  select * into c from public.conta_convites where codigo = upper(trim(p_codigo)) for update;
  if not found then raise exception 'Código não encontrado'; end if;
  if public.eh_membro(c.conta_id) then return c.conta_id; end if;
  if c.usado_por is not null then raise exception 'Esse código já foi usado'; end if;
  if c.expira_em < now() then raise exception 'Esse código expirou'; end if;
  insert into public.conta_membros (conta_id, user_id, papel) values (c.conta_id, auth.uid(), 'dono')
  on conflict (conta_id, user_id) do nothing;
  update public.conta_convites set usado_por = auth.uid(), usado_em = now() where codigo = c.codigo;
  return c.conta_id;
end;
$$;

-- Membros de uma conta, com nome (ou e-mail) pra mostrar no app
create or replace function public.listar_membros(p_conta uuid)
returns table (user_id uuid, nome text, eu boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_membro(p_conta) then return; end if;
  return query
    select m.user_id, coalesce(nullif(p.nome, 'Você'), u.email, 'Alguém')::text, m.user_id = auth.uid()
    from public.conta_membros m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.conta_id = p_conta
    order by m.created_at;
end;
$$;

-- Sair de uma conta (ou tirar alguém). Não deixa a conta sem nenhum dono.
create or replace function public.remover_membro(p_conta uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_novo uuid;
begin
  if not public.eh_membro(p_conta) then raise exception 'Você não participa dessa conta'; end if;
  if (select count(*) from public.conta_membros where conta_id = p_conta) <= 1 then
    raise exception 'A conta precisa ter pelo menos uma pessoa';
  end if;
  delete from public.conta_membros where conta_id = p_conta and user_id = p_user;
  -- Se quem saiu tinha criado a conta, ela passa pra outro dono (senão some quando a pessoa excluir o login)
  select user_id into v_novo from public.conta_membros where conta_id = p_conta order by created_at limit 1;
  update public.contas set user_id = v_novo where id = p_conta and user_id = p_user;
end;
$$;

-- 6) Excluir o login não apaga o que é compartilhado: passa pra outro dono antes
create or replace function public.repassar_compartilhado() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_novo uuid;
begin
  for r in select m.conta_id from public.conta_membros m where m.user_id = old.id loop
    select user_id into v_novo from public.conta_membros
      where conta_id = r.conta_id and user_id <> old.id order by created_at limit 1;
    if v_novo is not null then
      update public.contas set user_id = v_novo where id = r.conta_id and user_id = old.id;
      update public.cofres set user_id = v_novo where conta_id = r.conta_id and user_id = old.id;
      update public.movimentos set user_id = v_novo where conta_id = r.conta_id and user_id = old.id;
      update public.contas_fixas set user_id = v_novo
        where user_id = old.id and cofre_id in (select id from public.cofres where conta_id = r.conta_id);
      update public.cofre_anotacoes set user_id = v_novo
        where user_id = old.id and cofre_id in (select id from public.cofres where conta_id = r.conta_id);
      update public.cofre_arquivos set user_id = v_novo
        where user_id = old.id and cofre_id in (select id from public.cofres where conta_id = r.conta_id);
    end if;
  end loop;
  return old;
end;
$$;
drop trigger if exists repassar_compartilhado on auth.users;
create trigger repassar_compartilhado before delete on auth.users
  for each row execute function public.repassar_compartilhado();

grant execute on function public.criar_convite(uuid), public.aceitar_convite(text),
  public.listar_membros(uuid), public.remover_membro(uuid, uuid) to authenticated;
