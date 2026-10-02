'use client';

// Tela pública: carrossel de datas -> chips de horário -> dados -> confirmação.
// Também atende o link de remarcação: /?remarcar=<id do agendamento>
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Clock, User, ChevronLeft, ChevronRight, MessageCircle, Loader2,
  MapPin, CalendarPlus, Download, Link2, Check, RefreshCw, Stethoscope,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import {
  toISO, parseISO, addDias, hhmm, formatBR, dataExtenso, gerarSlots, removerPassados,
  linkGoogleCalendar, baixarICS, linkRemarcar,
} from '@/lib/agenda';

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_NO_CARROSSEL = 60;

export default function AgendarPage() {
  const [clinica, setClinica] = useState(null);
  const [profissionais, setProfissionais] = useState([]);
  const [profId, setProfId] = useState(null);
  const [grade, setGrade] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [erroInit, setErroInit] = useState('');

  const [remarcando, setRemarcando] = useState(null); // agendamento existente (modo remarcar)
  const [aviso, setAviso] = useState('');

  const [dataSel, setDataSel] = useState(null);       // 'yyyy-mm-dd'
  const [horarios, setHorarios] = useState([]);       // [{hora, duracao}]
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [horarioSel, setHorarioSel] = useState(null); // {hora, duracao}

  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '', motivo: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  const carrossel = useRef(null);
  const blocoForm = useRef(null);

  // Carrega clínica, profissionais, grade e bloqueios (e o agendamento, se for remarcação)
  useEffect(() => {
    (async () => {
      const { data: c, error } = await supabase.from('clinicas').select('*').limit(1).single();
      if (error) { setErroInit('Não foi possível carregar a clínica.'); setLoadingInit(false); return; }
      const [{ data: g }, { data: b }, { data: p }] = await Promise.all([
        supabase.from('horarios_disponiveis').select('*').eq('clinica_id', c.id),
        supabase.from('bloqueios_datas').select('*').eq('clinica_id', c.id),
        supabase.from('profissionais').select('*').eq('clinica_id', c.id).eq('ativo', true)
          .order('padrao', { ascending: false }),
      ]);
      const lista = p || [];
      setClinica(c); setGrade(g || []); setBloqueios(b || []); setProfissionais(lista);
      setProfId(lista[0]?.id ?? null); // Profissional Padrão vem pré-selecionado

      const rid = new URLSearchParams(window.location.search).get('remarcar');
      if (rid) {
        const { data: ag } = await supabase.rpc('buscar_agendamento', { p_id: rid });
        const a = ag?.[0];
        if (a && ['pendente', 'confirmado'].includes(a.status)) {
          setRemarcando(a);
          if (a.profissional_id) setProfId(a.profissional_id);
        } else {
          setAviso('Não encontramos uma consulta ativa neste link. Você pode fazer um novo agendamento abaixo.');
        }
      }
      setLoadingInit(false);
    })();
  }, []);

  const slotsDoDia = (d) => removerPassados(gerarSlots(grade, bloqueios, d, profId), d);

  // Próximas datas com pelo menos um horário no modelo semanal
  const datas = useMemo(() => {
    if (!clinica) return [];
    const hoje = new Date();
    const out = [];
    for (let i = 0; i < DIAS_NO_CARROSSEL; i++) {
      const d = addDias(hoje, i);
      if (slotsDoDia(d).length) out.push(d);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinica, grade, bloqueios, profId]);

  // Ao trocar de profissional, limpa a seleção
  function trocarProfissional(id) {
    setProfId(id); setDataSel(null); setHorarios([]); setHorarioSel(null);
  }

  async function escolherData(d) {
    const iso = toISO(d);
    setDataSel(iso); setHorarioSel(null); setHorarios([]); setLoadingHorarios(true); setErro('');
    const { data: ocupados, error } = await supabase.rpc('horarios_ocupados', {
      p_clinica: clinica.id, p_data: iso, p_profissional: profId,
    });
    if (error) { setErro('Erro ao carregar horários.'); setLoadingHorarios(false); return; }
    const ocup = new Set((ocupados || []).map((o) => hhmm(o.horario_consulta)));
    setHorarios(slotsDoDia(d).filter((s) => !ocup.has(s.hora)));
    setLoadingHorarios(false);
  }

  function escolherHorario(s) {
    setHorarioSel(s);
    setTimeout(() => blocoForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function setarConflito() {
    setErro('Esse horário acabou de ser reservado. Escolha outro.');
    setHorarioSel(null);
    escolherData(parseISO(dataSel));
  }

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);

    // ----- Remarcação: não pede os dados de novo -----
    if (remarcando) {
      const { error } = await supabase.rpc('remarcar_agendamento', {
        p_id: remarcando.id, p_data: dataSel, p_horario: horarioSel.hora,
      });
      setEnviando(false);
      if (error) {
        if (error.code === '23505') return setarConflito();
        return setErro('Não foi possível remarcar. Tente novamente.');
      }
      setResultado({ id: remarcando.id, nome: remarcando.nome_paciente, dataISO: dataSel, ...horarioSel, remarcado: true });
      return;
    }

    // ----- Novo agendamento -----
    const tel = form.whatsapp.replace(/\D/g, '');
    if (tel.length < 10) { setEnviando(false); setErro('Informe um WhatsApp válido com DDD.'); return; }
    const id = crypto.randomUUID(); // gerado aqui para o paciente não precisar "ler" a tabela
    const { error } = await supabase.from('agendamentos').insert({
      id,
      clinica_id: clinica.id,
      profissional_id: profId,
      nome_paciente: form.nome.trim(),
      telefone_paciente: tel,
      email_paciente: form.email.trim() || null,
      data_consulta: dataSel,
      horario_consulta: horarioSel.hora,
      observacoes: form.motivo.trim() || null,
      status: 'pendente',
    });
    setEnviando(false);
    if (error) {
      if (error.code === '23505') return setarConflito();
      return setErro('Não foi possível agendar. Tente novamente.');
    }
    setResultado({ id, nome: form.nome.trim(), dataISO: dataSel, ...horarioSel, remarcado: false });
  }

  function rolar(dir) {
    carrossel.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  }

  // ---------- estados de tela ----------
  if (loadingInit) return <Centro><Loader2 className="animate-spin text-teal-600" /></Centro>;
  if (erroInit) return <Centro><p className="text-red-600">{erroInit}</p></Centro>;
  if (resultado) return <Confirmacao clinica={clinica} r={resultado} />;

  const periodos = [
    ['Manhã', horarios.filter((s) => Number(s.hora.slice(0, 2)) < 12)],
    ['Tarde e noite', horarios.filter((s) => Number(s.hora.slice(0, 2)) >= 12)],
  ].filter(([, l]) => l.length);

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-white px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{clinica.nome}</h1>
          {clinica.endereco && (
            <p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-500">
              <MapPin className="h-4 w-4" /> {clinica.endereco}
            </p>
          )}
        </header>

        {remarcando && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <b>{remarcando.nome_paciente}</b>, você está remarcando a consulta de{' '}
              <b>{formatBR(remarcando.data_consulta)} às {hhmm(remarcando.horario_consulta)}</b>. Escolha um novo horário.
            </p>
          </div>
        )}
        {aviso && <p className="mb-4 rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">{aviso}</p>}

        {/* Só aparece quando houver mais de um profissional */}
        {profissionais.length > 1 && !remarcando && (
          <Card icone={<Stethoscope className="h-5 w-5" />} titulo="Profissional">
            <select value={profId || ''} onChange={(e) => trocarProfissional(e.target.value)} className="input">
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}{p.especialidade ? ` — ${p.especialidade}` : ''}</option>
              ))}
            </select>
          </Card>
        )}

        {/* 1. Data — carrossel horizontal */}
        <Card icone={<CalendarDays className="h-5 w-5" />} titulo="1. Escolha o dia">
          {datas.length === 0 ? (
            <p className="text-sm text-slate-500">Não há datas disponíveis no momento.</p>
          ) : (
            <div className="relative">
              <button onClick={() => rolar(-1)} aria-label="Datas anteriores"
                className="absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white p-1.5 shadow ring-1 ring-slate-200 hover:bg-slate-50 sm:block">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div ref={carrossel} className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
                {datas.map((d) => {
                  const iso = toISO(d);
                  const sel = iso === dataSel;
                  return (
                    <button key={iso} onClick={() => escolherData(d)}
                      className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-2xl border py-3 transition
                        ${sel ? 'border-teal-600 bg-teal-600 text-white shadow-md'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'}`}>
                      <span className="text-xs uppercase opacity-80">{SEMANA_CURTA[d.getDay()]}</span>
                      <span className="text-xl font-bold leading-tight">{d.getDate()}</span>
                      <span className="text-xs opacity-80">{MES_CURTO[d.getMonth()]}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => rolar(1)} aria-label="Próximas datas"
                className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white p-1.5 shadow ring-1 ring-slate-200 hover:bg-slate-50 sm:block">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </Card>

        {/* 2. Horário — chips */}
        {dataSel && (
          <Card icone={<Clock className="h-5 w-5" />} titulo="2. Escolha o horário">
            <p className="mb-3 text-sm capitalize text-slate-500">{dataExtenso(dataSel)}</p>
            {loadingHorarios && <Loader2 className="animate-spin text-teal-600" />}
            {!loadingHorarios && horarios.length === 0 && (
              <p className="text-sm text-slate-500">Não há horários livres neste dia. Escolha outra data.</p>
            )}
            {periodos.map(([nome, lista]) => (
              <div key={nome} className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{nome}</p>
                <div className="flex flex-wrap gap-2">
                  {lista.map((s) => (
                    <button key={s.hora} onClick={() => escolherHorario(s)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition
                        ${horarioSel?.hora === s.hora ? 'border-teal-600 bg-teal-600 text-white shadow'
                          : 'border-slate-200 bg-white hover:border-teal-500 hover:text-teal-700'}`}>
                      {s.hora}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* 3. Dados (ou só confirmar, na remarcação) */}
        {horarioSel && (
          <div ref={blocoForm}>
            <Card icone={<User className="h-5 w-5" />} titulo={remarcando ? '3. Confirmar novo horário' : '3. Seus dados'}>
              <p className="mb-4 rounded-xl bg-teal-50 p-3 text-sm capitalize text-teal-800">
                {dataExtenso(dataSel)} às <b>{horarioSel.hora}</b>
              </p>
              <form onSubmit={confirmar} className="space-y-4">
                {!remarcando && (
                  <>
                    <Campo label="Nome completo *"><input required className="input" value={form.nome}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
                    <Campo label="WhatsApp (com DDD) *"><input required type="tel" inputMode="tel" placeholder="(11) 99999-8888"
                      className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Campo>
                    <Campo label="E-mail"><input type="email" className="input" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
                    <Campo label="Motivo / sintomas"><textarea rows={3} className="input" value={form.motivo}
                      onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Campo>
                  </>
                )}
                {erro && <p className="text-sm text-red-600">{erro}</p>}
                <button type="submit" disabled={enviando}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-3.5 font-semibold text-white shadow hover:bg-teal-700 disabled:opacity-60">
                  {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {remarcando ? 'Confirmar remarcação' : 'Confirmar agendamento'}
                </button>
              </form>
            </Card>
          </div>
        )}
        {erro && !horarioSel && <p className="mt-2 text-center text-sm text-red-600">{erro}</p>}

        <footer className="mt-10 text-center">
          <Link href="/admin/agendamentos" className="text-xs text-slate-400 hover:text-slate-600">Acesso da clínica</Link>
        </footer>
      </div>

      <style jsx global>{`
        .input { width: 100%; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 0.7rem 0.85rem; outline: none; background: #fff; }
        .input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px #99f6e4; }
      `}</style>
    </main>
  );
}

// ------------------------- Tela de sucesso -------------------------
function Confirmacao({ clinica, r }) {
  const [copiado, setCopiado] = useState(false);
  const titulo = `Consulta — ${clinica.nome}`;
  const evento = {
    id: r.id, titulo, dataISO: r.dataISO, hora: r.hora, duracao: r.duracao,
    local: clinica.endereco || '', detalhes: `Consulta agendada com ${clinica.nome}.`,
  };
  const msg = `Olá! Sou ${r.nome} e acabei de ${r.remarcado ? 'remarcar' : 'solicitar'} uma consulta para ${formatBR(r.dataISO)} às ${r.hora}. Gostaria de confirmar meu agendamento.`;
  const linkWpp = `https://wa.me/${clinica.telefone_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;

  async function copiar() {
    try { await navigator.clipboard.writeText(linkRemarcar(r.id)); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch {}
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50 to-white p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-teal-100">
          <svg viewBox="0 0 52 52" className="h-12 w-12">
            <circle className="sucesso-circulo" cx="26" cy="26" r="23" fill="none" stroke="#0d9488" strokeWidth="3" />
            <path className="sucesso-check" fill="none" stroke="#0d9488" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M15 27l8 8 14-16" />
          </svg>
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold text-slate-800">
          {r.remarcado ? 'Consulta remarcada!' : 'Solicitação enviada!'}
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">A clínica vai confirmar com você pelo WhatsApp.</p>

        <dl className="mt-6 divide-y rounded-2xl bg-slate-50 text-sm">
          <Linha rotulo="Paciente" valor={r.nome} />
          <Linha rotulo="Data" valor={<span className="capitalize">{dataExtenso(r.dataISO)}</span>} />
          <Linha rotulo="Horário" valor={`${r.hora} (${r.duracao} min)`} />
          <Linha rotulo="Local" valor={clinica.endereco || clinica.nome} />
        </dl>

        <div className="mt-6 space-y-2">
          <a href={linkWpp} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 font-semibold text-white hover:bg-green-600">
            <MessageCircle className="h-5 w-5" /> Confirmar no WhatsApp da Clínica
          </a>
          <div className="grid grid-cols-2 gap-2">
            <a href={linkGoogleCalendar(evento)} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium hover:bg-slate-50">
              <CalendarPlus className="h-4 w-4" /> Google Agenda
            </a>
            <button onClick={() => baixarICS(evento)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium hover:bg-slate-50">
              <Download className="h-4 w-4" /> iCal (.ics)
            </button>
          </div>
          <button onClick={copiar}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium hover:bg-slate-50">
            {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
            {copiado ? 'Link copiado!' : 'Copiar link para remarcar'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .sucesso-circulo { stroke-dasharray: 145; stroke-dashoffset: 145; animation: tracar 0.6s ease-out forwards; }
        .sucesso-check { stroke-dasharray: 40; stroke-dashoffset: 40; animation: tracar 0.4s 0.5s ease-out forwards; }
        @keyframes tracar { to { stroke-dashoffset: 0; } }
      `}</style>
    </main>
  );
}

// ------------------------- UI auxiliar -------------------------
const Centro = ({ children }) => <main className="flex min-h-screen items-center justify-center bg-teal-50 p-4">{children}</main>;
const Card = ({ icone, titulo, children }) => (
  <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
    <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
      <span className="text-teal-600">{icone}</span> {titulo}
    </h2>
    {children}
  </section>
);
const Campo = ({ label, children }) => (
  <label className="block text-sm text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>
);
const Linha = ({ rotulo, valor }) => (
  <div className="flex justify-between gap-4 px-4 py-3">
    <dt className="text-slate-500">{rotulo}</dt><dd className="text-right font-medium text-slate-800">{valor}</dd>
  </div>
);
