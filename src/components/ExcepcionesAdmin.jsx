import { useState, useEffect, useCallback } from 'react';
import {
  getExceptionsForMonth, upsertScheduleException, deleteScheduleException
} from '../lib/supabase';

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}) : '—';
const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'}) : '—';

const TYPE_META = {
  free:   { label:'No trabaja',       icon:'🚫', color:'red',    bg:'bg-red-50',    text:'text-red-600',    border:'border-red-200' },
  half:   { label:'Media jornada',    icon:'🕐', color:'amber',  bg:'bg-amber-50',  text:'text-amber-700',  border:'border-amber-200' },
  custom: { label:'Horario especial', icon:'⏰', color:'sky',    bg:'bg-sky-50',    text:'text-sky-700',    border:'border-sky-200' },
};

function ExcModal({ employees, date, existing, adminId, onSave, onClose }) {
  const [empId,    setEmpId]    = useState('all');
  const [type,     setType]     = useState('free');
  const [start,    setStart]    = useState('09:00');
  const [end,      setEnd]      = useState('13:00');
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  const selectedEmps = empId === 'all' ? employees : employees.filter(e=>e.id===empId);

  const doSave = async () => {
    if (!selectedEmps.length) return setErr('Elegí al menos un empleado');
    if ((type==='custom'||type==='half') && (!start||!end)) return setErr('Ingresá horario de entrada y salida');
    if (start >= end) return setErr('La hora de salida debe ser después de la entrada');
    setSaving(true);
    try {
      await Promise.all(selectedEmps.map(emp =>
        upsertScheduleException({
          employeeId: emp.id, date,
          type, startTime: type!=='free'?start:null,
          endTime: type!=='free'?end:null,
          note, createdBy: adminId,
        })
      ));
      onSave();
      onClose();
    } catch(e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Excepción de horario</h2>
          <p className="text-sm text-sky-600 font-semibold capitalize">{fmtDate(date)}</p>
        </div>

        {/* Empleado */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">¿Para quién?</label>
          <select value={empId} onChange={e=>setEmpId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-gray-50">
            <option value="all">Todos los empleados</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Tipo de excepción</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TYPE_META).map(([key,t])=>(
              <button key={key} onClick={()=>setType(key)}
                className={`py-3 rounded-2xl border-2 text-xs font-bold transition-all flex flex-col items-center gap-1
                  ${type===key?`${t.border} ${t.bg} ${t.text}`:'border-gray-200 text-gray-400 bg-white'}`}>
                <span className="text-xl">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Horario (solo si no es libre) */}
        {type!=='free'&&(
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Entrada</label>
              <input type="time" value={start} onChange={e=>setStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Salida</label>
              <input type="time" value={end} onChange={e=>setEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
          </div>
        )}

        {/* Nota */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nota (visible para el empleado)</label>
          <input value={note} onChange={e=>setNote(e.target.value)}
            placeholder="Víspera de Sucot, Día de ayuno, Reunión especial..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
        </div>

        {/* Preview */}
        {selectedEmps.length>0&&(
          <div className={`rounded-2xl px-4 py-3 border ${TYPE_META[type].bg} ${TYPE_META[type].border}`}>
            <p className={`text-xs font-bold ${TYPE_META[type].text}`}>
              {TYPE_META[type].icon} {selectedEmps.length===employees.length?'Todos los empleados':selectedEmps.map(e=>e.name).join(', ')}
            </p>
            <p className={`text-xs ${TYPE_META[type].text} mt-0.5`}>
              {type==='free'?'No trabaja ese día':
               type==='half'?`Media jornada: ${start} — ${end}`:
               `Horario especial: ${start} — ${end}`}
              {note&&` · "${note}"`}
            </p>
          </div>
        )}

        {err&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{err}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doSave} disabled={saving}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Guardando...':'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExcepcionesAdmin({ employees, adminId, showToast }) {
  const [month,      setMonth]      = useState(new Date().toISOString().slice(0,7));
  const [exceptions, setExceptions] = useState([]);
  const [showModal,  setShowModal]  = useState(false);
  const [selDate,    setSelDate]    = useState('');

  const load = useCallback(async () => {
    const data = await getExceptionsForMonth(month).catch(()=>[]);
    setExceptions(data);
  }, [month]);

  useEffect(()=>{ load(); }, [load]);

  const handleDelete = async (id) => {
    await deleteScheduleException(id);
    await load();
    showToast('Excepción eliminada');
  };

  const openNew = (date) => { setSelDate(date); setShowModal(true); };

  // Group by date
  const byDate = {};
  exceptions.forEach(e => { if(!byDate[e.date]) byDate[e.date]=[]; byDate[e.date].push(e); });
  const sortedDates = Object.keys(byDate).sort();

  // Generate quick-access dates for this month
  const [y,m] = month.split('-').map(Number);
  const daysInMonth = new Date(y,m,0).getDate();
  const allDates = Array.from({length:daysInMonth},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Excepciones de horario</h2>
          <p className="text-sm text-gray-400">Días donde algún empleado trabaja diferente o no trabaja</p>
        </div>
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
          className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
      </div>

      {/* Info box */}
      <div className="bg-sky-50 border border-sky-100 rounded-3xl px-5 py-4 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">ℹ️</span>
        <div className="text-xs text-sky-700 space-y-1">
          <p className="font-bold">¿Cómo funciona?</p>
          <p>Cargás una excepción para un día específico: <span className="font-semibold">No trabaja</span>, <span className="font-semibold">Media jornada</span> o <span className="font-semibold">Horario especial</span>. El empleado lo ve en su Calendario y en "Mi horario" ese día. La excepción tiene prioridad sobre el horario regular.</p>
        </div>
      </div>

      {/* Quick date selector */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Agregar excepción para un día</p>
        <div className="flex gap-1.5 flex-wrap">
          {allDates.filter(d=>d>=today).slice(0,14).map(d=>{
            const dow = new Date(d+'T12:00:00').getDay();
            const hasExc = !!byDate[d];
            return (
              <button key={d} onClick={()=>openNew(d)}
                className={`flex flex-col items-center px-2.5 py-2 rounded-2xl border-2 text-xs font-bold transition-all
                  ${hasExc?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500 hover:border-sky-300 hover:bg-sky-50'}`}>
                <span className="text-gray-400" style={{fontSize:'9px'}}>{DAYS[dow]}</span>
                <span>{parseInt(d.split('-')[2])}</span>
                {hasExc&&<span style={{fontSize:'8px'}} className="text-sky-500">✓</span>}
              </button>
            );
          })}
          <button onClick={()=>{ setSelDate(''); setShowModal(true); }}
            className="flex flex-col items-center justify-center px-2.5 py-2 rounded-2xl border-2 border-dashed border-gray-300 text-xs text-gray-400 hover:border-sky-400 hover:text-sky-600">
            <span>+</span>
            <span style={{fontSize:'9px'}}>otro</span>
          </button>
        </div>
      </div>

      {/* Exceptions list */}
      {sortedDates.length===0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">📅</p>
          <p className="text-sm font-bold text-gray-700">Sin excepciones este mes</p>
          <p className="text-xs text-gray-400 mt-1">Tocá un día arriba para agregar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDates.map(date=>(
            <div key={date} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                <div>
                  <p className="text-sm font-bold text-gray-900 capitalize">{fmtDate(date)}</p>
                </div>
                <button onClick={()=>openNew(date)}
                  className="text-xs text-sky-600 font-bold px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100">
                  + Agregar
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {byDate[date].map(exc=>{
                  const t = TYPE_META[exc.type];
                  const emp = exc.profiles;
                  return (
                    <div key={exc.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${t.bg}`}>
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{emp?.name||'?'}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${t.bg} ${t.text}`}>{t.label}</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {exc.type==='free'?'No trabaja':
                           `${exc.start_time?.slice(0,5)||''} — ${exc.end_time?.slice(0,5)||''}`}
                          {exc.note&&<span className="italic"> · "{exc.note}"</span>}
                        </p>
                      </div>
                      <button onClick={()=>handleDelete(exc.id)}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal&&(
        <ExcModal
          employees={employees}
          date={selDate || today}
          existing={selDate?byDate[selDate]||[]:[]}
          adminId={adminId}
          onSave={load}
          onClose={()=>setShowModal(false)}
        />
      )}
    </div>
  );
}
