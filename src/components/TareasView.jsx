import { useState, useEffect } from 'react';
import { getMyTasks, updateTaskStatus, TASK_PRIORITIES } from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'}) : null;

const priorityColor = p => ({low:'border-l-gray-300',normal:'border-l-sky-400',high:'border-l-amber-400',urgent:'border-l-red-500'}[p]||'border-l-gray-300');
const priorityBg   = p => ({low:'bg-gray-50',normal:'bg-sky-50',high:'bg-amber-50',urgent:'bg-red-50'}[p]||'bg-gray-50');

function CompleteModal({task, onDone, onClose}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const doComplete = async () => {
    setSaving(true);
    await onDone(task.id, notes);
    setSaving(false);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Completar tarea</h2>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="font-bold text-gray-900 text-sm">{task.title}</p>
          {task.description&&<p className="text-xs text-gray-500 mt-1">{task.description}</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nota de cierre (opcional)</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
            placeholder="Cómo lo resolviste, resultado..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doComplete} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>
            {saving?'Guardando...':'✓ Marcar completa'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TareasView({ profile }) {
  const [tasks,    setTasks]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [complete, setComplete] = useState(null);
  const [toast,    setToast]    = useState(null);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const load = async () => { setLoading(true); const d=await getMyTasks(profile.id).catch(()=>[]); setTasks(d); setLoading(false); };
  useEffect(()=>{ load(); },[profile.id]);

  const handleStart = async (id) => {
    await updateTaskStatus(id,'in_progress');
    setTasks(p=>p.map(t=>t.id===id?{...t,status:'in_progress'}:t));
    showToast('Tarea iniciada');
  };

  const handleComplete = async (id, notes) => {
    await updateTaskStatus(id,'done',notes);
    setTasks(p=>p.filter(t=>t.id!==id));
    showToast('✓ Tarea completada');
  };

  const pending    = tasks.filter(t=>t.status==='pending');
  const inProgress = tasks.filter(t=>t.status==='in_progress');
  const today      = new Date().toISOString().split('T')[0];
  const overdue    = tasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=='done');

  return (
    <div className="space-y-4">
      {toast&&<div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl text-white ${toast.type==='error'?'bg-red-500':'bg-emerald-500'}`}>{toast.msg}</div>}

      {loading&&<p className="text-sm text-gray-400 text-center py-8">Cargando tareas...</p>}

      {!loading&&tasks.length===0&&(
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-bold text-gray-700">¡Sin tareas pendientes!</p>
          <p className="text-xs text-gray-400 mt-1">El admin te asignará tareas cuando las haya</p>
        </div>
      )}

      {overdue.length>0&&(
        <div className="bg-red-50 border border-red-200 rounded-3xl p-4">
          <p className="text-xs font-bold text-red-700 mb-2">⚠️ Tareas vencidas</p>
          <div className="space-y-2">
            {overdue.map(t=>(
              <div key={t.id} className="bg-white rounded-2xl p-3 border border-red-100">
                <p className="text-sm font-bold text-red-700">{t.title}</p>
                <p className="text-xs text-red-400">Vencía: {fmtDate(t.due_date)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {inProgress.length>0&&(
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">En progreso</p>
          {inProgress.map(t=>(
            <div key={t.id} className={`bg-white rounded-3xl shadow-sm border-l-4 border border-gray-100 p-4 ${priorityColor(t.priority)}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-gray-900">{t.title}</p>
                    <span className="text-xs text-sky-600 font-semibold bg-sky-50 px-2 py-0.5 rounded-full">En progreso</span>
                  </div>
                  {t.description&&<p className="text-xs text-gray-500 mb-2">{t.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    {t.due_date&&<span>📅 {fmtDate(t.due_date)}</span>}
                    <span>{TASK_PRIORITIES[t.priority]?.icon} {TASK_PRIORITIES[t.priority]?.label}</span>
                    {t.profiles&&<span>De: {t.profiles.name}</span>}
                  </div>
                </div>
                <button onClick={()=>setComplete(t)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0"
                  style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>
                  ✓ Completar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length>0&&(
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide px-1">Pendientes ({pending.length})</p>
          {pending.map(t=>(
            <div key={t.id} className={`bg-white rounded-3xl shadow-sm border-l-4 border border-gray-100 p-4 ${priorityColor(t.priority)}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 mb-1">{t.title}</p>
                  {t.description&&<p className="text-xs text-gray-500 mb-2">{t.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                    {t.due_date&&<span className={t.due_date<today?'text-red-500 font-bold':''}}>📅 {fmtDate(t.due_date)}</span>}
                    <span>{TASK_PRIORITIES[t.priority]?.icon} {TASK_PRIORITIES[t.priority]?.label}</span>
                    {t.profiles&&<span>De: {t.profiles.name}</span>}
                  </div>
                </div>
                <button onClick={()=>handleStart(t.id)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 flex-shrink-0">
                  Iniciar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {complete&&<CompleteModal task={complete} onDone={handleComplete} onClose={()=>setComplete(null)}/>}
    </div>
  );
}
