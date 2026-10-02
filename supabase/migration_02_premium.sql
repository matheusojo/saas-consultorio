-- =====================================================================
-- MIGRAÇÃO 02 — "SaaS Premium" (rodar UMA vez no SQL Editor do Supabase)
-- É segura para rodar mais de uma vez. Rode ANTES de publicar o código novo.
-- =====================================================================

-- 1) NOVO STATUS "atendido" ------------------------------------------
alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos
  add constraint agendamentos_status_check
  check (status in ('pendente','confirmado','cancelado','atendido'));

-- 2) BLOQUEIOS POR TURNO ---------------------------------------------
-- horario_inicio/fim nulos = dia inteiro. Preenchidos = só aquele intervalo.
alter table public.bloqueios_datas
  add column if not exists horario_inicio time,
  add column if not exists horario_fim time;

alter table public.bloqueios_datas drop constraint if exists bloqueios_turno_check;
alter table public.bloqueios_datas
  add constraint bloqueios_turno_check
  check ((horario_inicio is null and horario_fim is null)
      or (horario_inicio is not null and horario_fim > horario_inicio));

-- 3) MULTI-PROFISSIONAIS: "PROFISSIONAL PADRÃO" -----------------------
alter table public.profissionais add column if not exists padrao boolean not null default false;

-- Só um profissional padrão por clínica
create unique index if not exists profissional_padrao_unico
  on public.profissionais (clinica_id) where padrao;

-- Cria o profissional padrão para cada clínica que ainda não tem
insert into public.profissionais (clinica_id, nome, padrao)
select c.id, 'Atendimento geral', true
from public.clinicas c
where not exists (select 1 from public.profissionais p where p.clinica_id = c.id and p.padrao);

-- Liga o que já existe ao profissional padrão
update public.horarios_disponiveis h set profissional_id = p.id
from public.profissionais p
where p.clinica_id = h.clinica_id and p.padrao and h.profissional_id is null;

update public.agendamentos a set profissional_id = p.id
from public.profissionais p
where p.clinica_id = a.clinica_id and p.padrao and a.profissional_id is null;

-- Novos registros sem profissional recebem o padrão automaticamente
create or replace function public.set_profissional_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profissional_id is null then
    select id into new.profissional_id
    from public.profissionais
    where clinica_id = new.clinica_id and padrao
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_horarios_prof_padrao on public.horarios_disponiveis;
create trigger trg_horarios_prof_padrao before insert on public.horarios_disponiveis
  for each row execute function public.set_profissional_padrao();

drop trigger if exists trg_agendamentos_prof_padrao on public.agendamentos;
create trigger trg_agendamentos_prof_padrao before insert on public.agendamentos
  for each row execute function public.set_profissional_padrao();

-- 4) FUNÇÕES PÚBLICAS --------------------------------------------------
-- Horários ocupados (agora opcionalmente por profissional)
drop function if exists public.horarios_ocupados(uuid, date);
create or replace function public.horarios_ocupados(
  p_clinica uuid, p_data date, p_profissional uuid default null
)
returns table (horario_consulta time)
language sql
security definer
set search_path = public
as $$
  select a.horario_consulta
  from public.agendamentos a
  where a.clinica_id = p_clinica
    and a.data_consulta = p_data
    and a.status <> 'cancelado'
    and (p_profissional is null or a.profissional_id = p_profissional);
$$;
grant execute on function public.horarios_ocupados(uuid, date, uuid) to anon, authenticated;

-- Dados mínimos de UM agendamento a partir do seu id (o uuid funciona como "senha"
-- do link de remarcação enviado ao paciente).
create or replace function public.buscar_agendamento(p_id uuid)
returns table (id uuid, nome_paciente text, data_consulta date,
               horario_consulta time, status text, profissional_id uuid)
language sql
security definer
set search_path = public
as $$
  select a.id, a.nome_paciente, a.data_consulta, a.horario_consulta, a.status, a.profissional_id
  from public.agendamentos a
  where a.id = p_id;
$$;
grant execute on function public.buscar_agendamento(uuid) to anon, authenticated;

-- Remarcação feita pelo próprio paciente (volta para "pendente")
create or replace function public.remarcar_agendamento(p_id uuid, p_data date, p_horario time)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'data_passada';
  end if;

  update public.agendamentos
     set data_consulta = p_data, horario_consulta = p_horario, status = 'pendente'
   where id = p_id and status in ('pendente','confirmado');

  if not found then
    raise exception 'agendamento_indisponivel';
  end if;
end;
$$;
grant execute on function public.remarcar_agendamento(uuid, date, time) to anon, authenticated;
