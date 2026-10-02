'use client';

// Bloqueio de dias inteiros ou turnos específicos (folga, feriado, manutenção...)
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Ban } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { formatBR, hhmm } from '@/lib/agenda';

const TURNOS = {
  dia: { rotulo: 'Dia inteiro', ini: null, fim: null },
  manha: { rotulo: 'Manhã (até 12h)', ini: '00:00', fim: '12:00' },
  tarde: { rotulo: 'Tarde/noite (a partir das 12h)', ini: '12:00', fim: '23:59' },
  custom: { rotulo: 'Intervalo personalizado', ini: '', fim: '' },
};

export default function Bloqueios({ clinica }) {
  const [lista, setLista] = useState([]);
  const [f, setF] = useState({ ini: '', fim: '', turno: 'dia', hIni: '08:00', hFim: '12:00', motivo: '' });

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('bloqueios_datas').select('*').eq('clinica_id', clinica.id).order('data_inicio');
    setLista(data || []);
  }, [clinica.id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function bloquear(e) {
    e.preventDefault();
    const t = TURNOS[f.turno];
    const custom = f.turno === 'custom';
    await supabase.from('bloqueios_datas').insert({
      clinica_id: clinica.id,
      data_inicio: f.ini, data_fim: f.fim || f.ini,
      horario_inicio: custom ? f.hIni : t.ini,
      horario_fim: custom ? f.hFim : t.fim,
      motivo: f.motivo || null,
    });
    setF({ ...f, ini: '', fim: '', motivo: '' });
    carregar();
  }
  async function remover(id) { await supabase.from('bloqueios_datas').delete().eq('id', id); carregar(); }

  const inp = 'rounded-lg border border-slate-200 p-2 text-sm';
  return (
    <section className="max-w-xl rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-800"><Ban className="h-4 w-4" /> Bloqueios e feriados</h2>
      <p className="mb-4 text-sm text-slate-500">Os horários bloqueados somem da tela do paciente.</p>

      <ul className="mb-4 space-y-2">
        {lista.length === 0 && <li className="text-sm text-slate-400">Nenhum bloqueio cadastrado.</li>}
        {lista.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
            <span>
              {formatBR(b.data_inicio)}{b.data_fim !== b.data_inicio && ` a ${formatBR(b.data_fim)}`}
              {' · '}{b.horario_inicio ? `${hhmm(b.horario_inicio)}–${hhmm(b.horario_fim)}` : 'dia inteiro'}
              {b.motivo && ` · ${b.motivo}`}
            </span>
            <button onClick={() => remover(b.id)} aria-label="Remover"><Trash2 className="h-4 w-4 text-red-500" /></button>
          </li>
        ))}
      </ul>

      <form onSubmit={bloquear} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" required className={inp} value={f.ini} onChange={(e) => setF({ ...f, ini: e.target.value })} />
          <span className="text-sm text-slate-400">até</span>
          <input type="date" className={inp} min={f.ini} value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} title="Opcional" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={inp} value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}>
            {Object.entries(TURNOS).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}
          </select>
          {f.turno === 'custom' && (
            <>
              <input type="time" className={inp} value={f.hIni} onChange={(e) => setF({ ...f, hIni: e.target.value })} />
              <input type="time" className={inp} value={f.hFim} onChange={(e) => setF({ ...f, hFim: e.target.value })} />
            </>
          )}
        </div>
        <div className="flex gap-2">
          <input placeholder="Motivo (folga, manutenção...)" className={`${inp} flex-1`} value={f.motivo}
            onChange={(e) => setF({ ...f, motivo: e.target.value })} />
          <button className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Bloquear</button>
        </div>
      </form>
    </section>
  );
}
