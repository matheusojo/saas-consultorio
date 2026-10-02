'use client';

// Lista de agendamentos com filtros rápidos e ações em cada linha
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MessageCircle, Loader2, CalendarClock, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toISO, addDias, hhmm, formatBR, dataExtenso, linkWhatsApp, linkRemarcar } from '@/lib/agenda';
import RemarcarModal from './RemarcarModal';

const COR_STATUS = {
  pendente: 'bg-amber-100 text-amber-800',
  confirmado: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
  atendido: 'bg-sky-100 text-sky-800',
};
const FILTROS = [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['pendentes', 'Pendentes'], ['historico', 'Histórico']];

export default function ListaAgendamentos({ clinica, onAlterou }) {
  const [filtro, setFiltro] = useState('hoje');
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remarcando, setRemarcando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const hoje = new Date();
    const iso = toISO(hoje);
    let q = supabase.from('agendamentos').select('*');

    if (filtro === 'hoje') q = q.eq('data_consulta', iso);
    if (filtro === 'amanha') q = q.eq('data_consulta', toISO(addDias(hoje, 1)));
    if (filtro === 'semana') {
      const seg = addDias(hoje, -((hoje.getDay() + 6) % 7)); // segunda-feira desta semana
      q = q.gte('data_consulta', toISO(seg)).lte('data_consulta', toISO(addDias(seg, 6)));
    }
    if (filtro === 'pendentes') q = q.eq('status', 'pendente').gte('data_consulta', iso);
    if (filtro === 'historico') q = q.lt('data_consulta', iso);

    q = filtro === 'historico'
      ? q.order('data_consulta', { ascending: false }).order('horario_consulta')
      : q.order('data_consulta').order('horario_consulta');
    const { data } = await q;
    setItens(data || []);
    setLoading(false);
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(id, status) {
    const { error } = await supabase.from('agendamentos').update({ status }).eq('id', id);
    if (!error) {
      setItens((l) => l.map((a) => (a.id === id ? { ...a, status } : a)));
      onAlterou?.();
    }
  }

  // Mensagem para o paciente, já com o link de remarcação
  function linkWpp(a) {
    const quando = `${formatBR(a.data_consulta)} às ${hhmm(a.horario_consulta)}`;
    const local = clinica?.nome ? ` na ${clinica.nome}` : '';
    const msg = a.status === 'pendente'
      ? `Olá, ${a.nome_paciente}! Sua consulta${local} está confirmada para ${quando}. Se precisar remarcar, use este link: ${linkRemarcar(a.id)}`
      : `Olá, ${a.nome_paciente}! Lembramos da sua consulta${local} em ${quando}. Poderia confirmar sua presença? Para remarcar: ${linkRemarcar(a.id)}`;
    return linkWhatsApp(a.telefone_paciente, msg);
  }

  const encerrada = (a) => a.status === 'cancelado' || a.status === 'atendido';

  return (
    <>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${filtro === k ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'}`}>
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
                    <p className="text-sm capitalize text-slate-600">{dataExtenso(a.data_consulta)} · {hhmm(a.horario_consulta)}</p>
                    <p className="text-sm text-slate-500">{a.telefone_paciente}{a.email_paciente && ` · ${a.email_paciente}`}</p>
                    {a.observacoes && <p className="mt-1 text-sm italic text-slate-500">“{a.observacoes}”</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${COR_STATUS[a.status]}`}>{a.status}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!encerrada(a) && (
                    <a href={linkWpp(a)} target="_blank" rel="noopener noreferrer"
                      onClick={() => a.status === 'pendente' && mudarStatus(a.id, 'confirmado')}
                      className="flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600">
                      <MessageCircle className="h-4 w-4" /> {a.status === 'pendente' ? 'Confirmar via WhatsApp' : 'Enviar lembrete'}
                    </a>
                  )}
                  {a.status === 'pendente' && (
                    <Acao cor="green" onClick={() => mudarStatus(a.id, 'confirmado')}><CheckCircle2 className="h-4 w-4" /> Confirmar</Acao>
                  )}
                  {!encerrada(a) && (
                    <Acao cor="slate" onClick={() => setRemarcando(a)}><CalendarClock className="h-4 w-4" /> Remarcar</Acao>
                  )}
                  {!encerrada(a) && (
                    <Acao cor="sky" onClick={() => mudarStatus(a.id, 'atendido')}><UserCheck className="h-4 w-4" /> Marcar como atendido</Acao>
                  )}
                  {!encerrada(a) && (
                    <Acao cor="red" onClick={() => mudarStatus(a.id, 'cancelado')}><XCircle className="h-4 w-4" /> Cancelar</Acao>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

      {remarcando && (
        <RemarcarModal agendamento={remarcando} onFechar={() => setRemarcando(null)}
          onSalvo={() => { setRemarcando(null); carregar(); onAlterou?.(); }} />
      )}
    </>
  );
}

const CORES = {
  green: 'bg-green-100 text-green-800 hover:bg-green-200',
  red: 'bg-red-100 text-red-800 hover:bg-red-200',
  sky: 'bg-sky-100 text-sky-800 hover:bg-sky-200',
  slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
};
const Acao = ({ cor, children, ...p }) => (
  <button {...p} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${CORES[cor]}`}>{children}</button>
);
