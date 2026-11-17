-- New Válvulas — fecha a tabela do app: só contas autorizadas da empresa leem e gravam.
--
-- ANTES de rodar:
--   1. Painel Supabase > Authentication > Users: crie a(s) conta(s) da empresa (e-mail e senha).
--   2. Painel Supabase > Authentication > Sign In / Providers: desligue "Allow new users to sign up".
--   3. Publique a versão nova do app e entre com a conta em todos os aparelhos.
--   4. Troque os e-mails de exemplo no fim deste arquivo pelos e-mails reais.
-- Depois cole este arquivo inteiro em SQL Editor e execute. Pode rodar mais de uma vez.

-- Lista de e-mails que podem usar o app. Só o painel mexe nela (sem regra de acesso = fechada para o app).
create table if not exists public.nv_usuarios (email text primary key);
alter table public.nv_usuarios enable row level security;
revoke all on public.nv_usuarios from anon, authenticated;

-- Verdadeiro quando quem está chamando entrou com um e-mail da lista.
create or replace function public.nv_autorizado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nv_usuarios u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.nv_autorizado() from public;
grant execute on function public.nv_autorizado() to authenticated;

-- Liga a proteção por linha e apaga qualquer regra antiga (inclusive a que deixava a tabela aberta).
alter table public.inspecao_valvulas enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'inspecao_valvulas'
  loop
    execute format('drop policy %I on public.inspecao_valvulas', p.policyname);
  end loop;
end $$;

-- Quem não entrou não tem acesso nenhum; quem entrou só passa se estiver na lista.
revoke all on public.inspecao_valvulas from anon;
grant select, insert, update, delete on public.inspecao_valvulas to authenticated;
create policy nv_equipe on public.inspecao_valvulas
  for all to authenticated
  using (public.nv_autorizado())
  with check (public.nv_autorizado());

-- E-mails autorizados: TROQUE pelos reais (um por linha).
insert into public.nv_usuarios (email) values
  ('troque-por-seu-email@exemplo.com.br')
on conflict do nothing;
