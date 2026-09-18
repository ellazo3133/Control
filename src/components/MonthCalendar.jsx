import { useState } from 'react';

const DAYS_HEADER = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmtTime  = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : null;
const fmtDate  = iso => { const d=new Date(iso+'T12:00:00'); return d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}); };
const timeToMins = t => { if(!t)return 0; const[h,m]=(t.slice(0,5)).split(':').map(Number);return h*60+m; };
const minsToHM = m => `${Math.floor(m/60)}h ${m%60}m`;

export default function MonthCalendar({ month, records, schedMap, holidays, exceptions, onDayClick, today }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [y, m] = month.split('-').map(Number);
  const firstDay  = new Date(y, m-1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const holidayMap  = {};
  (holidays||[]).forEach(h => { holidayMap[h.date] = h.name; });
  const todayISO = today || new Date().toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2,'0')}`;
    const dow  = new Date(date+'T12:00:00').getDay();
    const sched = schedMap?.[dow];
    const rec   = (records||[]).find(r => r.date===date || r.date===date.slice(0,10));
    const isHoliday = !!holidayMap[date];
    const exception = (exceptions||[]).find(e => e.date===date);
    const isFuture  = date > todayISO;
    const isToday   = date === todayISO;
    const hasShift  = sched?.active;

    // Effective schedule (exception overrides regular)
    const effSched = exception && (exception.type==='custom'||exception.type==='half') && exception.start_time
      ? { ...sched, start_time: exception.start_time, end_time: exception.end_time||sched?.end_time, active: true }
      : sched;

    let estado = 'libre';
    if (isHoliday)       estado = 'feriado';
    else if (exception?.type === 'free') estado = 'exc_libre';
    else if (!hasShift)  estado = 'libre';
    else if (isFuture)   estado = exception ? 'exc_horario' : 'futuro';
    else if (rec?.check_in) {
      const actualStart = new Date(rec.check_in).getHours()*60 + new Date(rec.check_in).getMinutes();
      const expectedStart = timeToMins(effSched?.start_time);
      const late = Math.max(0, actualStart - expectedStart - 15);
      estado = late > 0 ? 'tarde' : 'ok';
    }
    else if (rec?.status==='justified') estado = 'justificada';
    else if (exception?.type==='custom'||exception?.type==='half') estado = 'exc_horario';
    else estado = 'ausente';

    cells.push({ d, date, dow, sched, effSched, rec, isHoliday, holidayName: holidayMap[date], isFuture, isToday, hasShift, estado, exception });
  }

  const STATE = {
    ok:          { bg:'bg-emerald-500', text:'text-white',       icon:'✓',  label:'Presente' },
    tarde:       { bg:'bg-amber-400',   text:'text-white',       icon:'⏰', label:'Tarde' },
    ausente:     { bg:'bg-red-400',     text:'text-white',       icon:'✗',  label:'Ausente' },
    justificada: { bg:'bg-amber-200',   text:'text-amber-800',   icon:'~',  label:'Justificada' },
    feriado:     { bg:'bg-violet-400',  text:'text-white',       icon:'★',  label:'Feriado' },
    exc_libre:   { bg:'bg-red-300',     text:'text-white',       icon:'🚫', label:'No trabaja' },
    exc_horario: { bg:'bg-indigo-400',  text:'text-white',       icon:'⏰', label:'Horario especial' },
    futuro:      { bg:'bg-gray-100',    text:'text-gray-300',    icon:'·',  label:'Próximo' },
    libre:       { bg:'bg-gray-100',    text:'text-gray-300',    icon:'·',  label:'Día libre' },
  };

  const selected = selectedDate ? cells.find(c => c?.date === selectedDate) : null;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-sm font-bold text-gray-700 capitalize">
            {MONTHS[m-1]} {y}
          </p>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-50">
          {DAYS_HEADER.map(d => (
            <div key={d} className="py-2 text-center text-xs font-bold text-gray-400">{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} className="bg-white h-14"/>;
            const st = STATE[cell.estado] || STATE.libre;
            const isSelected = selectedDate === cell.date;
            const hasException = !!cell.exception;
            const isClickable = cell.hasShift || cell.isHoliday || hasException;

            return (
              <div key={cell.date}
                onClick={() => isClickable && setSelectedDate(isSelected ? null : cell.date)}
                className={`bg-white h-14 flex flex-col items-center justify-start pt-1.5 gap-0.5 transition-all relative
                  ${isClickable ? 'cursor-pointer active:bg-gray-50' : ''}
                  ${isSelected ? 'bg-sky-50 ring-2 ring-sky-400 ring-inset z-10' : ''}
                  ${cell.isToday && !isSelected ? 'ring-2 ring-sky-300 ring-inset' : ''}`}>

                {/* Date number */}
                <span className={`text-xs font-bold leading-none
                  ${isSelected ? 'text-sky-600' : cell.isToday ? 'text-sky-500' : cell.isFuture ? 'text-gray-300' : 'text-gray-700'}`}>
                  {cell.d}
                </span>

                {/* Status indicator */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${st.bg}`}>
                  <span className={`${st.text} leading-none`} style={{fontSize:'11px'}}>{st.icon}</span>
                </div>

                {/* Exception badge — small star */}
                {hasException && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-indigo-500 rounded-full"/>
                )}

                {/* Entry time for past days */}
                {cell.rec?.check_in && (
                  <span className="text-gray-400 font-mono leading-none" style={{fontSize:'8px'}}>
                    {fmtTime(cell.rec.check_in)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-gray-50 flex flex-wrap gap-x-3 gap-y-1.5">
          {[['bg-emerald-500','Presente'],['bg-amber-400','Tarde'],['bg-red-400','Ausente'],
            ['bg-amber-200','Justif.'],['bg-violet-400','Feriado'],['bg-indigo-400','Horario especial']].map(([bg,label])=>(
            <div key={label} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${bg}`}/>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-1 ring-indigo-300"/>
            <span className="text-xs text-gray-400">Excepción cargada</span>
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      {selected && (
        <div className={`rounded-3xl border-2 overflow-hidden ${
          selected.exception && selected.exception.type !== 'free' ? 'border-indigo-300 bg-indigo-50' :
          selected.exception?.type === 'free' ? 'border-red-200 bg-red-50' :
          selected.isHoliday ? 'border-violet-200 bg-violet-50' :
          selected.estado === 'ok' ? 'border-emerald-200 bg-emerald-50' :
          selected.estado === 'tarde' ? 'border-amber-200 bg-amber-50' :
          selected.estado === 'ausente' ? 'border-red-200 bg-red-50' :
          'border-gray-200 bg-white'
        }`}>

          {/* Day title */}
          <div className="px-5 py-4 border-b border-white/50">
            <p className="text-sm font-black text-gray-900 capitalize">{fmtDate(selected.date)}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-xl ${STATE[selected.estado]?.bg} ${STATE[selected.estado]?.text}`}>
                {STATE[selected.estado]?.label}
              </span>
              {selected.exception && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-xl bg-indigo-100 text-indigo-700">
                  ⚡ Excepción cargada
                </span>
              )}
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">

            {/* FERIADO */}
            {selected.isHoliday && (
              <div className="flex items-center gap-3 bg-violet-100 rounded-2xl px-4 py-3">
                <span className="text-2xl">★</span>
                <div>
                  <p className="text-sm font-bold text-violet-800">{selected.holidayName}</p>
                  <p className="text-xs text-violet-600">Día feriado — no se registra asistencia</p>
                </div>
              </div>
            )}

            {/* EXCEPCIÓN destacada */}
            {selected.exception && (
              <div className={`rounded-2xl px-4 py-3.5 border-2 ${
                selected.exception.type==='free'
                  ? 'bg-red-100 border-red-300'
                  : 'bg-indigo-100 border-indigo-300'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{selected.exception.type==='free'?'🚫':'⏰'}</span>
                  <p className={`text-sm font-black ${selected.exception.type==='free'?'text-red-800':'text-indigo-800'}`}>
                    {selected.exception.type==='free' ? 'No trabajás este día' :
                     selected.exception.type==='half' ? 'Media jornada especial' :
                     'Horario especial este día'}
                  </p>
                </div>
                {selected.exception.type !== 'free' && selected.exception.start_time && (
                  <p className={`text-sm font-bold mt-1 ${selected.exception.type==='free'?'text-red-700':'text-indigo-700'}`}>
                    {selected.exception.start_time.slice(0,5)} — {selected.exception.end_time?.slice(0,5)||'?'}
                  </p>
                )}
                {selected.exception.note && (
                  <p className={`text-xs mt-1.5 italic ${selected.exception.type==='free'?'text-red-600':'text-indigo-600'}`}>
                    "{selected.exception.note}"
                  </p>
                )}
              </div>
            )}

            {/* HORARIO ESPERADO */}
            {!selected.isHoliday && selected.effSched?.active && selected.exception?.type !== 'free' && (
              <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                  {selected.exception ? 'Horario especial' : 'Horario habitual'}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Entrada</p>
                    <p className="text-base font-black text-sky-600">{selected.effSched.start_time?.slice(0,5)||'—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Salida</p>
                    <p className="text-base font-black text-sky-600">{selected.effSched.end_time?.slice(0,5)||'—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Duración</p>
                    <p className="text-base font-black text-gray-700">
                      {selected.effSched.start_time && selected.effSched.end_time
                        ? minsToHM(timeToMins(selected.effSched.end_time)-timeToMins(selected.effSched.start_time))
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* REGISTRO REAL */}
            {selected.rec?.check_in && (
              <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Registro real</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Entrada</p>
                    <p className={`text-base font-black ${selected.estado==='tarde'?'text-amber-600':'text-emerald-600'}`}>
                      {fmtTime(selected.rec.check_in)}
                    </p>
                    {(selected.rec.minutes_late||0) > 0 && (
                      <p className="text-xs text-amber-500 font-bold">+{selected.rec.minutes_late}min</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Salida</p>
                    <p className="text-base font-black text-emerald-600">{fmtTime(selected.rec.check_out)||'—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Trabajado</p>
                    <p className="text-base font-black text-gray-700">
                      {selected.rec.minutes_worked ? minsToHM(selected.rec.minutes_worked) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* JUSTIFICACIÓN */}
            {selected.rec?.status==='justified' && selected.rec?.justification && (
              <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
                <p className="text-xs font-bold text-amber-700 mb-1">Justificación</p>
                <p className="text-sm text-amber-800">"{selected.rec.justification}"</p>
              </div>
            )}

            {/* DÍA LIBRE SIN HORARIO */}
            {!selected.isHoliday && !selected.hasShift && !selected.exception && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-2xl">☀️</span>
                <p className="text-sm text-gray-500">No tenés jornada asignada este día</p>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
