'use client';

// Grade semanal de funcionamento
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { DIAS_SEMANA, hhmm } from '@/lib/agenda';

export default function ConfigHorarios({ clinica }) {
  const [grade, setGrade] = useState([]);
  const [novo, setNovo] = useState({ dia: 1, ini: '08:00', fim: '12:00', dur: 30 });

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('horarios_disponiveis').select('*').eq('clinica_id', clinica.id)
      .order('dia_da_semana').order('horario_inicio');
    setGrade(data || []);
  }, [clinica.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function adicionar(e) {
    e.preventDefault();
    await supabase.from('horarios_disponiveis').insert({
      clinica_id: clinica.id, dia_da_semana: Number(novo.dia),
      horario_inicio: novo.ini, horario_fim: novo.fim, duracao_consulta_minutos: Number(novo.dur),
    });
    carregar();
  }
  async function alternar(h) { await supabase.from('horarios_disponiveis').update({ ativo: !h.ativo }).eq('id', h.id); carregar(); }
  async function remover(id) { await supabase.from('horarios_disponiveis').delete().eq('id', id); carregar(); }

  const inp = 'rounded-lg border border-slate-200 p-2 text-sm';
  return (
    <section className="max-w-xl rounded-xl bg-white p-4 shadow-sm">
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
        <input type="number" min="5" step="5" className={`${inp} w-20`} value={novo.dur}
          onChange={(e) => setNovo({ ...novo, dur: e.target.value })} title="Duração (min)" />
        <button className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Adicionar</button>
      </form>
    </section>
  );
}
