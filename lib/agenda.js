// Utilitários compartilhados entre a tela do paciente e o painel da clínica.

// ---------- datas (sempre strings yyyy-mm-dd locais, sem problemas de fuso) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (iso) => new Date(`${iso}T00:00:00`);
export const addDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const hhmm = (t) => t.slice(0, 5);
export const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const formatBR = (iso) => iso.split('-').reverse().join('/');
export const dataExtenso = (iso) =>
  parseISO(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ---------- bloqueios e horários ----------
const bloqueiosDoDia = (bloqueios, iso, profId) =>
  bloqueios.filter(
    (b) => iso >= b.data_inicio && iso <= b.data_fim &&
      (!b.profissional_id || !profId || b.profissional_id === profId)
  );

// Bloqueio sem horário = dia inteiro
export const diaBloqueado = (bloqueios, iso, profId) =>
  bloqueiosDoDia(bloqueios, iso, profId).some((b) => !b.horario_inicio);

// Todos os horários de um dia (sem remover duplicados), respeitando bloqueios de dia e de turno
export function slotsBrutos(grade, bloqueios, date, profId = null) {
  const iso = toISO(date);
  if (diaBloqueado(bloqueios, iso, profId)) return [];
  const parciais = bloqueiosDoDia(bloqueios, iso, profId).filter((b) => b.horario_inicio);
  const out = [];

  grade
    .filter((g) => g.ativo !== false && g.dia_da_semana === date.getDay() &&
      (!profId || !g.profissional_id || g.profissional_id === profId))
    .forEach((g) => {
      const dur = g.duracao_consulta_minutos;
      for (let m = toMin(g.horario_inicio); m + dur <= toMin(g.horario_fim); m += dur) {
        const emBloqueio = parciais.some(
          (b) => m < toMin(b.horario_fim) && m + dur > toMin(b.horario_inicio)
        );
        if (!emBloqueio) out.push({ hora: fromMin(m), duracao: dur });
      }
    });
  return out;
}

// Horários únicos e ordenados
export function gerarSlots(grade, bloqueios, date, profId = null) {
  const vistos = new Map();
  slotsBrutos(grade, bloqueios, date, profId).forEach((s) => { if (!vistos.has(s.hora)) vistos.set(s.hora, s); });
  return [...vistos.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}

// Se a data for hoje, remove horários que já passaram
export function removerPassados(slots, date) {
  const agora = new Date();
  if (toISO(date) !== toISO(agora)) return slots;
  const min = agora.getHours() * 60 + agora.getMinutes();
  return slots.filter((s) => toMin(s.hora) > min);
}

// Total de horários oferecidos em um mês (base da taxa de ocupação)
export function capacidadeMes(grade, bloqueios, ano, mes) {
  const dias = new Date(ano, mes + 1, 0).getDate();
  let total = 0;
  for (let d = 1; d <= dias; d++) total += slotsBrutos(grade, bloqueios, new Date(ano, mes, d)).length;
  return total;
}

// ---------- agenda externa ----------
const fimDoEvento = (hora, duracao) => fromMin(toMin(hora) + duracao);
const stamp = (iso, hora) => `${iso.replace(/-/g, '')}T${hora.replace(':', '')}00`;

export function linkGoogleCalendar({ titulo, dataISO, hora, duracao, local, detalhes }) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${stamp(dataISO, hora)}/${stamp(dataISO, fimDoEvento(hora, duracao))}`,
    details: detalhes || '',
    location: local || '',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Arquivo .ics (Apple Calendar, Outlook, etc.)
export function baixarICS({ id, titulo, dataISO, hora, duracao, local, detalhes }) {
  const esc = (t = '') => t.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const agora = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agendamento//PT-BR', 'BEGIN:VEVENT',
    `UID:${id}@agendamento`, `DTSTAMP:${agora}`,
    `DTSTART:${stamp(dataISO, hora)}`, `DTEND:${stamp(dataISO, fimDoEvento(hora, duracao))}`,
    `SUMMARY:${esc(titulo)}`, `LOCATION:${esc(local)}`, `DESCRIPTION:${esc(detalhes)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'consulta.ics'; a.click();
  URL.revokeObjectURL(url);
}

// ---------- WhatsApp ----------
export function linkWhatsApp(telefone, mensagem) {
  let tel = telefone.replace(/\D/g, '');
  if (tel.length <= 11) tel = `55${tel}`; // assume Brasil quando vem sem DDI
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`;
}

// Link que o paciente usa para remarcar a própria consulta
export const linkRemarcar = (id) => `${window.location.origin}/?remarcar=${id}`;
