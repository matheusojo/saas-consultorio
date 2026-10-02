'use client';

// Modal para o atendente remarcar uma consulta
import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toISO, parseISO, hhmm, gerarSlots } from '@/lib/agenda';

export default function RemarcarModal({ agendamento, onFechar, onSalvo }) {
  const [grade, setGrade] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [data, setData] = useState('');
  const [slots, setSlots] = useState([]);
  const [hora, setHora] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('horarios_disponiveis').select('*').eq('clinica_id', agendamento.clinica_id),
      supabase.from('bloqueios_datas').select('*').eq('clinica_id', agendamento.clinica_id),
    ]).then(([g, b]) => { setGrade(g.data || []); setBloqueios(b.data || []); });
  }, [agendamento.clinica_id]);

  async function escolherData(iso) {
    setData(iso); setHora(''); setErro('');
    if (!iso) return setSlots([]);
    setLoading(true);
    const { data: ocupados } = await supabase.rpc('horarios_ocupados', {
      p_clinica: agendamento.clinica_id, p_data: iso, p_profissional: agendamento.profissional_id,
    });
    const ocup = new Set((ocupados || []).map((o) => hhmm(o.horario_consulta)));
    setSlots(gerarSlots(grade, bloqueios, parseISO(iso), agendamento.profissional_id).filter((s) => !ocup.has(s.hora)));
    setLoading(false);
  }

  async function salvar() {
    const { error } = await supabase.from('agendamentos')
      .update({ data_consulta: data, horario_consulta: hora }).eq('id', agendamento.id);
    if (error) return setErro(error.code === '23505' ? 'Esse horário já está ocupado.' : 'Erro ao remarcar.');
    onSalvo({ ...agendamento, data_consulta: data, horario_consulta: hora });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Remarcar — {agendamento.nome_paciente}</h3>
          <button onClick={onFechar} aria-label="Fechar"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <input type="date" min={toISO(new Date())} value={data} onChange={(e) => escolherData(e.target.value)}
          className="w-full rounded-lg border border-slate-200 p-2.5" />
        <div className="mt-3 min-h-16">
          {loading && <Loader2 className="animate-spin text-teal-600" />}
          {data && !loading && slots.length === 0 && <p className="text-sm text-slate-500">Sem horários livres nesta data.</p>}
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button key={s.hora} onClick={() => setHora(s.hora)}
                className={`rounded-full border px-3 py-1.5 text-sm ${hora === s.hora ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 hover:border-teal-500'}`}>
                {s.hora}
              </button>
            ))}
          </div>
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
        <button disabled={!hora} onClick={salvar}
          className="mt-4 w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white disabled:opacity-40">Salvar nova data</button>
      </div>
    </div>
  );
}
