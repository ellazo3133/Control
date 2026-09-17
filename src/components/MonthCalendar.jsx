// Calendario visual mensual - usado en admin y empleado
import { useState } from 'react';
const DAYS_HEADER = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : null;
const timeToMins = t => { if(!t)return 0; const[h,m]=(t.slice(0,5)).split(':').map(Number);return h*60+m; };

export default function MonthCalendar({ month, records, schedMap, holidays, exceptions, onDayClick, today }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m-1, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(y, m, 0).getDate();
  const holidaySet = new Set((holidays||[]).map(h=>h.date));
  const todayISO = today || new Date().toISOString().split('T')[0];

  // Build grid cells (blanks + days)
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2,'0')}`;
    const dow = new Date(date+'T12:00:00').getDay();
    const sched = schedMap[dow];
    const rec = (records||[]).find(r => r.date === date || r.date === date.slice(0,10));
    const isHoliday = holidaySet.has(date);
    const exception = (exceptions||[]).find(e=>e.date===date);
    const isFuture = date > todayISO;
    const isToday = date === todayISO;
    const hasShift = sched?.active;

    let excState = exception ? (exception.type==='free'?'excepcion_libre':'excepcion_horario') : null;
    let estado = 'libre';
    if (isHoliday) estado = 'feriado';
    else if (!hasShift) estado = 'libre';
    else if (isFuture) estado = 'futuro';
    else if (rec?.check_in) {
      const ci = new Date(rec.check_in);
      const actualStart = ci.getHours()*60+ci.getMinutes();
      const expectedStart = timeToMins(sched.start_time);
      const late = Math.max(0, actualStart - expectedStart - 15);
      estado = late > 0 ? 'tarde' : 'ok';
    }
    else if (rec?.status==='justified') estado = 'justificada';
    else estado = 'ausente';

    cells.push({ d, date, dow, sched, rec, isHoliday, isFuture, isToday, hasShift, estado });
  }

  const bgMap = {
    excepcion_libre:   'bg-red-300',
    excepcion_horario: 'bg-indigo-400',
    ok:         'bg-emerald-500',
    tarde:      'bg-amber-400',
    ausente:    'bg-red-400',
    justificada:'bg-amber-200',
    feriado:    'bg-violet-400',
    libre:      'bg-gray-100',
    futuro:     'bg-gray-100',
  };

  const textMap = {
    ok:'text-white', tarde:'text-white', ausente:'text-white',
    justificada:'text-amber-800', feriado:'text-white',
    libre:'text-gray-400', futuro:'text-gray-300',
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Month header */}
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-bold text-gray-700 capitalize">
          {new Date(y, m-1, 1).toLocaleDateString('es-AR',{month:'long',year:'numeric'})}
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
          if (!cell) return <div key={`blank-${i}`} className="bg-white h-14 sm:h-16"/>;
          const canClick = cell.hasShift && !cell.isFuture && onDayClick;
          return (
            <div key={cell.date} style={{position:"relative"}}
              onClick={() => {
                if (cell.isHoliday||cell.exception) { setSelectedDay(selectedDay===cell.date?null:cell.date); return; }
                if (canClick) onDayClick(cell);
              }}
              className={`bg-white h-14 sm:h-16 flex flex-col items-center justify-start pt-1.5 gap-0.5 transition-all
                ${canClick ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''}
                ${cell.isToday ? 'ring-2 ring-sky-400 ring-inset' : ''}`}>

              {/* Date number */}
              <span className={`text-xs font-bold leading-none
                ${cell.isToday ? 'text-sky-600' : cell.isFuture ? 'text-gray-300' : 'text-gray-700'}`}>
                {cell.d}
              </span>

              {/* Status dot */}
              {cell.hasShift || cell.isHoliday ? (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bgMap[cell.estado]}`}>
                  {cell.estado==='excepcion_libre'&&<span className="text-white" style={{fontSize:'10px'}}>🚫</span>}
                  {cell.estado==='excepcion_horario'&&<span className="text-white" style={{fontSize:'10px'}}>⏰</span>}
                  {cell.estado==='ok'&&<span className="text-white text-xs">✓</span>}
                  {cell.estado==='tarde'&&<span className="text-white text-xs">⏰</span>}
                  {cell.estado==='ausente'&&<span className="text-white text-xs">✗</span>}
                  {cell.estado==='justificada'&&<span className="text-amber-700 text-xs">~</span>}
                  {cell.estado==='feriado'&&<span className="text-white text-xs">★</span>}
                  {(cell.estado==='libre'||cell.estado==='futuro')&&<span className="text-gray-300 text-xs">·</span>}
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center">
                  <span className="text-gray-200 text-xs">·</span>
                </div>
              )}

              {cell.exception&&selectedDay===cell.date&&(
                <div style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',background:'#312e81',color:'white',fontSize:'10px',borderRadius:'8px',padding:'4px 8px',whiteSpace:'nowrap',zIndex:20,pointerEvents:'none',marginBottom:'4px',boxShadow:'0 4px 12px rgba(0,0,0,0.3)'}}>
                  {cell.exception.type==='free'?'No trabaja hoy':
                   (cell.exception.start_time?.slice(0,5)||'')+' — '+(cell.exception.end_time?.slice(0,5)||'')}
                  {cell.exception.note?' · "'+cell.exception.note+'"':''}
                </div>
              )}
              {cell.isHoliday&&selectedDay===cell.date&&(
                <div style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',background:'#111827',color:'white',fontSize:'10px',borderRadius:'8px',padding:'4px 8px',whiteSpace:'nowrap',zIndex:20,pointerEvents:'none',marginBottom:'4px',boxShadow:'0 4px 12px rgba(0,0,0,0.3)'}}>
                  {(holidays||[]).find(h=>h.date===cell.date)?.name||'Feriado'}
                </div>
              )}
              {/* Time tiny */}
              {cell.rec?.check_in && (
                <span className="text-gray-400 font-mono leading-none" style={{fontSize:'9px'}}>
                  {fmtTime(cell.rec.check_in)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-50 flex flex-wrap gap-3">
        {[['bg-emerald-500','OK'],['bg-amber-400','Tarde'],['bg-red-400','Ausente'],['bg-amber-200','Justif.'],['bg-violet-400','Feriado']].map(([bg,label])=>(
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-full ${bg}`}/>
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
