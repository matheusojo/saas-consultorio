'use client';

// Painel da clínica: login + métricas + agendamentos + configurações.
// Acesso protegido por Supabase Auth (usuário criado em Authentication > Users).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, LogOut, CalendarClock, ListChecks, Building2, Ban } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Metricas from '@/components/admin/Metricas';
import ListaAgendamentos from '@/components/admin/ListaAgendamentos';
import ConfigHorarios from '@/components/admin/ConfigHorarios';
import Bloqueios from '@/components/admin/Bloqueios';
import DadosClinica from '@/components/admin/DadosClinica';

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
        <Link href="/" className="block text-center text-sm text-slate-400 hover:text-slate-600">Voltar ao agendamento</Link>
      </form>
    </Tela>
  );
}

function Painel() {
  const [aba, setAba] = useState('agenda');
  const [clinica, setClinica] = useState(null);
  const [versao, setVersao] = useState(0); // incrementa para atualizar as métricas

  useEffect(() => {
    supabase.from('clinicas').select('*').limit(1).single().then(({ data }) => setClinica(data));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
          <h1 className="text-lg font-bold text-slate-800">{clinica?.nome || 'Painel da Clínica'}</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">Ver página de agendamento</Link>
            <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
          <Aba ativa={aba === 'agenda'} onClick={() => setAba('agenda')} icon={<ListChecks className="h-4 w-4" />}>Agendamentos</Aba>
          <Aba ativa={aba === 'horarios'} onClick={() => setAba('horarios')} icon={<CalendarClock className="h-4 w-4" />}>Horários</Aba>
          <Aba ativa={aba === 'bloqueios'} onClick={() => setAba('bloqueios')} icon={<Ban className="h-4 w-4" />}>Bloqueios</Aba>
          <Aba ativa={aba === 'clinica'} onClick={() => setAba('clinica')} icon={<Building2 className="h-4 w-4" />}>Clínica</Aba>
        </nav>
      </header>

      <div className="mx-auto max-w-5xl p-4">
        {!clinica ? <Loader2 className="animate-spin text-teal-600" /> : (
          <>
            {aba === 'agenda' && (
              <>
                <Metricas versao={versao} />
                <ListaAgendamentos clinica={clinica} onAlterou={() => setVersao((v) => v + 1)} />
              </>
            )}
            {aba === 'horarios' && <ConfigHorarios clinica={clinica} />}
            {aba === 'bloqueios' && <Bloqueios clinica={clinica} />}
            {aba === 'clinica' && <DadosClinica clinica={clinica} onSalvo={setClinica} />}
          </>
        )}
      </div>
    </main>
  );
}

const Tela = ({ children }) => <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">{children}</main>;
const Aba = ({ ativa, onClick, icon, children }) => (
  <button onClick={onClick}
    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${ativa ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500'}`}>
    {icon}{children}
  </button>
);
