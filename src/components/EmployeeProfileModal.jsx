import { useState, useEffect } from 'react';
import { getScheduleForDate } from '../lib/supabase';
import MonthCalendar from './MonthCalendar';

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const TOLERANCE = 15;

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : null;
const timeToMins = t => { if(!t)return 0; const [h,m]=(t.slice(0,5)||'00:00').split(':').map(Number); return h*60+m; };
const minsToHM = m => { const h=Math.floor(Math.abs(m)/60); const mm=Math.abs(m)%60; return `${h}h${mm>0?` ${mm}m`:''}`; };
const fmtMoney = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0);

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',
    teal:'bg-teal-50 text-teal-700 border-teal-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

// Modal para editar un día
function DayEditModal({day, rec, sched, empId, onSave, onClose}) {
  const [status, setStatus] = useState(rec?.status || 'absent');
  const [just, setJust] = useState(rec?.justification || '');
  const [ci, setCi] = useState(rec?.check_in ? new Date(rec.check_in).toTimeString().slice(0,5) : '');
  const [co, setCo] = useState(rec?.check_out ? new Date(rec.check_out).toTimeString().slice(0,5) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const doSave = async () => {
    setSaving(true);
    const patch = { status, justification: just||null,
      check_in: ci ? new Date(day+'T'+ci+':00').toISOString() : null,
      check_out: co ? new Date(day+'T'+co+':00').toISOString() : null,
    };
    if(patch.check_in && patch.check_out) {
      patch.minutes_worked = Math.round((new Date(patch.check_out)-new Date(patch.check_in))/60000);
      const actualStart = new Date(patch.check_in).getHours()*60+new Date(patch.check_in).getMinutes();
      const expectedStart = sched ? timeToMins(sched.start_time) : 0;
      patch.minutes_late = Math.max(0, actualStart - expectedStart - TOLERANCE);
    }
    await onSave(rec?.id, patch, reason||'Edición admin');
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{new Date(day+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</h2>
            {sched && <p className="text-xs text-gray-400 mt-0.5">Horario: {sched.start_time?.slice(0,5)} – {sched.end_time?.slice(0,5)}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Estado del día</label>
            <div className="grid grid-cols-2 gap-2">
              {[['present','✓ Presente','border-emerald-300 bg-emerald-50 text-emerald-700'],
                ['absent','✗ Ausente injust.','border-red-300 bg-red-50 text-red-600'],
                ['justified','~ Ausente justif.','border-amber-300 bg-amber-50 text-amber-700'],
                ['holiday','★ Feriado','border-violet-300 bg-violet-50 text-violet-700']].map(([v,l,cls])=>(
                <button key={v} onClick={()=>setStatus(v)}
                  className={`py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${status===v?cls:'border-gray-200 text-gray-400 bg-white'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {(status==='absent'||status==='justified') && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                {status==='justified'?'Motivo de justificación':'Motivo de la falta'}
              </label>
              <textarea value={just} onChange={e=>setJust(e.target.value)} rows={2}
                placeholder="Certificado médico, trámite, enfermedad..."
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
            </div>
          )}

          {status==='present' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Entrada</label>
                <input type="time" value={ci} onChange={e=>setCi(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Salida</label>
                <input type="time" value={co} onChange={e=>setCo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo del cambio (auditoría)</label>
            <input value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Ej: Corrección autorizada, error de registro..."
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>

          <button onClick={doSave} disabled={saving}
            className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Guardando...':'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EMPLOYEE PROFILE MODAL ─────────────────────────────────────────────
export default function EmployeeProfileModal({emp, month, onMonthChange, records, extraHours, schedMap, holidays, adminId, onEditRecord, onAddRecord, onClose}) {
  const [editDay, setEditDay] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar' // {date, rec, sched}

  if (!emp) return null;

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const holidayDates = new Set((holidays||[]).map(h=>h.date));
  const today = new Date().toISOString().split('T')[0];

  // Construir array de días del mes
  const days = Array.from({length: daysInMonth}, (_, i) => {
    const d = i + 1;
    const date = `${month}-${String(d).padStart(2,'0')}`;
    const dow = new Date(date+'T12:00:00').getDay();
    const sched = schedMap[dow];
    const rec = records.find(r => r.date === date);
    const isHoliday = holidayDates.has(date);
    const isFuture = date > today;
    const hasShift = sched?.active;
    const extra = extraHours.filter(h => h.date === date);

    // Calcular estado real
    let estado = 'libre';
    if (isHoliday) estado = 'feriado';
    else if (!hasShift) estado = 'libre';
    else if (isFuture) estado = 'futuro';
    else if (rec?.check_in) estado = 'presente';
    else if (rec?.status === 'justified') estado = 'justificada';
    else if (rec?.status === 'absent') estado = 'ausente';
    else estado = 'ausente'; // pasado sin registro

    // Calcular tardanza y horas
    let minutesLate = 0, horasExtra = 0, horasFaltantes = 0, worked = 0;
    if (rec?.check_in && sched) {
      const ci = new Date(rec.check_in);
      const actualStart = ci.getHours()*60 + ci.getMinutes();
      const expectedStart = timeToMins(sched.start_time);
      const expectedEnd = timeToMins(sched.end_time);
      const expectedHours = expectedEnd - expectedStart;
      minutesLate = Math.max(0, actualStart - expectedStart - TOLERANCE);
      if (rec.check_out) {
        const co = new Date(rec.check_out);
        const actualEnd = co.getHours()*60 + co.getMinutes();
        worked = actualEnd - actualStart;
        const diff = worked - expectedHours;
        if (diff > 0) horasExtra = diff;
        else if (diff < 0) horasFaltantes = Math.abs(diff);
      }
    }

    return { date, dow, d, sched, rec, isHoliday, isFuture, hasShift, extra, estado, minutesLate, horasExtra, horasFaltantes, worked };
  });

  // Stats del mes
  const workDays = days.filter(d => d.hasShift && !d.isHoliday && !d.isFuture);
  const presentes = days.filter(d => d.estado === 'presente').length;
  const ausentes = days.filter(d => d.estado === 'ausente').length;
  const justificadas = days.filter(d => d.estado === 'justificada').length;
  const tardanzas = days.filter(d => d.minutesLate > 0).length;
  const totalExtra = days.reduce((a,d)=>a+d.horasExtra, 0);
  const pct = workDays.length > 0 ? Math.round(presentes/workDays.length*100) : 0;

  const estadoColor = estado => ({
    presente: 'bg-emerald-50 border-emerald-200',
    ausente: 'bg-red-50 border-red-200',
    justificada: 'bg-amber-50 border-amber-200',
    feriado: 'bg-violet-50 border-violet-200',
    libre: 'bg-gray-50 border-gray-100',
    futuro: 'bg-gray-50 border-gray-100',
  }[estado] || 'bg-gray-50 border-gray-100');

  const estadoBadge = ({estado, minutesLate, horasExtra, horasFaltantes}) => {
    if (estado === 'presente') {
      if (horasExtra > 0) return <Badge color="teal">+{minsToHM(horasExtra)} extra</Badge>;
      if (horasFaltantes > 30) return <Badge color="yellow">-{minsToHM(horasFaltantes)}</Badge>;
      if (minutesLate > 0) return <Badge color="yellow">+{minutesLate}min tarde</Badge>;
      return <Badge color="green">✓ OK</Badge>;
    }
    if (estado === 'ausente') return <Badge color="red">✗ Ausente</Badge>;
    if (estado === 'justificada') return <Badge color="yellow">~ Justificada</Badge>;
    if (estado === 'feriado') return <Badge color="purple">Feriado</Badge>;
    if (estado === 'futuro') return <Badge color="gray">—</Badge>;
    return <Badge color="gray">Libre</Badge>;
  };

  const handleDayEdit = async (recId, patch, reason) => {
    if (recId) {
      await onEditRecord(recId, patch, reason);
    } else {
      // No hay registro — crear nuevo
      await onAddRecord(emp.id, editDay.date, patch.status, patch.justification);
      // Si tiene horario también guardar entrada/salida
      if (patch.check_in) {
        // Re-fetch para obtener el id y actualizar
        setTimeout(() => {}, 500);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm bg-sky-100 text-sky-700">{emp.avatar||'?'}</div>
            <div>
              <h2 className="text-base font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>{emp.name}</h2>
              <p className="text-xs text-gray-400">{emp.email} {emp.salary>0&&`· ${fmtMoney(emp.salary)}/mes`}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        {/* Schedule history note */}
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 flex-shrink-0">
          <p className="text-xs text-sky-600">📅 Los horarios se muestran según la vigencia del mes seleccionado</p>
        </div>

        {/* Month picker */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
          <input type="month" value={month} onChange={e=>onMonthChange(e.target.value)}
            className="px-3.5 py-2 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          <span className="text-xs text-gray-400">{workDays.length} días laborales</span>
        </div>

        {/* Stats */}
        <div className="px-6 py-3 border-b border-gray-50 flex-shrink-0">
          <div className="grid grid-cols-5 gap-2">
            {[{l:'Asist.',v:`${pct}%`,c:'text-sky-600'},{l:'Present.',v:presentes,c:'text-emerald-600'},
              {l:'Ausentes',v:ausentes,c:'text-red-500'},{l:'Justif.',v:justificadas,c:'text-amber-600'},
              {l:'Tardanz.',v:tardanzas,c:'text-violet-600'}].map(({l,v,c})=>(
              <div key={l} className="text-center">
                <p className={`text-lg font-black ${c}`}>{v}</p>
                <p className="text-xs text-gray-400">{l}</p>
              </div>
            ))}
          </div>
          {totalExtra > 0 && (
            <div className="mt-2 bg-emerald-50 rounded-xl px-3 py-1.5 text-xs text-emerald-700 font-semibold text-center">
              🏆 Total horas extra: +{minsToHM(totalExtra)}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="px-4 py-2 border-b border-gray-50 flex gap-2 flex-shrink-0">
          <button onClick={()=>setViewMode('list')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${viewMode==='list'?'bg-sky-100 text-sky-700':'text-gray-400 hover:bg-gray-100'}`}>
            ≡ Lista
          </button>
          <button onClick={()=>setViewMode('calendar')} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${viewMode==='calendar'?'bg-sky-100 text-sky-700':'text-gray-400 hover:bg-gray-100'}`}>
            📅 Calendario
          </button>
        </div>

        {viewMode==='calendar'&&(
          <div className="overflow-y-auto flex-1 px-4 py-3">
            <MonthCalendar
              month={month}
              records={records}
              schedMap={schedMap}
              holidays={holidays}
              onDayClick={cell=>{ const rec=records.find(r=>r.date===cell.date); setEditDay({...cell,rec}); }}
            />
          </div>
        )}

        {/* Day list */}
        <div className={`overflow-y-auto flex-1 px-4 py-3 space-y-1.5 ${viewMode==='calendar'?'hidden':''}`}>
          {days.map(day => (
            <div key={day.date}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${estadoColor(day.estado)} ${day.hasShift&&!day.isFuture?'cursor-pointer hover:shadow-sm active:scale-[0.99]':''}`}
              onClick={()=>{ if(day.hasShift&&!day.isFuture) setEditDay(day); }}>

              {/* Día */}
              <div className="text-center w-10 flex-shrink-0">
                <p className="text-xs text-gray-400">{DAYS[day.dow]}</p>
                <p className="text-lg font-black text-gray-800">{day.d}</p>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {day.estado==='presente'&&day.rec ? (
                  <div>
                    <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                      {fmtTime(day.rec.check_in)&&(
                        <span className={day.minutesLate>0?'text-amber-600 font-bold':'text-gray-700'}>
                          ↓{fmtTime(day.rec.check_in)}
                          {day.minutesLate>0&&<span className="text-amber-500"> (+{day.minutesLate}min)</span>}
                        </span>
                      )}
                      {fmtTime(day.rec.check_out)&&(
                        <span className="text-gray-700">↑{fmtTime(day.rec.check_out)}</span>
                      )}
                    </div>
                    {day.rec.check_in && !day.rec.check_out && (
                      <p className="text-xs text-amber-500">Sin salida registrada</p>
                    )}
                    {day.worked > 0 && (
                      <p className="text-xs text-gray-400">{minsToHM(day.worked)} trabajados · esperado {day.sched?minsToHM(timeToMins(day.sched.end_time)-timeToMins(day.sched.start_time)):'—'}</p>
                    )}
                    {day.rec.justification&&<p className="text-xs text-amber-600 italic">"{day.rec.justification}"</p>}
                  </div>
                ) : day.estado==='justificada' ? (
                  <div>
                    <p className="text-xs text-amber-600 font-semibold">Ausencia justificada</p>
                    {day.rec?.justification&&<p className="text-xs text-amber-500 italic">"{day.rec.justification}"</p>}
                  </div>
                ) : day.estado==='ausente' ? (
                  <p className="text-xs text-red-500 font-semibold">Sin registro de asistencia</p>
                ) : day.estado==='feriado' ? (
                  <p className="text-xs text-violet-600 font-semibold">
                    {(holidays||[]).find(h=>h.date===day.date)?.name||'Feriado'}
                  </p>
                ) : day.hasShift ? (
                  <p className="text-xs text-gray-400">{day.sched.start_time?.slice(0,5)} – {day.sched.end_time?.slice(0,5)}</p>
                ) : (
                  <p className="text-xs text-gray-300">Sin turno</p>
                )}

                {/* Horas extra manuales */}
                {day.extra.length>0&&(
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {day.extra.map(e=>(
                      <span key={e.id} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                        +{e.hours}hs {e.description&&`(${e.description})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Badge + edit icon */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {estadoBadge(day)}
                {day.hasShift&&!day.isFuture&&(
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Day edit modal */}
      {editDay&&(
        <DayEditModal
          day={editDay.date}
          rec={editDay.rec}
          sched={editDay.sched}
          empId={emp.id}
          onSave={handleDayEdit}
          onClose={()=>setEditDay(null)}
        />
      )}
    </div>
  );
}
