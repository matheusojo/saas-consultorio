'use client';

// PASSO 4 — Painel da clínica: agendamentos, lembretes WhatsApp e grade de horários.
// Acesso protegido por login Supabase Auth (crie o usuário em Authentication > Users).
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MessageCircle, Loader2, LogOut, Plus, Trash2, CalendarClock, ListChecks, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (t) => t.slice(0, 5);
const formatBR = (iso) => iso.split('-').reverse().join('/');
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const COR_STATUS = {
  pendente: 'bg-amber-100 text-amber-800',
  confirmado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function AdminAgendamentosPage() {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <Tela><Loader2 className="animate-spin text-teal-600" /></Tela>;
  if (!sessao) return <Login />;
  return <Painel />;
}

// ------------------------------- LOGIN -------------------------------
function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function entrar(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro('E-mail ou senha inválidos.');
  }
  return (
    <Tela>
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow">
        <h1 className="text-xl font-bold text-slate-800">Painel da Clínica</h1>
        <input type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-200 p-2.5" />
        <input type="password" required placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)}
          className="w-full rounded-lg border border-slate-200 p-2.5" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white hover:bg-teal-700">Entrar</button>
      </form>
    </Tela>
  );
}

// ------------------------------- PAINEL -------------------------------
function Painel() {
  const [aba, setAba] = useState('agenda');
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <h1 className="text-lg font-bold text-slate-800">Painel da Clínica</h1>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-4">
          <Aba ativa={aba === 'agenda'} onClick={() => setAba('agenda')} icon={<ListChecks className="h-4 w-4" />}>Agendamentos</Aba>
          <Aba ativa={aba === 'horarios'} onClick={() => setAba('horarios')} icon={<CalendarClock className="h-4 w-4" />}>Horários de funcionamento</Aba>
          <Aba ativa={aba === 'clinica'} onClick={() => setAba('clinica')} icon={<Building2 className="h-4 w-4" />}>Dados da clínica</Aba>
        </nav>
      </header>
      <div className="mx-auto max-w-5xl p-4">
        {aba === 'agenda' && <ListaAgendamentos />}
        {aba === 'horarios' && <ConfigHorarios />}
        {aba === 'clinica' && <DadosClinica />}
      </div>
    </main>
  );
}

// ------------------------- LISTA DE AGENDAMENTOS -------------------------
function ListaAgendamentos() {
  const [filtro, setFiltro] = useState('hoje'); // hoje | proximos | historico
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clinica, setClinica] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const hoje = toISO(new Date());
    let q = supabase.from('agendamentos').select('*');
    if (filtro === 'hoje') q = q.eq('data_consulta', hoje).order('horario_consulta');
    if (filtro === 'proximos') q = q.gt('data_consulta', hoje).order('data_consulta').order('horario_consulta');
    if (filtro === 'historico') q = q.lt('data_consulta', hoje).order('data_consulta', { ascending: false });
    const { data } = await q;
    setItens(data || []);
    setLoading(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { supabase.from('clinicas').select('nome').limit(1).single().then(({ data }) => setClinica(data)); }, []);

  async function mudarStatus(id, status) {
    const { error } = await supabase.from('agendamentos').update({ status }).eq('id', id);
    if (!error) setItens((l) => l.map((a) => (a.id === id ? { ...a, status } : a)));
  }

  // Monta o link do WhatsApp do paciente com lembrete pronto
  function linkLembrete(a) {
    let tel = a.telefone_paciente.replace(/\D/g, '');
    if (tel.length <= 11) tel = '55' + tel; // assume Brasil se vier sem DDI
    const msg = `Olá, ${a.nome_paciente}! Lembramos da sua consulta${clinica ? ` na ${clinica.nome}` : ''} no dia ${formatBR(a.data_consulta)} às ${hhmm(a.horario_consulta)}. Poderia confirmar sua presença?`;
    return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <>
      <div className="mb-4 flex gap-2">
        {[['hoje', 'Hoje'], ['proximos', 'Próximos dias'], ['historico', 'Histórico']].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${filtro === k ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <Loader2 className="animate-spin text-teal-600" />
        : itens.length === 0 ? <p className="text-slate-500">Nenhum agendamento neste filtro.</p>
        : (
          <ul className="space-y-3">
            {itens.map((a) => (
              <li key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{a.nome_paciente}</p>
                    <p className="text-sm text-slate-600">{formatBR(a.data_consulta)} às {hhmm(a.horario_consulta)}</p>
                    <p className="text-sm text-slate-500">{a.telefone_paciente}{a.email_paciente && ` · ${a.email_paciente}`}</p>
                    {a.observacoes && <p className="mt-1 text-sm italic text-slate-500">“{a.observacoes}”</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${COR_STATUS[a.status]}`}>{a.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn onClick={() => mudarStatus(a.id, 'confirmado')} disabled={a.status === 'confirmado'} cor="green"><CheckCircle2 className="h-4 w-4" /> Confirmar</Btn>
                  <Btn onClick={() => mudarStatus(a.id, 'cancelado')} disabled={a.status === 'cancelado'} cor="red"><XCircle className="h-4 w-4" /> Cancelar</Btn>
                  <a href={linkLembrete(a)} target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600">
                    <MessageCircle className="h-4 w-4" /> Enviar lembrete via WhatsApp
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

// ------------------------- GRADE DE HORÁRIOS + BLOQUEIOS -------------------------
function ConfigHorarios() {
  const [clinicaId, setClinicaId] = useState(null);
  const [grade, setGrade] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [novo, setNovo] = useState({ dia: 1, ini: '08:00', fim: '12:00', dur: 30 });
  const [bloq, setBloq] = useState({ ini: '', fim: '', motivo: '' });

  const carregar = useCallback(async () => {
    const { data: c } = await supabase.from('clinicas').select('id').limit(1).single();
    setClinicaId(c.id);
    const [{ data: g }, { data: b }] = await Promise.all([
      supabase.from('horarios_disponiveis').select('*').eq('clinica_id', c.id).order('dia_da_semana').order('horario_inicio'),
      supabase.from('bloqueios_datas').select('*').eq('clinica_id', c.id).order('data_inicio'),
    ]);
    setGrade(g || []); setBloqueios(b || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(e) {
    e.preventDefault();
    await supabase.from('horarios_disponiveis').insert({
      clinica_id: clinicaId, dia_da_semana: Number(novo.dia),
      horario_inicio: novo.ini, horario_fim: novo.fim, duracao_consulta_minutos: Number(novo.dur),
    });
    carregar();
  }
  async function alternar(h) {
    await supabase.from('horarios_disponiveis').update({ ativo: !h.ativo }).eq('id', h.id);
    carregar();
  }
  async function remover(id) { await supabase.from('horarios_disponiveis').delete().eq('id', id); carregar(); }

  async function bloquear(e) {
    e.preventDefault();
    await supabase.from('bloqueios_datas').insert({
      clinica_id: clinicaId, data_inicio: bloq.ini, data_fim: bloq.fim || bloq.ini, motivo: bloq.motivo || null,
    });
    setBloq({ ini: '', fim: '', motivo: '' });
    carregar();
  }
  async function desbloquear(id) { await supabase.from('bloqueios_datas').delete().eq('id', id); carregar(); }

  const inp = 'rounded-lg border border-slate-200 p-2 text-sm';
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Horários de funcionamento</h2>
        <ul className="mb-4 space-y-2">
          {grade.map((h) => (
            <li key={h.id} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${h.ativo ? '' : 'opacity-50'}`}>
              <span>{DIAS_SEMANA[h.dia_da_semana]} · {hhmm(h.horario_inicio)}–{hhmm(h.horario_fim)} · {h.duracao_consulta_minutos} min</span>
              <span className="flex gap-2">
                <button onClick={() => alternar(h)} className="text-xs text-teal-700 underline">{h.ativo ? 'Desativar' : 'Ativar'}</button>
                <button onClick={() => remover(h.id)} aria-label="Remover"><Trash2 className="h-4 w-4 text-red-500" /></button>
              </span>
            </li>
          ))}
        </ul>
        <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
          <select className={inp} value={novo.dia} onChange={(e) => setNovo({ ...novo, dia: e.target.value })}>
            {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" className={inp} value={novo.ini} onChange={(e) => setNovo({ ...novo, ini: e.target.value })} />
          <input type="time" className={inp} value={novo.fim} onChange={(e) => setNovo({ ...novo, fim: e.target.value })} />
          <input type="number" min="5" step="5" className={`${inp} w-20`} value={novo.dur} onChange={(e) => setNovo({ ...novo, dur: e.target.value })} title="Duração (min)" />
          <button className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Adicionar</button>
        </form>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Datas bloqueadas (feriados, folgas)</h2>
        <ul className="mb-4 space-y-2">
          {bloqueios.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span>{formatBR(b.data_inicio)}{b.data_fim !== b.data_inicio && ` a ${formatBR(b.data_fim)}`}{b.motivo && ` · ${b.motivo}`}</span>
              <button onClick={() => desbloquear(b.id)} aria-label="Remover"><Trash2 className="h-4 w-4 text-red-500" /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={bloquear} className="flex flex-wrap items-end gap-2">
          <input type="date" required className={inp} value={bloq.ini} onChange={(e) => setBloq({ ...bloq, ini: e.target.value })} />
          <input type="date" className={inp} value={bloq.fim} min={bloq.ini} onChange={(e) => setBloq({ ...bloq, fim: e.target.value })} title="Até (opcional)" />
          <input placeholder="Motivo" className={inp} value={bloq.motivo} onChange={(e) => setBloq({ ...bloq, motivo: e.target.value })} />
          <button className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Bloquear</button>
        </form>
      </section>
    </div>
  );
}

// ------------------------- DADOS DA CLÍNICA -------------------------
function DadosClinica() {
  const [c, setC] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { supabase.from('clinicas').select('*').limit(1).single().then(({ data }) => setC(data)); }, []);

  async function salvar(e) {
    e.preventDefault();
    const { error } = await supabase.from('clinicas').update({
      nome: c.nome, telefone_whatsapp: c.telefone_whatsapp.replace(/\D/g, ''), endereco: c.endereco, email: c.email,
    }).eq('id', c.id);
    setMsg(error ? 'Erro ao salvar.' : 'Dados salvos!');
  }

  if (!c) return <Loader2 className="animate-spin text-teal-600" />;
  const inp = 'w-full rounded-lg border border-slate-200 p-2.5 text-sm';
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  return (
    <form onSubmit={salvar} className="max-w-md space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <label className="block text-sm">Nome<input required className={inp} value={c.nome} onChange={set('nome')} /></label>
      <label className="block text-sm">WhatsApp (com DDI, ex: 5511999998888)<input required className={inp} value={c.telefone_whatsapp} onChange={set('telefone_whatsapp')} /></label>
      <label className="block text-sm">Endereço<input className={inp} value={c.endereco || ''} onChange={set('endereco')} /></label>
      <label className="block text-sm">E-mail<input type="email" className={inp} value={c.email || ''} onChange={set('email')} /></label>
      <button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">Salvar</button>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
    </form>
  );
}

// ------------------------------- UI auxiliar -------------------------------
const Tela = ({ children }) => <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">{children}</main>;
const Aba = ({ ativa, onClick, icon, children }) => (
  <button onClick={onClick}
    className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${ativa ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}>
    {icon}{children}
  </button>
);
const Btn = ({ cor, children, ...p }) => (
  <button {...p}
    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${cor === 'green' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>
    {children}
  </button>
);
