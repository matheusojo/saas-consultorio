'use client';

// Cards de métricas do topo do painel
import { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toISO, capacidadeMes } from '@/lib/agenda';

// "versao" muda sempre que a lista altera um agendamento, para recalcular os números
export default function Metricas({ versao }) {
  const [m, setM] = useState(null);

  useEffect(() => {
    (async () => {
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = agora.getMonth();
      const inicio = toISO(new Date(ano, mes, 1));
      const fim = toISO(new Date(ano, mes + 1, 0));

      const [{ data: ags }, { data: grade }, { data: bloqueios }] = await Promise.all([
        supabase.from('agendamentos').select('data_consulta,status').gte('data_consulta', inicio).lte('data_consulta', fim),
        supabase.from('horarios_disponiveis').select('*'),
        supabase.from('bloqueios_datas').select('*'),
      ]);

      const lista = ags || [];
      const ativos = lista.filter((a) => a.status !== 'cancelado');
      const capacidade = capacidadeMes(grade || [], bloqueios || [], ano, mes);
      setM({
        hoje: ativos.filter((a) => a.data_consulta === toISO(agora)).length,
        confirmadas: lista.filter((a) => a.status === 'confirmado' || a.status === 'atendido').length,
        canceladas: lista.filter((a) => a.status === 'cancelado').length,
        ocupacao: capacidade ? Math.min(100, Math.round((ativos.length / capacidade) * 100)) : 0,
        ativos: ativos.length,
        capacidade,
      });
    })();
  }, [versao]);

  const Card = ({ icone, titulo, valor, detalhe, cor }) => (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className={`mb-2 inline-flex rounded-lg p-2 ${cor}`}>{icone}</div>
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="text-2xl font-bold text-slate-800">{m ? valor : '–'}</p>
      <p className="text-xs text-slate-400">{m ? detalhe : ' '}</p>
    </div>
  );

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <Card icone={<CalendarCheck className="h-5 w-5" />} cor="bg-teal-50 text-teal-700"
        titulo="Consultas hoje" valor={m?.hoje} detalhe="sem contar canceladas" />
      <Card icone={<CheckCircle2 className="h-5 w-5" />} cor="bg-green-50 text-green-700"
        titulo="Confirmadas vs. canceladas (mês)" valor={m && `${m.confirmadas} / ${m.canceladas}`} detalhe="confirmadas / canceladas" />
      <Card icone={<Activity className="h-5 w-5" />} cor="bg-indigo-50 text-indigo-700"
        titulo="Taxa de ocupação (mês)" valor={m && `${m.ocupacao}%`} detalhe={m && `${m.ativos} de ${m.capacidade} horários`} />
    </div>
  );
}
