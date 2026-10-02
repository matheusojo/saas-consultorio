-- =====================================================================
-- PASSO 1 — SCHEMA DO SAAS DE AGENDAMENTO (rodar no SQL Editor do Supabase)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- CLÍNICAS
-- ---------------------------------------------------------------------
create table if not exists public.clinicas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,
  telefone_whatsapp text not null,          -- somente dígitos com DDI, ex: 5511999998888
  endereco          text,
  email             text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PROFISSIONAIS (preparado para o futuro; hoje fica vazio)
-- Quando houver médicos, basta cadastrá-los aqui e preencher profissional_id.
-- ---------------------------------------------------------------------
create table if not exists public.profissionais (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  nome        text not null,
  especialidade text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- HORÁRIOS DISPONÍVEIS (grade semanal)
-- dia_da_semana: 0 = domingo ... 6 = sábado. Pode haver mais de uma
-- linha por dia (ex.: manhã e tarde).
-- ---------------------------------------------------------------------
create table if not exists public.horarios_disponiveis (
  id                        uuid primary key default gen_random_uuid(),
  clinica_id                uuid not null references public.clinicas(id) on delete cascade,
  profissional_id           uuid references public.profissionais(id) on delete cascade, -- null = clínica toda
  dia_da_semana             smallint not null check (dia_da_semana between 0 and 6),
  horario_inicio            time not null,
  horario_fim               time not null,
  duracao_consulta_minutos  integer not null default 30 check (duracao_consulta_minutos > 0),
  ativo                     boolean not null default true,
  created_at                timestamptz not null default now(),
  check (horario_fim > horario_inicio)
);

-- ---------------------------------------------------------------------
-- BLOQUEIOS DE DATAS (feriados, férias, folgas) — intervalo inclusivo
-- ---------------------------------------------------------------------
create table if not exists public.bloqueios_datas (
  id          uuid primary key default gen_random_uuid(),
  clinica_id  uuid not null references public.clinicas(id) on delete cascade,
  profissional_id uuid references public.profissionais(id) on delete cascade,
  data_inicio date not null,
  data_fim    date not null,
  motivo      text,
  created_at  timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

-- ---------------------------------------------------------------------
-- AGENDAMENTOS
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id                uuid primary key default gen_random_uuid(),
  clinica_id        uuid not null references public.clinicas(id) on delete cascade,
  profissional_id   uuid references public.profissionais(id) on delete set null,
  nome_paciente     text not null,
  telefone_paciente text not null,
  email_paciente    text,
  data_consulta     date not null,
  horario_consulta  time not null,
  status            text not null default 'pendente'
                    check (status in ('pendente','confirmado','cancelado')),
  observacoes       text,
  created_at        timestamptz not null default now()
);

-- Impede dois agendamentos ativos no mesmo horário (race condition segura).
create unique index if not exists agendamentos_slot_unico
  on public.agendamentos (
    clinica_id,
    coalesce(profissional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data_consulta,
    horario_consulta
  ) where status <> 'cancelado';

create index if not exists agendamentos_data_idx on public.agendamentos (data_consulta);

-- ---------------------------------------------------------------------
-- FUNÇÃO PÚBLICA: horários ocupados em uma data (NÃO expõe dados do paciente)
-- ---------------------------------------------------------------------
create or replace function public.horarios_ocupados(p_clinica uuid, p_data date)
returns table (horario_consulta time)
language sql
security definer
set search_path = public
as $$
  select a.horario_consulta
  from public.agendamentos a
  where a.clinica_id = p_clinica
    and a.data_consulta = p_data
    and a.status <> 'cancelado';
$$;

grant execute on function public.horarios_ocupados(uuid, date) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Público (anon): lê clínica/grade/bloqueios e INSERE agendamentos pendentes.
-- Atendente (authenticated): acesso total.
-- ---------------------------------------------------------------------
alter table public.clinicas              enable row level security;
alter table public.profissionais         enable row level security;
alter table public.horarios_disponiveis  enable row level security;
alter table public.bloqueios_datas       enable row level security;
alter table public.agendamentos          enable row level security;

create policy "publico le clinicas"       on public.clinicas             for select using (true);
create policy "publico le profissionais"  on public.profissionais        for select using (ativo);
create policy "publico le horarios"       on public.horarios_disponiveis for select using (ativo);
create policy "publico le bloqueios"      on public.bloqueios_datas      for select using (true);

create policy "publico cria agendamento"  on public.agendamentos
  for insert to anon, authenticated
  with check (status = 'pendente');

create policy "admin total clinicas"      on public.clinicas             for all to authenticated using (true) with check (true);
create policy "admin total profissionais" on public.profissionais        for all to authenticated using (true) with check (true);
create policy "admin total horarios"      on public.horarios_disponiveis for all to authenticated using (true) with check (true);
create policy "admin total bloqueios"     on public.bloqueios_datas      for all to authenticated using (true) with check (true);
create policy "admin total agendamentos"  on public.agendamentos         for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- DADOS INICIAIS (ajuste nome/WhatsApp/endereço)
-- ---------------------------------------------------------------------
with c as (
  insert into public.clinicas (nome, telefone_whatsapp, endereco)
  values ('Minha Clínica', '5511999998888', 'Rua Exemplo, 123 - Centro')
  returning id
)
insert into public.horarios_disponiveis (clinica_id, dia_da_semana, horario_inicio, horario_fim, duracao_consulta_minutos)
select c.id, d, h.ini::time, h.fim::time, 30
from c, generate_series(1,5) d,
     (values ('08:00','12:00'), ('14:00','18:00')) as h(ini, fim);
