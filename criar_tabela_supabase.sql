-- New Válvulas — cria a tabela do app num projeto Supabase novo.
-- Cole este arquivo inteiro em SQL Editor e clique em Run. Pode rodar mais de uma vez.
--
-- O app grava tudo nesta tabela: a linha "principal" leva OS, clientes, fabricantes e taxas;
-- cada foto fica numa linha própria ("foto_<código>").
-- Acesso aberto, sem login (o app usa só a chave pública). Para fechar com login um dia,
-- veja seguranca_supabase.sql.

create table if not exists public.inspecao_valvulas (
  id text primary key,
  dados jsonb,
  atualizado_em timestamptz default now()
);

alter table public.inspecao_valvulas enable row level security;

drop policy if exists "app" on public.inspecao_valvulas;
create policy "app" on public.inspecao_valvulas
  for all to anon, authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.inspecao_valvulas to anon, authenticated;
