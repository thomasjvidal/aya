-- Rode esse arquivo inteiro no SQL Editor do Supabase (depois do 008).
-- Correções de segurança das contas conjuntas:
--  1) Ninguém troca o "criador" de uma conta direto pelo app. Antes, um convidado
--     conseguia se marcar como criador e depois apagar a conta inteira.
--  2) Só quem criou a conta tira outras pessoas. Convidado só pode sair.
--  3) Quem entra por convite entra como 'membro' (não como 'dono').
--  4) handle_new_user com search_path fixo (boa prática do Supabase).
-- Não muda nada no que o app mostra; dá pra rodar antes de atualizar o app.

-- 1) Trava a troca de criador (user_id) da conta, exceto pelas funções do próprio banco
create or replace function public.trava_troca_criador() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id
     and coalesce(current_setting('aya.repasse', true), '') <> '1'
     and auth.uid() is not null then
    raise exception 'Não é possível trocar quem criou a conta';
  end if;
  return new;
end;
$$;
drop trigger if exists trava_troca_criador on public.contas;
create trigger trava_troca_criador before update on public.contas
  for each row execute function public.trava_troca_criador();

-- 2) Sair de uma conta, ou (só quem criou) tirar alguém
create or replace function public.remover_membro(p_conta uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_criador uuid; v_novo uuid;
begin
  if not public.eh_membro(p_conta) then raise exception 'Você não participa dessa conta'; end if;
  select user_id into v_criador from public.contas where id = p_conta;
  if p_user <> auth.uid() and auth.uid() is distinct from v_criador then
    raise exception 'Só quem criou a conta pode tirar outras pessoas';
  end if;
  if (select count(*) from public.conta_membros where conta_id = p_conta) <= 1 then
    raise exception 'A conta precisa ter pelo menos uma pessoa';
  end if;
  delete from public.conta_membros where conta_id = p_conta and user_id = p_user;
  -- Se quem saiu criou a conta, ela passa pra quem entrou primeiro
  if p_user = v_criador then
    select user_id into v_novo from public.conta_membros where conta_id = p_conta order by created_at limit 1;
    perform set_config('aya.repasse', '1', true);
    update public.contas set user_id = v_novo where id = p_conta;
    update public.conta_membros set papel = 'dono' where conta_id = p_conta and user_id = v_novo;
    perform set_config('aya.repasse', '', true);
  end if;
end;
$$;

-- Excluir o login: passa o que é compartilhado pra outra pessoa (agora liberando a trava)
create or replace function public.repassar_compartilhado() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_novo uuid;
begin
  perform set_config('aya.repasse', '1', true);
  for r in select m.conta_id from public.conta_membros m where m.user_id = old.id loop
    select user_id into v_novo from public.conta_membros
      where conta_id = r.conta_id and user_id <> old.id order by created_at limit 1;
    if v_novo is not null then
      update public.contas set user_id = v_novo where id = r.conta_id and user_id = old.id;
      update public.conta_membros set papel = 'dono' where conta_id = r.conta_id and user_id = v_novo;
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
  perform set_config('aya.repasse', '', true);
  return old;
end;
$$;

-- 3) Convite: quem entra passa a ser 'membro' (antes entrava como 'dono')
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
  insert into public.conta_membros (conta_id, user_id, papel) values (c.conta_id, auth.uid(), 'membro')
  on conflict (conta_id, user_id) do nothing;
  update public.conta_convites set usado_por = auth.uid(), usado_em = now() where codigo = c.codigo;
  return c.conta_id;
end;
$$;

-- Quem já entrou por convite deixa de ser 'dono' (só quem criou a conta é)
update public.conta_membros m set papel = 'membro'
from public.contas c
where c.id = m.conta_id and m.user_id <> c.user_id and m.papel = 'dono';

-- 4) Boas práticas: search_path fixo nas funções antigas
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Você'))
  on conflict (id) do nothing;
  insert into public.contas (user_id, nome, tipo) values (new.id, 'Pessoal', 'pessoal');
  return new;
end;
$$;

-- Funções internas não precisam ser chamadas por quem não está logado
revoke execute on function public.criar_convite(uuid), public.aceitar_convite(text),
  public.listar_membros(uuid), public.remover_membro(uuid, uuid) from anon, public;
grant execute on function public.criar_convite(uuid), public.aceitar_convite(text),
  public.listar_membros(uuid), public.remover_membro(uuid, uuid) to authenticated;
