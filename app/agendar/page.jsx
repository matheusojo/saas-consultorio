'use client';

// PASSO 3 — Tela pública de agendamento (data -> horário -> dados -> confirmação)
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, User, CheckCircle2, ChevronLeft, ChevronRight,
  MessageCircle, Loader2, MapPin,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

// ---------- helpers de data (sem fuso: sempre strings yyyy-mm-dd locais) ----------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (t) => t.slice(0, 5);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const formatBR = (iso) => iso.split('-').reverse().join('/');
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS = ['D','S','T','Q','Q','S','S'];

// Gera os horários (HH:MM) de uma data a partir da grade semanal
function gerarSlots(grade, date) {
  const dow = date.getDay();
  const slots = [];
  grade.filter((g) => g.dia_da_semana === dow).forEach((g) => {
    for (let m = toMin(g.horario_inicio); m + g.duracao_consulta_minutos <= toMin(g.horario_fim); m += g.duracao_consulta_minutos) {
      slots.push(fromMin(m));
    }
  });
  return [...new Set(slots)].sort();
}

export default function AgendarPage() {
  const [clinica, setClinica] = useState(null);
  const [grade, setGrade] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [erroInit, setErroInit] = useState('');

  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1); });
  const [dataSel, setDataSel] = useState(null);      // 'yyyy-mm-dd'
  const [horarios, setHorarios] = useState([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [horarioSel, setHorarioSel] = useState(null);

  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '', motivo: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState(false);

  // Carrega clínica, grade semanal e bloqueios uma única vez
  useEffect(() => {
    (async () => {
      const { data: c, error: e1 } = await supabase.from('clinicas').select('*').limit(1).single();
      if (e1) { setErroInit('Não foi possível carregar a clínica.'); setLoadingInit(false); return; }
      const [{ data: g }, { data: b }] = await Promise.all([
        supabase.from('horarios_disponiveis').select('*').eq('clinica_id', c.id),
        supabase.from('bloqueios_datas').select('*').eq('clinica_id', c.id),
      ]);
      setClinica(c); setGrade(g || []); setBloqueios(b || []); setLoadingInit(false);
    })();
  }, []);

  const hojeISO = toISO(new Date());
  const diasComGrade = useMemo(() => new Set(grade.map((g) => g.dia_da_semana)), [grade]);
  const bloqueada = (iso) => bloqueios.some((b) => iso >= b.data_inicio && iso <= b.data_fim);
  const diaDisponivel = (d) => {
    const iso = toISO(d);
    return iso >= hojeISO && diasComGrade.has(d.getDay()) && !bloqueada(iso);
  };

  // Ao escolher a data, busca horários ocupados e calcula os livres
  async function escolherData(d) {
    const iso = toISO(d);
    setDataSel(iso); setHorarioSel(null); setHorarios([]); setLoadingHorarios(true); setErro('');
    const { data: ocupados, error } = await supabase.rpc('horarios_ocupados', { p_clinica: clinica.id, p_data: iso });
    if (error) { setErro('Erro ao carregar horários.'); setLoadingHorarios(false); return; }
    const ocup = new Set((ocupados || []).map((o) => hhmm(o.horario_consulta)));
    const agora = new Date();
    const minAgora = agora.getHours() * 60 + agora.getMinutes();
    setHorarios(
      gerarSlots(grade, d).filter((h) => !ocup.has(h) && (iso !== hojeISO || toMin(h) > minAgora))
    );
    setLoadingHorarios(false);
  }

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    const tel = form.whatsapp.replace(/\D/g, '');
    if (tel.length < 10) { setErro('Informe um WhatsApp válido com DDD.'); return; }
    setEnviando(true);
    const { error } = await supabase.from('agendamentos').insert({
      clinica_id: clinica.id,
      nome_paciente: form.nome.trim(),
      telefone_paciente: tel,
      email_paciente: form.email.trim() || null,
      data_consulta: dataSel,
      horario_consulta: horarioSel,
      observacoes: form.motivo.trim() || null,
      status: 'pendente',
    });
    setEnviando(false);
    if (error) {
      // 23505 = índice único: alguém reservou o mesmo horário
      if (error.code === '23505') {
        setErro('Esse horário acabou de ser reservado. Escolha outro.');
        setHorarioSel(null);
        escolherData(new Date(dataSel + 'T00:00:00'));
      } else setErro('Não foi possível agendar. Tente novamente.');
      return;
    }
    setConcluido(true);
  }

  // ---------- estados de tela ----------
  if (loadingInit) return <Centro><Loader2 className="animate-spin text-teal-600" /></Centro>;
  if (erroInit) return <Centro><p className="text-red-600">{erroInit}</p></Centro>;

  // ---------- Tela final com botão do WhatsApp ----------
  if (concluido) {
    const msg = `Olá! Sou ${form.nome} e acabei de solicitar uma consulta para ${formatBR(dataSel)} às ${horarioSel}. Gostaria de confirmar meu agendamento.`;
    const link = `https://wa.me/${clinica.telefone_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    return (
      <Centro>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <CheckCircle2 className="mx-auto h-16 w-16 text-teal-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-800">Solicitação enviada!</h1>
          <p className="mt-2 text-slate-600">
            {form.nome}, sua consulta está <b>pendente</b> para <b>{formatBR(dataSel)}</b> às <b>{horarioSel}</b>.
          </p>
          <a href={link} target="_blank" rel="noopener noreferrer"
             className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 font-semibold text-white hover:bg-green-600">
            <MessageCircle className="h-5 w-5" /> Confirmar no WhatsApp da Clínica
          </a>
          {clinica.endereco && (
            <p className="mt-4 flex items-center justify-center gap-1 text-sm text-slate-500">
              <MapPin className="h-4 w-4" /> {clinica.endereco}
            </p>
          )}
        </div>
      </Centro>
    );
  }

  // ---------- Calendário do mês ----------
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celulas = [...Array(primeiro.getDay()).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))];
  const mesAtual = new Date(); mesAtual.setDate(1); mesAtual.setHours(0, 0, 0, 0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 to-white px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800">{clinica.nome}</h1>
          <p className="mt-1 text-slate-600">Agende sua consulta em poucos passos</p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* PASSO 1 — Data */}
          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <CalendarDays className="h-5 w-5 text-teal-600" /> 1. Escolha a data
            </h2>
            <div className="mb-3 flex items-center justify-between">
              <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
                disabled={mes <= mesAtual} aria-label="Mês anterior"
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
              <span className="font-medium">{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
              <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
                aria-label="Próximo mês" className="rounded-lg p-2 hover:bg-slate-100"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
              {DIAS.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {celulas.map((d, i) => {
                if (!d) return <div key={i} />;
                const ok = diaDisponivel(d);
                const sel = toISO(d) === dataSel;
                return (
                  <button key={i} disabled={!ok} onClick={() => escolherData(d)}
                    className={`aspect-square rounded-lg text-sm transition
                      ${sel ? 'bg-teal-600 font-bold text-white'
                        : ok ? 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                        : 'cursor-not-allowed text-slate-300'}`}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </section>

          {/* PASSO 2 — Horários */}
          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <Clock className="h-5 w-5 text-teal-600" /> 2. Escolha o horário
            </h2>
            {!dataSel && <p className="text-sm text-slate-500">Selecione uma data para ver os horários.</p>}
            {loadingHorarios && <Loader2 className="animate-spin text-teal-600" />}
            {dataSel && !loadingHorarios && horarios.length === 0 && (
              <p className="text-sm text-slate-500">Não há horários livres nesta data.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {horarios.map((h) => (
                <button key={h} onClick={() => setHorarioSel(h)}
                  className={`rounded-lg border py-2 text-sm font-medium transition
                    ${h === horarioSel ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 hover:border-teal-500'}`}>
                  {h}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* PASSO 3 — Dados + PASSO 4 — Confirmação */}
        {horarioSel && (
          <form onSubmit={confirmar} className="mt-6 rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <User className="h-5 w-5 text-teal-600" /> 3. Seus dados
            </h2>
            <p className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
              Consulta em <b>{formatBR(dataSel)}</b> às <b>{horarioSel}</b>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nome completo *"><input required className="input" value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
              <Campo label="WhatsApp (com DDD) *"><input required type="tel" placeholder="(11) 99999-8888" className="input"
                value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Campo>
              <Campo label="E-mail"><input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
              <Campo label="Motivo / sintomas" full><textarea rows={3} className="input" value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Campo>
            </div>
            {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
            <button type="submit" disabled={enviando}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar agendamento
            </button>
          </form>
        )}
        {erro && !horarioSel && <p className="mt-4 text-center text-sm text-red-600">{erro}</p>}
      </div>

      {/* Estilo reutilizável dos inputs */}
      <style jsx global>{`
        .input { width: 100%; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.6rem 0.75rem; outline: none; }
        .input:focus { border-color: #0d9488; box-shadow: 0 0 0 2px #99f6e4; }
      `}</style>
    </main>
  );
}

const Centro = ({ children }) => <main className="flex min-h-screen items-center justify-center bg-teal-50 p-4">{children}</main>;
const Campo = ({ label, full, children }) => (
  <label className={`block text-sm text-slate-700 ${full ? 'sm:col-span-2' : ''}`}>
    <span className="mb-1 block">{label}</span>{children}
  </label>
);
