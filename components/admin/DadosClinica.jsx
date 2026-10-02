'use client';

// Edição dos dados da clínica
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function DadosClinica({ clinica, onSalvo }) {
  const [c, setC] = useState(clinica);
  const [msg, setMsg] = useState('');

  async function salvar(e) {
    e.preventDefault();
    const novo = { ...c, telefone_whatsapp: c.telefone_whatsapp.replace(/\D/g, '') };
    const { error } = await supabase.from('clinicas').update({
      nome: novo.nome, telefone_whatsapp: novo.telefone_whatsapp, endereco: novo.endereco, email: novo.email,
    }).eq('id', c.id);
    if (!error) { setC(novo); onSalvo?.(novo); }
    setMsg(error ? 'Erro ao salvar.' : 'Dados salvos!');
  }

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
